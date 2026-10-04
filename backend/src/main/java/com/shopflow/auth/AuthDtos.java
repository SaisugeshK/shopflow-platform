package com.shopflow.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record OtpRequestBody(@NotBlank @Size(max = 20) String mobileNumber) {
    }

    /** {@code demoOtp} is present only in demo mode (app.otp.show-in-response with the mock provider); never in production. */
    public record OtpRequestResponse(UUID requestId, String maskedMobile, long expiresInSeconds, long resendAfterSeconds,
                                     @JsonInclude(JsonInclude.Include.NON_NULL) String demoOtp) {
    }

    public record OtpVerifyBody(@NotBlank @Size(max = 20) String mobileNumber,
                                @NotBlank @Pattern(regexp = "^[0-9]{4,8}$", message = "Enter the numeric OTP") String otp,
                                @NotNull UUID requestId,
                                @Size(max = 300) String deviceInfo,
                                @Size(max = 40) String tenantCode) {
    }

    /** Pick the tenant to enter after OTP ({@code platform=true} for the Super Admin console). */
    public record SelectTenantBody(UUID businessId, Boolean platform) {
        public boolean isPlatform() {
            return Boolean.TRUE.equals(platform);
        }
    }

    /** A tenant the signed-in mobile number belongs to, or the platform console ({@code platform=true}). */
    public record TenantChoice(UUID businessId, String name, String logoUrl, String tenantCode, String role,
                               boolean platform) {
    }

    public record RefreshBody(@Size(max = 200) String refreshToken) {
    }

    public record CustomerInfo(UUID id, String customerCode, String shopName, String status) {
    }

    /** The supplier record behind a SUPPLIER login (supplier portal, §0B.8). */
    public record SupplierInfo(UUID id, String supplierCode, String name) {
    }

    /** The business the session belongs to — shown in the app's navigation (tenant branding, §0B.10). */
    public record BusinessInfo(UUID id, String name, String logoUrl) {
    }

    /**
     * {@code business} is null for a platform (SUPER_ADMIN) session. {@code memberships} lists every place this
     * mobile number can switch to (its tenants, plus the console for a platform admin). {@code modules} are the
     * tenant's enabled module codes (§0B.6); the apps hide menus of disabled modules. {@code support} marks a Super
     * Admin's read-only support view of the tenant.
     */
    public record MeResponse(UUID id, String fullName, String mobileNumber, String email, String role,
                             List<String> permissions, CustomerInfo customer, BusinessInfo business,
                             List<TenantChoice> memberships, List<String> modules, boolean support,
                             SupplierInfo supplier) {
    }

    /**
     * One of: a signed-in session ({@code accessToken} etc.); for a number new to the tenant, a registration token;
     * or, for a number that belongs to several tenants, a selection token plus the {@code tenants} to pick from.
     * {@code refreshToken} is omitted from the body for web clients (sent as an HttpOnly cookie instead).
     */
    public record AuthResponse(boolean registrationRequired, String accessToken, Instant accessTokenExpiresAt,
                               String refreshToken, Instant refreshTokenExpiresAt, String registrationToken,
                               Instant registrationTokenExpiresAt, MeResponse user,
                               boolean selectionRequired, String selectionToken, List<TenantChoice> tenants,
                               BusinessInfo registrationBusiness) {

        static AuthResponse session(String accessToken, Instant accessExpiresAt, String refreshToken,
                                    Instant refreshExpiresAt, MeResponse user) {
            return new AuthResponse(false, accessToken, accessExpiresAt, refreshToken, refreshExpiresAt, null, null,
                    user, false, null, null, null);
        }

        static AuthResponse registration(String registrationToken, Instant expiresAt, BusinessInfo business) {
            return new AuthResponse(true, null, null, null, null, registrationToken, expiresAt, null, false, null,
                    null, business);
        }

        static AuthResponse selection(String selectionToken, List<TenantChoice> tenants) {
            return new AuthResponse(false, null, null, null, null, null, null, null, true, selectionToken, tenants,
                    null);
        }

        AuthResponse withoutRefreshToken() {
            return new AuthResponse(registrationRequired, accessToken, accessTokenExpiresAt, null, refreshTokenExpiresAt,
                    registrationToken, registrationTokenExpiresAt, user, selectionRequired, selectionToken, tenants,
                    registrationBusiness);
        }
    }
}
