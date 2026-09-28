package com.shopflow.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * Typed application configuration. Secrets come from environment variables only (see .env.example).
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String env,
        Business business,
        Security security,
        Otp otp,
        Auth auth,
        Payment payment,
        WhatsApp whatsapp,
        EInvoice einvoice,
        Storage storage,
        DevTools devTools) {

    public record Business(UUID defaultBusinessId) {
    }

    public record Security(String jwtAccessSecret, String jwtRefreshSecret, Duration accessTokenTtl,
                           Duration refreshTokenTtl, Duration registrationTokenTtl, String issuer,
                           List<String> corsAllowedOrigins, boolean refreshCookieSecure) {
    }

    public record Otp(String provider, int length, Duration ttl, int maxAttempts, Duration resendCooldown,
                      int maxRequestsPerMobile, Duration maxRequestsPerMobileWindow, int maxRequestsPerIp,
                      Duration maxRequestsPerIpWindow, String hashSecret, String providerUrl, String providerKey,
                      Duration providerTimeout) {
    }

    public record Auth(PendingCustomerLogin pendingCustomerLogin) {
        public enum PendingCustomerLogin { ALLOW_LIMITED, REJECT }
    }

    public record Payment(String provider, String providerUrl, String providerKey, String webhookSecret,
                          Duration providerTimeout) {
    }

    public record WhatsApp(String provider, String providerUrl, String providerToken, String webhookSecret,
                           int maxRetries, Duration retryBaseDelay, Duration providerTimeout, String mockFailureSuffix) {
    }

    public record EInvoice(String provider, boolean enabled) {
    }

    public record Storage(String provider, String localRoot, String endpoint, String bucket, String accessKey,
                          String secretKey) {
    }

    public record DevTools(boolean enabled) {
    }
}
