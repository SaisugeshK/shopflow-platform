package com.shopflow.payments;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Money received from a customer. {@link PaymentStatus} is the transaction-level status (§110); only CAPTURED
 * payments count towards the ledger, invoices and orders.
 */
@Entity
@Table(name = "payments")
@Getter
@Setter
public class Payment extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String paymentNumber;
    @Column(nullable = false)
    private UUID customerId;
    private UUID invoiceId;
    private UUID orderId;
    @Column(nullable = false)
    private BigDecimal amount;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentMethod method;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentStatus status;
    private String referenceNumber;
    private Instant paidAt;
    private UUID collectedBy;
    private String notes;
    private String provider;
    private String providerOrderId;
    private String providerPaymentId;
    private String failureReason;
    private BigDecimal allocatedAmount = BigDecimal.ZERO;
    private BigDecimal refundedAmount = BigDecimal.ZERO;
    private Instant cancelledAt;
    private UUID cancelledBy;
    private String cancelReason;
    private UUID createdBy;

    public BigDecimal unallocated() {
        return amount.subtract(allocatedAmount).subtract(refundedAmount).max(BigDecimal.ZERO);
    }
}
