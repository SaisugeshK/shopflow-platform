package com.shopflow.auth;

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

    public record OtpRequestResponse(UUID requestId, String maskedMobile, long expiresInSeconds, long resendAfterSeconds) {
    }

    public record OtpVerifyBody(@NotBlank @Size(max = 20) String mobileNumber,
                                @NotBlank @Pattern(regexp = "^[0-9]{4,8}$", message = "Enter the numeric OTP") String otp,
                                @NotNull UUID requestId,
                                @Size(max = 300) String deviceInfo) {
    }

    public record RefreshBody(@Size(max = 200) String refreshToken) {
    }

    public record CustomerInfo(UUID id, String customerCode, String shopName, String status) {
    }

    public record MeResponse(UUID id, String fullName, String mobileNumber, String email, String role,
                             List<String> permissions, CustomerInfo customer) {
    }

    /**
     * Either a signed-in session ({@code accessToken} etc.) or, for an unknown number, a registration token.
     * {@code refreshToken} is omitted from the body for web clients (sent as an HttpOnly cookie instead).
     */
    public record AuthResponse(boolean registrationRequired, String accessToken, Instant accessTokenExpiresAt,
                               String refreshToken, Instant refreshTokenExpiresAt, String registrationToken,
                               Instant registrationTokenExpiresAt, MeResponse user) {
    }
}
