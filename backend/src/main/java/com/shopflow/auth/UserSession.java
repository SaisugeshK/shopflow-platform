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
    /** Tenant user (membership); null for a platform admin session. */
    private UUID userId;
    /** Platform admin (SUPER_ADMIN); null for a tenant session. */
    private UUID platformAdminId;
    /** Tenant of a userId session. */
    private UUID businessId;
    private String deviceInfo;
    private String ipAddress;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant lastUsedAt;
    private Instant revokedAt;
    private String revokeReason;

    static UserSession forUser(UUID userId, UUID businessId, String deviceInfo, String ipAddress) {
        UserSession s = new UserSession(deviceInfo, ipAddress);
        s.userId = userId;
        s.businessId = businessId;
        return s;
    }

    static UserSession forPlatformAdmin(UUID platformAdminId, String deviceInfo, String ipAddress) {
        UserSession s = new UserSession(deviceInfo, ipAddress);
        s.platformAdminId = platformAdminId;
        return s;
    }

    boolean isPlatform() {
        return platformAdminId != null;
    }

    /** The token subject: the user or the platform admin. */
    UUID subjectId() {
        return platformAdminId != null ? platformAdminId : userId;
    }

    private UserSession(String deviceInfo, String ipAddress) {
        this.id = UUID.randomUUID();
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
