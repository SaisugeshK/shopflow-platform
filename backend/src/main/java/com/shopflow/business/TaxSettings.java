package com.shopflow.business;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * Tax configuration. Only EXCLUSIVE (tax added on top of the taxable value) is implemented; the exact GST treatment
 * must be validated by the business's tax advisor before production use (§27).
 */
@Entity
@Table(name = "tax_settings")
@Getter
@Setter
public class TaxSettings {

    @Id
    private UUID businessId;
    @Column(nullable = false)
    private String calculationMode;
    private boolean roundOffEnabled;
    @Column(nullable = false)
    private BigDecimal defaultGstRate;
    @Column(nullable = false)
    private String allowedGstRates;
    @Column(nullable = false)
    private String interStateTaxType;
    @Column(nullable = false)
    private String intraStateTaxType;
    @Column(nullable = false)
    private Instant updatedAt;
    @Version
    private Long version;

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public List<BigDecimal> allowedRates() {
        return Arrays.stream(allowedGstRates.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(BigDecimal::new)
                .toList();
    }

    public boolean isAllowedRate(BigDecimal rate) {
        return allowedRates().stream().anyMatch(r -> r.compareTo(rate) == 0);
    }
}
