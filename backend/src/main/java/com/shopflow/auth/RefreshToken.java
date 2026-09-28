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

/** Opaque refresh token; only an HMAC of the token value is stored. Rotated on every use. */
@Entity
@Table(name = "refresh_tokens")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID sessionId;
    @Column(nullable = false)
    private String tokenHash;
    @Column(nullable = false)
    private Instant expiresAt;
    @Column(nullable = false)
    private Instant createdAt;
    private Instant revokedAt;
    private UUID replacedById;

    RefreshToken(UUID sessionId, String tokenHash, Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.sessionId = sessionId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.createdAt = Instant.now();
    }
}
