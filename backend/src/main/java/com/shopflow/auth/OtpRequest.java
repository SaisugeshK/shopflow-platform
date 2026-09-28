package com.shopflow.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * One OTP challenge. Only an HMAC of the code is stored. The version column serialises concurrent verifications.
 */
@Entity
@Table(name = "otp_requests")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OtpRequest {

    @Id
    private UUID id;
    @Column(nullable = false)
    private String mobileNumber;
    @Column(nullable = false)
    private String otpHash;
    @Column(nullable = false)
    private Instant expiresAt;
    private int attempts;
    private int maxAttempts;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;
    private String requestedIp;
    @Column(nullable = false)
    private String provider;
    private String providerRef;
    private Instant consumedAt;
    @Column(nullable = false)
    private Instant createdAt;
    @Version
    private Long version;

    OtpRequest(UUID id, String mobileNumber, String otpHash, Instant expiresAt, int maxAttempts, String requestedIp, String provider) {
        this.id = id;
        this.mobileNumber = mobileNumber;
        this.otpHash = otpHash;
        this.expiresAt = expiresAt;
        this.maxAttempts = maxAttempts;
        this.requestedIp = requestedIp;
        this.provider = provider;
        this.status = Status.ACTIVE;
        this.createdAt = Instant.now();
    }

    public enum Status { ACTIVE, CONSUMED, INVALIDATED, LOCKED, EXPIRED, DELIVERY_FAILED }
}
