package com.shopflow.notifications;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Delivery history for one WhatsApp message (§32, §109). */
@Entity
@Table(name = "whatsapp_messages")
@Getter
@Setter
public class WhatsAppMessage extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    private UUID invoiceId;
    private UUID customerId;
    @Column(nullable = false)
    private String messageType;
    @Column(nullable = false)
    private String recipientNumber;
    @Column(nullable = false)
    private String provider;
    private String templateId;
    private String mediaId;
    private String providerMessageId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.QUEUED;
    private String failureReason;
    private int retryCount;
    private Instant nextRetryAt;
    private String lastWebhookEventId;
    @Column(nullable = false)
    private Instant queuedAt = Instant.now();
    private Instant sentAt;
    private Instant deliveredAt;
    private Instant readAt;
    private Instant failedAt;
    private UUID requestedBy;

    public enum Status {
        QUEUED(0), SENDING(1), SENT(2), DELIVERED(3), READ(4), FAILED(5);

        private final int rank;

        Status(int rank) {
            this.rank = rank;
        }

        public int rank() {
            return rank;
        }
    }
}
