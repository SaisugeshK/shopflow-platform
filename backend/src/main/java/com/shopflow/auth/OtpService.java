package com.shopflow.auth;

import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Hashing;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.common.util.RateLimiter;
import com.shopflow.config.AppProperties;
import com.shopflow.integrations.ProviderException;
import com.shopflow.integrations.otp.OtpProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Backend-owned OTP lifecycle (§108): generation, hashed storage, expiry, attempt limits, resend cooldown,
 * invalidation of older codes and rate limiting. Transactions are explicit so failed attempts are persisted even
 * though the request is rejected.
 */
@Service
public class OtpService {

    private static final Logger log = LoggerFactory.getLogger(OtpService.class);

    private final OtpRequestRepository repository;
    private final OtpProvider provider;
    private final RateLimiter rateLimiter;
    private final AppProperties.Otp props;
    private final TransactionTemplate tx;

    public OtpService(OtpRequestRepository repository, OtpProvider provider, RateLimiter rateLimiter,
                      AppProperties properties, PlatformTransactionManager txManager) {
        this.repository = repository;
        this.provider = provider;
        this.rateLimiter = rateLimiter;
        this.props = properties.otp();
        this.tx = new TransactionTemplate(txManager);
        if (props.hashSecret() == null || props.hashSecret().length() < 16) {
            throw new IllegalStateException("OTP_HASH_SECRET must be set (at least 16 characters)");
        }
    }

    public OtpChallenge request(String rawMobile, String clientIp) {
        String mobile = MobileNumbers.normalize(rawMobile);
        if (clientIp != null && !rateLimiter.tryAcquire("otp-ip:" + clientIp, props.maxRequestsPerIp(), props.maxRequestsPerIpWindow())) {
            throw new BusinessException(ErrorCode.RATE_LIMITED, "Too many OTP requests. Please try again later.");
        }

        String otp = Hashing.randomDigits(props.length());
        UUID requestId = UUID.randomUUID();
        Instant expiresAt = Instant.now().plus(props.ttl());

        tx.executeWithoutResult(status -> {
            // A failed delivery does not start the cooldown, so the user can retry immediately.
            repository.findFirstByMobileNumberOrderByCreatedAtDesc(mobile)
                    .filter(last -> last.getStatus() != OtpRequest.Status.DELIVERY_FAILED)
                    .ifPresent(last -> {
                Instant retryAt = last.getCreatedAt().plus(props.resendCooldown());
                if (retryAt.isAfter(Instant.now())) {
                    long seconds = Math.max(1, Duration.between(Instant.now(), retryAt).toSeconds());
                    throw new BusinessException(ErrorCode.AUTH_OTP_COOLDOWN, "Please wait " + seconds + " seconds before requesting a new OTP");
                }
            });
            long recent = repository.countSince(mobile, Instant.now().minus(props.maxRequestsPerMobileWindow()));
            if (recent >= props.maxRequestsPerMobile()) {
                throw new BusinessException(ErrorCode.RATE_LIMITED, "Too many OTP requests for this number. Please try again later.");
            }
            repository.invalidateActive(mobile);
            repository.save(new OtpRequest(requestId, mobile, hash(requestId, otp), expiresAt, props.maxAttempts(), clientIp, provider.name()));
        });

        try {
            String ref = provider.send(mobile, otp, props.ttl());
            tx.executeWithoutResult(status -> repository.findById(requestId).ifPresent(r -> r.setProviderRef(ref)));
        } catch (ProviderException e) {
            log.warn("OTP delivery to {} failed: {}", MobileNumbers.mask(mobile), e.getMessage());
            tx.executeWithoutResult(status -> repository.findById(requestId).ifPresent(r -> r.setStatus(OtpRequest.Status.DELIVERY_FAILED)));
            throw new BusinessException(ErrorCode.AUTH_OTP_DELIVERY_FAILED,
                    e.timeout() ? "OTP service timed out. Please try again." : "Could not send the OTP. Please try again.");
        }
        return new OtpChallenge(requestId, mobile, MobileNumbers.mask(mobile), props.ttl().toSeconds(), props.resendCooldown().toSeconds());
    }

    /**
     * Verifies and consumes the OTP. The row is locked FOR UPDATE, so concurrent verifications of the same code
     * cannot both succeed.
     *
     * @return the verified, normalised mobile number
     */
    public String verify(String rawMobile, UUID requestId, String otp, String clientIp) {
        String mobile = MobileNumbers.normalize(rawMobile);
        if (clientIp != null && !rateLimiter.tryAcquire("otp-verify-ip:" + clientIp, props.maxRequestsPerIp() * 4, props.maxRequestsPerIpWindow())) {
            throw new BusinessException(ErrorCode.RATE_LIMITED, "Too many attempts. Please try again later.");
        }
        Outcome outcome = tx.execute(status -> {
            OtpRequest request = repository.findForUpdate(requestId).orElse(null);
            if (request == null || !request.getMobileNumber().equals(mobile)) {
                return Outcome.INVALID;
            }
            switch (request.getStatus()) {
                case CONSUMED, INVALIDATED, DELIVERY_FAILED -> {
                    return Outcome.INVALID;
                }
                case LOCKED -> {
                    return Outcome.LOCKED;
                }
                case EXPIRED -> {
                    return Outcome.EXPIRED;
                }
                case ACTIVE -> {
                }
            }
            if (request.getExpiresAt().isBefore(Instant.now())) {
                request.setStatus(OtpRequest.Status.EXPIRED);
                return Outcome.EXPIRED;
            }
            if (request.getAttempts() >= request.getMaxAttempts()) {
                request.setStatus(OtpRequest.Status.LOCKED);
                return Outcome.LOCKED;
            }
            request.setAttempts(request.getAttempts() + 1);
            if (otp == null || !Hashing.constantTimeEquals(request.getOtpHash(), hash(requestId, otp.trim()))) {
                if (request.getAttempts() >= request.getMaxAttempts()) {
                    request.setStatus(OtpRequest.Status.LOCKED);
                    return Outcome.LOCKED;
                }
                return Outcome.INVALID;
            }
            request.setStatus(OtpRequest.Status.CONSUMED);
            request.setConsumedAt(Instant.now());
            return Outcome.OK;
        });
        return switch (outcome) {
            case OK -> mobile;
            case EXPIRED -> throw new BusinessException(ErrorCode.AUTH_OTP_EXPIRED, "The OTP has expired. Please request a new one.");
            case LOCKED -> throw new BusinessException(ErrorCode.AUTH_TOO_MANY_ATTEMPTS, "Too many incorrect attempts. Please request a new OTP.");
            case INVALID -> throw new BusinessException(ErrorCode.AUTH_INVALID_OTP, "The OTP is incorrect");
        };
    }

    private String hash(UUID requestId, String otp) {
        return Hashing.hmacSha256Hex(props.hashSecret(), requestId + ":" + otp);
    }

    private enum Outcome { OK, INVALID, EXPIRED, LOCKED }

    public record OtpChallenge(UUID requestId, String mobileNumber, String maskedMobile, long expiresInSeconds,
                               long resendAfterSeconds) {
    }
}
