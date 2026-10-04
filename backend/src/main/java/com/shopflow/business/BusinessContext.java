package com.shopflow.business;

import com.shopflow.tenancy.TenantContext;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The business (tenant) the current request works for (§0B.3). The id comes from {@link TenantContext}, which is
 * set from the access token; profile values used on hot paths (timezone, financial year, branding) are cached per
 * tenant and evicted when the business profile changes.
 */
@Component
public class BusinessContext {

    private final BusinessRepository businessRepository;
    private final Map<UUID, Snapshot> snapshots = new ConcurrentHashMap<>();

    BusinessContext(BusinessRepository businessRepository) {
        this.businessRepository = businessRepository;
    }

    public UUID businessId() {
        return TenantContext.requireTenantId();
    }

    public ZoneId zone() {
        return snapshot().zone();
    }

    public int financialYearStartMonth() {
        return snapshot().financialYearStartMonth();
    }

    /** Today's date in the business timezone (timestamps are stored in UTC, dates are business-local). */
    public LocalDate today() {
        return LocalDate.ofInstant(Instant.now(), zone());
    }

    /** Display name of the business (tenant branding, §0B.10). */
    public String displayName() {
        return snapshot().name();
    }

    /** Public URL of the business logo, or {@code null} when none is uploaded. */
    public String logoUrl() {
        return logoUrl(snapshot().logoFileId());
    }

    public static String logoUrl(UUID logoFileId) {
        return logoFileId == null ? null : "/api/v1/files/public/" + logoFileId;
    }

    /** Drops the cached profile of the current tenant (after a profile change). */
    void evict() {
        TenantContext.tenantId().ifPresent(snapshots::remove);
    }

    /** Drops the cached profile of any tenant (platform console edits). */
    public void evict(UUID businessId) {
        snapshots.remove(businessId);
    }

    private Snapshot snapshot() {
        UUID id = businessId();
        return snapshots.computeIfAbsent(id, key -> {
            Business business = businessRepository.findById(key)
                    .orElseThrow(() -> new IllegalStateException("Business " + key + " is not configured"));
            return new Snapshot(ZoneId.of(business.getTimezone()), business.getFinancialYearStartMonth(),
                    business.getName(), business.getLogoFileId());
        });
    }

    private record Snapshot(ZoneId zone, int financialYearStartMonth, String name, UUID logoFileId) {
    }
}
