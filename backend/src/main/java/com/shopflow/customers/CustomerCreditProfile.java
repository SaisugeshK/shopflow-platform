package com.shopflow.customers;

import com.shopflow.business.BusinessSettings.CreditPolicy;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "customer_credit_profiles")
@Getter
@Setter
public class CustomerCreditProfile {

    @Id
    private UUID customerId;
    private boolean creditEnabled;
    @Column(nullable = false)
    private BigDecimal creditLimit = BigDecimal.ZERO;
    private int creditDays;
    /** Null means the business-wide policy applies. */
    @Enumerated(EnumType.STRING)
    private CreditPolicy creditPolicy;
    @Column(nullable = false)
    private Instant updatedAt;
    private UUID updatedBy;
    @Version
    private Long version;

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }
}
