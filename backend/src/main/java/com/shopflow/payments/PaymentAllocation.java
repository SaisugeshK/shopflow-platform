package com.shopflow.payments;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Links part of a payment to an invoice. Reversed allocations are flagged, never deleted. */
@Entity
@Table(name = "payment_allocations")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentAllocation {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID paymentId;
    @Column(nullable = false)
    private UUID invoiceId;
    @Column(nullable = false)
    private BigDecimal amount;
    private boolean reversed;
    @Column(nullable = false)
    private Instant createdAt;
    private Instant reversedAt;

    PaymentAllocation(UUID paymentId, UUID invoiceId, BigDecimal amount) {
        this.id = UUID.randomUUID();
        this.paymentId = paymentId;
        this.invoiceId = invoiceId;
        this.amount = amount;
        this.createdAt = Instant.now();
    }
}
