package com.shopflow.notifications;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notification_events")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NotificationEvent {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID recipientUserId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Channel channel;
    @Column(nullable = false)
    private String eventType;
    @Column(nullable = false)
    private String title;
    private String body;
    private String entityType;
    private UUID entityId;
    private Instant readAt;
    @Column(nullable = false)
    private Instant createdAt;

    NotificationEvent(UUID recipientUserId, Channel channel, String eventType, String title, String body,
                      String entityType, UUID entityId) {
        this.id = UUID.randomUUID();
        this.recipientUserId = recipientUserId;
        this.channel = channel;
        this.eventType = eventType;
        this.title = title;
        this.body = body;
        this.entityType = entityType;
        this.entityId = entityId;
        this.createdAt = Instant.now();
    }

    public enum Channel { IN_APP, PUSH, WHATSAPP, SMS, EMAIL }
}
