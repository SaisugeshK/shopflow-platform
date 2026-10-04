package com.shopflow.platform;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request/response bodies of the Super Admin console API (§0B.5). */
public final class PlatformDtos {

    private PlatformDtos() {
    }

    public record TenantSummary(UUID id, String tenantCode, String name, String industry, String industryLabel,
                                String status, String ownerName, String ownerMobile, String city, String state,
                                long users, long customers, long products, long invoices, Instant lastActivityAt,
                                Instant createdAt, String logoUrl, String planCode) {
    }

    public record TenantUsage(long users, long staff, long customers, long suppliers, long products, long orders,
                              long invoices, BigDecimal salesLast30Days, long storageBytes, Instant lastActivityAt) {
    }

    public record ModuleState(String code, String label, boolean enabled, boolean enabledByDefault, List<String> requires) {
    }

    public record OwnerContact(UUID userId, String fullName, String mobileNumber, String email, String status,
                               Instant lastLoginAt) {
    }

    public record TenantDetail(UUID id, String tenantCode, String name, String legalName, String industry,
                               String industryLabel, String status, String statusReason, String ownerName,
                               String ownerMobile, String gstin, String addressLine1, String city, String state,
                               String stateCode, String pincode, String email, String phone, String logoUrl,
                               Instant createdAt, TenantUsage usage, List<ModuleState> modules,
                               List<OwnerContact> owners, String joinPath, String planCode, String planName,
                               String customDomain) {
    }

    public record CreateTenantRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 200) String legalName,
            @Pattern(regexp = "^$|^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$",
                    message = "3–40 characters: lowercase letters, digits and hyphens") String tenantCode,
            @NotBlank String industry,
            @NotBlank @Size(max = 100) String state,
            @NotBlank @Pattern(regexp = "^[0-9]{2}$", message = "Two-digit GST state code") String stateCode,
            @Size(max = 100) String city,
            @Pattern(regexp = "^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", message = "Enter a valid GSTIN") String gstin,
            @NotBlank @Size(max = 200) String ownerName,
            @NotBlank @Size(max = 20) String ownerMobile,
            @Size(max = 200) String email,
            Map<String, Boolean> modules,
            /* Plan (§0B.14); defaults to STARTER. */
            @Size(max = 30) String planCode) {
    }

    public record UpdateTenantRequest(@Size(max = 200) String name, @Size(max = 200) String legalName, String industry,
                                      @Size(max = 200) String ownerName, @Size(max = 20) String ownerMobile) {
    }

    public record StatusChangeRequest(@NotBlank @Size(min = 5, max = 500) String reason) {
    }

    public record ModulesRequest(@Valid Map<String, Boolean> modules) {
    }

    public record AddOwnerRequest(@NotBlank @Size(max = 200) String fullName, @NotBlank @Size(max = 20) String mobileNumber,
                                  @Size(max = 200) String email) {
    }

    public record PlatformAdminResponse(UUID id, String fullName, String mobileNumber, String status, Instant lastLoginAt,
                                        Instant createdAt) {
    }

    public record CreatePlatformAdminRequest(@NotBlank @Size(max = 200) String fullName,
                                             @NotBlank @Size(max = 20) String mobileNumber) {
    }

    public record UpdatePlatformAdminRequest(@Size(max = 200) String fullName,
                                             @Pattern(regexp = "^(ACTIVE|INACTIVE)$") String status) {
    }

    public record IndustryOption(String code, String label, String description, List<String> modules,
                                 List<String> units, List<String> categories) {
    }

    public record ModuleOption(String code, String label, boolean enabledByDefault, List<String> requires) {
    }

    public record PlatformAuditEntry(UUID id, UUID businessId, String businessName, String action, String entityType,
                                     UUID entityId, String actorRole, String actorName, String newValue, Instant createdAt) {
    }

    public record PlatformOverview(long tenants, long activeTenants, long suspendedTenants, long users,
                                   long invoicesLast30Days, BigDecimal salesLast30Days,
                                   Map<String, Long> tenantsByIndustry, List<TenantSummary> newestTenants) {
    }

    public record SupportAccessRequest(@NotBlank @Size(min = 10, max = 500) String reason,
                                       @Min(15) @Max(120) Integer minutes) {
    }

    /** A read-only, time-boxed access token into one tenant (no refresh token). */
    public record SupportAccessResponse(String accessToken, Instant expiresAt, UUID businessId, String businessName) {
    }
}
