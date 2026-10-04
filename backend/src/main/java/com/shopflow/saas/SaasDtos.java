package com.shopflow.saas;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Plans, usage and self-signup (§0B.14). */
public final class SaasDtos {

    private SaasDtos() {
    }

    /** A plan; null limits are unlimited. */
    public record PlanResponse(String code, String name, String description, BigDecimal priceMonthly, Integer maxStaff,
                               Integer maxProducts, Integer maxCustomers, Integer maxInvoicesPerMonth, Integer maxBranches,
                               Integer maxStorageMb, boolean active) {
    }

    public record Usage(long staff, long products, long customers, long invoicesThisMonth, long branches, long storageMb) {
    }

    public record SubscriptionResponse(PlanResponse plan, Usage usage, Instant planChangedAt) {
    }

    public record ChangePlanRequest(@NotBlank @Size(max = 30) String planCode) {
    }

    public record DomainRequest(@Pattern(regexp = "^$|^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$",
            message = "Enter a domain like shop.example.com") String domain) {
    }

    public record SignupOtpRequest(@NotBlank @Size(max = 20) String mobileNumber) {
    }

    public record SignupOtpResponse(UUID requestId, String maskedMobile, long expiresInSeconds, long resendAfterSeconds, String demoOtp) {
    }

    public record SignupRequest(@NotNull UUID requestId,
                                @NotBlank @Size(max = 10) String otp,
                                @NotBlank @Size(max = 20) String mobileNumber,
                                @NotBlank @Size(max = 200) String businessName,
                                @Size(max = 200) String legalName,
                                @NotBlank @Size(max = 200) String ownerName,
                                @Size(max = 200) String email,
                                @NotBlank @Size(max = 100) String state,
                                @NotBlank @Pattern(regexp = "^[0-9]{2}$", message = "Two-digit GST state code") String stateCode,
                                @Size(max = 100) String city,
                                @Pattern(regexp = "^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", message = "Enter a valid GSTIN") String gstin,
                                @NotBlank String industry,
                                @Size(max = 30) String planCode,
                                @Size(max = 1000) String message) {
    }

    public record SignupResponse(UUID id, String businessName, String legalName, String ownerName, String ownerMobile,
                                 String email, String state, String stateCode, String city, String gstin, String industry,
                                 String planCode, String message, String status, String decisionReason, UUID businessId,
                                 String tenantCode, Instant decidedAt, Instant createdAt) {
    }

    public record ApproveSignupRequest(@Pattern(regexp = "^$|^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$",
            message = "3–40 characters: lowercase letters, digits and hyphens") String tenantCode,
                                       @Size(max = 30) String planCode) {
    }

    public record RejectSignupRequest(@NotBlank @Size(min = 5, max = 500) String reason) {
    }
}
