package com.shopflow.business;

import com.shopflow.config.AppProperties;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

/**
 * The single business this deployment serves. IDs are carried on every aggregate so the schema can later support
 * multiple shops/branches without a destructive redesign (§2).
 */
@Component
public class BusinessContext {

    private final UUID businessId;
    private final BusinessRepository businessRepository;
    private volatile Snapshot snapshot;

    BusinessContext(AppProperties properties, BusinessRepository businessRepository) {
        this.businessId = properties.business().defaultBusinessId();
        this.businessRepository = businessRepository;
    }

    public UUID businessId() {
        return businessId;
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

    void evict() {
        snapshot = null;
    }

    private Snapshot snapshot() {
        Snapshot current = snapshot;
        if (current == null) {
            Business business = businessRepository.findById(businessId)
                    .orElseThrow(() -> new IllegalStateException("Business " + businessId + " is not configured"));
            current = new Snapshot(ZoneId.of(business.getTimezone()), business.getFinancialYearStartMonth());
            snapshot = current;
        }
        return current;
    }

    private record Snapshot(ZoneId zone, int financialYearStartMonth) {
    }
}
