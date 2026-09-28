package com.shopflow.auth;

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
@Table(name = "user_sessions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserSession {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID userId;
    private String deviceInfo;
    private String ipAddress;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant lastUsedAt;
    private Instant revokedAt;
    private String revokeReason;

    UserSession(UUID userId, String deviceInfo, String ipAddress) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.deviceInfo = deviceInfo;
        this.ipAddress = ipAddress;
        this.createdAt = Instant.now();
        this.lastUsedAt = this.createdAt;
    }

    boolean isActive() {
        return revokedAt == null;
    }

    void revoke(String reason) {
        if (revokedAt == null) {
            revokedAt = Instant.now();
            revokeReason = reason;
        }
    }
}
