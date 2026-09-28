package com.shopflow.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only audit record. There are no setters; rows are never updated or deleted.
 */
@Entity
@Table(name = "audit_logs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuditLog {

    @Id
    private UUID id;
    private UUID actorUserId;
    private String actorRole;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AuditAction action;
    @Column(nullable = false)
    private String entityType;
    private UUID entityId;
    private String oldValue;
    private String newValue;
    private String ipAddress;
    private String userAgent;
    private String requestId;
    @Column(nullable = false)
    private Instant createdAt;

    AuditLog(UUID actorUserId, String actorRole, AuditAction action, String entityType, UUID entityId,
             String oldValue, String newValue, String ipAddress, String userAgent, String requestId) {
        this.id = UUID.randomUUID();
        this.actorUserId = actorUserId;
        this.actorRole = actorRole;
        this.action = action;
        this.entityType = entityType;
        this.entityId = entityId;
        this.oldValue = oldValue;
        this.newValue = newValue;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
        this.requestId = requestId;
        this.createdAt = Instant.now();
    }
}
