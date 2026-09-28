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

/** Raw webhook event, stored before processing for audit and duplicate detection (§97). */
@Entity
@Table(name = "payment_gateway_events")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentGatewayEvent {

    @Id
    private UUID id;
    @Column(nullable = false)
    private String provider;
    @Column(nullable = false)
    private String eventId;
    @Column(nullable = false)
    private String eventType;
    private String providerOrderId;
    private String providerPaymentId;
    private boolean signatureValid;
    @Column(nullable = false)
    private String payload;
    @Column(nullable = false)
    private String processingStatus;
    private String processingNote;
    @Column(nullable = false)
    private Instant receivedAt;
    private Instant processedAt;

    PaymentGatewayEvent(String provider, String eventId, String eventType, String providerOrderId,
                        String providerPaymentId, boolean signatureValid, String payload) {
        this.id = UUID.randomUUID();
        this.provider = provider;
        this.eventId = eventId;
        this.eventType = eventType;
        this.providerOrderId = providerOrderId;
        this.providerPaymentId = providerPaymentId;
        this.signatureValid = signatureValid;
        this.payload = payload;
        this.processingStatus = "RECEIVED";
        this.receivedAt = Instant.now();
    }
}
