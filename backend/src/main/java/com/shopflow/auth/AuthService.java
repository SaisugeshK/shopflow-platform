package com.shopflow.auth;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.auth.AuthDtos.AuthResponse;
import com.shopflow.auth.AuthDtos.CustomerInfo;
import com.shopflow.auth.AuthDtos.MeResponse;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Hashing;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.config.AppProperties;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerDtos.RegistrationRequest;
import com.shopflow.customers.CustomerService;
import com.shopflow.security.JwtService;
import com.shopflow.security.JwtService.IssuedToken;
import com.shopflow.security.Roles;
import com.shopflow.users.User;
import com.shopflow.users.UserService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Passwordless mobile + OTP authentication (§4, §5, §108). The role always comes from the account, never the client.
 */
@Service
public class AuthService {

    private final OtpService otpService;
    private final UserService userService;
    private final CustomerService customerService;
    private final JwtService jwtService;
    private final UserSessionRepository sessions;
    private final RefreshTokenRepository refreshTokens;
    private final SessionService sessionService;
    private final AuditService audit;
    private final AppProperties properties;
    private final TransactionTemplate tx;

    public AuthService(OtpService otpService, UserService userService, CustomerService customerService,
                       JwtService jwtService, UserSessionRepository sessions, RefreshTokenRepository refreshTokens,
                       SessionService sessionService, AuditService audit, AppProperties properties,
                       PlatformTransactionManager txManager) {
        this.otpService = otpService;
        this.userService = userService;
        this.customerService = customerService;
        this.jwtService = jwtService;
        this.sessions = sessions;
        this.refreshTokens = refreshTokens;
        this.sessionService = sessionService;
        this.audit = audit;
        this.properties = properties;
        this.tx = new TransactionTemplate(txManager);
        String refreshSecret = properties.security().jwtRefreshSecret();
        if (refreshSecret == null || refreshSecret.length() < 32) {
            throw new IllegalStateException("JWT_REFRESH_SECRET must be set and at least 32 characters long");
        }
    }

    public AuthResult verifyOtp(String rawMobile, UUID requestId, String otp, String deviceInfo, String ip) {
        String mobile;
        try {
            mobile = otpService.verify(rawMobile, requestId, otp, ip);
        } catch (BusinessException e) {
            audit.recordIndependently(null, null, AuditAction.LOGIN_FAILED, "AUTH", null,
                    Map.of("mobile", MobileNumbers.mask(safeNormalize(rawMobile)), "reason", e.code().name()));
            throw e;
        }
        Optional<User> existing = userService.findByMobile(mobile);
        if (existing.isEmpty()) {
            IssuedToken registration = jwtService.issueRegistrationToken(mobile);
            return new AuthResult(new AuthResponse(true, null, null, null, null, registration.value(),
                    registration.expiresAt(), null), null, null);
        }
        try {
            return tx.execute(status -> startSession(userService.get(existing.get().getId()), deviceInfo, ip));
        } catch (BusinessException e) {
            audit.recordIndependently(existing.get().getId(), existing.get().primaryRole(), AuditAction.LOGIN_FAILED,
                    "USER", existing.get().getId(), Map.of("reason", e.code().name()));
            throw e;
        }
    }

    /** Creates the customer account (PENDING_APPROVAL) for a mobile number that already passed OTP. */
    public AuthResult register(String verifiedMobile, RegistrationRequest request, String deviceInfo, String ip) {
        return tx.execute(status -> {
            Customer customer = customerService.register(verifiedMobile, request);
            return startSession(userService.get(customer.getUserId()), deviceInfo, ip);
        });
    }

    private AuthResult startSession(User user, String deviceInfo, String ip) {
        Optional<Customer> customer = assertCanSignIn(user);
        UserSession session = sessions.save(new UserSession(user.getId(), truncate(deviceInfo, 300), ip));
        String rawRefresh = Hashing.randomToken(48);
        Instant refreshExpiry = Instant.now().plus(properties.security().refreshTokenTtl());
        refreshTokens.save(new RefreshToken(session.getId(), hashRefresh(rawRefresh), refreshExpiry));
        userService.recordLogin(user);
        audit.recordAs(user.getId(), user.primaryRole(), AuditAction.LOGIN, "USER", user.getId(), null,
                Map.of("sessionId", session.getId()));
        IssuedToken access = accessToken(user, session.getId(), customer);
        return new AuthResult(new AuthResponse(false, access.value(), access.expiresAt(), rawRefresh, refreshExpiry,
                null, null, me(user, customer)), rawRefresh, refreshExpiry);
    }

