package com.shopflow.payments;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payment_receipts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentReceipt {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID paymentId;
    @Column(nullable = false)
    private String receiptNumber;
    private UUID fileId;
    @Column(nullable = false)
    private Instant issuedAt;

    PaymentReceipt(UUID paymentId, String receiptNumber) {
        this.id = UUID.randomUUID();
        this.paymentId = paymentId;
        this.receiptNumber = receiptNumber;
        this.issuedAt = Instant.now();
    }
}
