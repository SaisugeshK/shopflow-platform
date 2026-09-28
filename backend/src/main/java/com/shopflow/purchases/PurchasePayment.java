package com.shopflow.purchases;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Money paid to a supplier against a posted purchase. */
@Entity
@Table(name = "purchase_payments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PurchasePayment {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID purchaseId;
    @Column(nullable = false)
    private String paymentNumber;
    @Column(nullable = false)
    private BigDecimal amount;
    @Column(nullable = false)
    private String method;
    private String referenceNumber;
    @Column(nullable = false)
    private Instant paidAt;
    private String notes;
    @Column(nullable = false)
    private Instant createdAt;
    private UUID createdBy;

    PurchasePayment(UUID purchaseId, String number, BigDecimal amount, String method, String reference, Instant paidAt,
                    String notes, UUID createdBy) {
        this.id = UUID.randomUUID();
        this.purchaseId = purchaseId;
        this.paymentNumber = number;
        this.amount = amount;
        this.method = method;
        this.referenceNumber = reference;
        this.paidAt = paidAt;
        this.notes = notes;
        this.createdAt = Instant.now();
        this.createdBy = createdBy;
    }
}