    /**
     * Rotates the refresh token. Presenting an already-rotated token is treated as theft: the whole session is
     * revoked (§5 refresh token rotation).
     */
    public AuthResult refresh(String rawRefresh) {
        if (rawRefresh == null || rawRefresh.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN, "Refresh token is required");
        }
        RefreshOutcome outcome = tx.execute(status -> {
            RefreshToken token = refreshTokens.findByHashForUpdate(hashRefresh(rawRefresh)).orElse(null);
            if (token == null) {
                return RefreshOutcome.failed();
            }
            UserSession session = sessions.findById(token.getSessionId()).orElse(null);
            if (session == null || !session.isActive()) {
                return RefreshOutcome.failed();
            }
            if (token.getRevokedAt() != null) {
                sessionService.revokeSession(session.getId(), "REFRESH_TOKEN_REUSE");
                audit.recordAs(session.getUserId(), null, AuditAction.REFRESH_TOKEN_REUSE, "USER", session.getUserId(), null,
                        Map.of("sessionId", session.getId()));
                return RefreshOutcome.failed();
            }
            if (token.getExpiresAt().isBefore(Instant.now())) {
                return RefreshOutcome.failed();
            }
            User user = userService.get(session.getUserId());
            Optional<Customer> customer;
            try {
                customer = assertCanSignIn(user);
            } catch (BusinessException e) {
                sessionService.revokeSession(session.getId(), e.code().name());
                return RefreshOutcome.failed();
            }
            String newRaw = Hashing.randomToken(48);
            Instant expiry = Instant.now().plus(properties.security().refreshTokenTtl());
            RefreshToken replacement = refreshTokens.save(new RefreshToken(session.getId(), hashRefresh(newRaw), expiry));
            token.setRevokedAt(Instant.now());
            token.setReplacedById(replacement.getId());
            session.setLastUsedAt(Instant.now());
            IssuedToken access = accessToken(user, session.getId(), customer);
            return new RefreshOutcome(new AuthResult(new AuthResponse(false, access.value(), access.expiresAt(), newRaw,
                    expiry, null, null, me(user, customer)), newRaw, expiry));
        });
        if (outcome.result() == null) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN, "Session expired. Please sign in again.");
        }
        return outcome.result();
    }

    @Transactional
    public void logout(String rawRefresh, UUID currentSessionId) {
        UUID sessionId = currentSessionId;
        if (sessionId == null && rawRefresh != null && !rawRefresh.isBlank()) {
            sessionId = refreshTokens.findByHashForUpdate(hashRefresh(rawRefresh)).map(RefreshToken::getSessionId).orElse(null);
        }
        if (sessionId != null) {
            UUID sid = sessionId;
            sessions.findById(sid).ifPresent(s -> {
                sessionService.revokeSession(sid, "LOGOUT");
                audit.recordAs(s.getUserId(), null, AuditAction.LOGOUT, "USER", s.getUserId(), null, Map.of("sessionId", sid));
            });
        }
    }

    @Transactional(readOnly = true)
    public MeResponse me(UUID userId) {
        User user = userService.get(userId);
        return me(user, customerService.findByUserId(userId));
    }

    /** Blocked/inactive users and (per configuration) non-approved customers cannot sign in (§108 test matrix). */
    private Optional<Customer> assertCanSignIn(User user) {
        if (user.getStatus() != User.UserStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE, "This account is not active");
        }
        if (!user.hasRole(Roles.CUSTOMER)) {
            return Optional.empty();
        }
        Customer customer = customerService.findByUserId(user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_REGISTRATION_REQUIRED, "Customer registration is incomplete"));
        switch (customer.getStatus()) {
            case BLOCKED -> throw new BusinessException(ErrorCode.CUSTOMER_BLOCKED, "This customer account is blocked. Please contact the shop.");
            case REJECTED -> throw new BusinessException(ErrorCode.CUSTOMER_NOT_APPROVED, "This registration was not approved. Please contact the shop.");
            case PENDING_APPROVAL -> {
                if (properties.auth().pendingCustomerLogin() == AppProperties.Auth.PendingCustomerLogin.REJECT) {
                    throw new BusinessException(ErrorCode.CUSTOMER_NOT_APPROVED, "Your registration is awaiting approval");
                }
            }
            case APPROVED -> {
            }
        }
        return Optional.of(customer);
    }

    /** Pending customers receive a token without permissions: they can only see their registration status. */
    private IssuedToken accessToken(User user, UUID sessionId, Optional<Customer> customer) {
        Set<String> permissions = customer.isPresent() && !customer.get().isApproved()
                ? Set.of()
                : userService.effectivePermissions(user);
        return jwtService.issueAccessToken(user.getId(), user.primaryRole(), permissions, sessionId,
                customer.map(Customer::getId).orElse(null), customer.map(c -> c.getStatus().name()).orElse(null));
    }

    private MeResponse me(User user, Optional<Customer> customer) {
        List<String> permissions = customer.isPresent() && !customer.get().isApproved()
                ? List.of()
                : List.copyOf(userService.effectivePermissions(user));
        return new MeResponse(user.getId(), user.getFullName(), user.getMobileNumber(), user.getEmail(),
                user.primaryRole(), permissions,
                customer.map(c -> new CustomerInfo(c.getId(), c.getCustomerCode(), c.getShopName(), c.getStatus().name())).orElse(null));
    }

    private String hashRefresh(String raw) {
        return Hashing.hmacSha256Hex(properties.security().jwtRefreshSecret(), raw);
    }

    private static String safeNormalize(String raw) {
        try {
            return MobileNumbers.normalize(raw);
        } catch (BusinessException e) {
            return "invalid";
        }
    }

    private static String truncate(String s, int max) {
        return s == null ? null : s.substring(0, Math.min(s.length(), max));
    }

    public record AuthResult(AuthResponse response, String rawRefreshToken, Instant refreshExpiresAt) {
    }

    private record RefreshOutcome(AuthResult result) {
        static RefreshOutcome failed() {
            return new RefreshOutcome(null);
        }
    }
}
