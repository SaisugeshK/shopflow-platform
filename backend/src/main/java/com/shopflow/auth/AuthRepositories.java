package com.shopflow.auth;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface OtpRequestRepository extends JpaRepository<OtpRequest, UUID> {

    Optional<OtpRequest> findFirstByMobileNumberOrderByCreatedAtDesc(String mobileNumber);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM OtpRequest o WHERE o.id = :id")
    Optional<OtpRequest> findForUpdate(@Param("id") UUID id);

    @Query("SELECT count(o) FROM OtpRequest o WHERE o.mobileNumber = :mobile AND o.createdAt > :since")
    long countSince(@Param("mobile") String mobile, @Param("since") Instant since);

    @Modifying
    @Query("""
            UPDATE OtpRequest o SET o.status = com.shopflow.auth.OtpRequest.Status.INVALIDATED, o.version = o.version + 1
            WHERE o.mobileNumber = :mobile AND o.status = com.shopflow.auth.OtpRequest.Status.ACTIVE
            """)
    int invalidateActive(@Param("mobile") String mobile);
}

interface UserSessionRepository extends JpaRepository<UserSession, UUID> {
    List<UserSession> findByUserIdAndRevokedAtIsNull(UUID userId);
}

interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM RefreshToken t WHERE t.tokenHash = :hash")
    Optional<RefreshToken> findByHashForUpdate(@Param("hash") String hash);

    @Modifying
    @Query("UPDATE RefreshToken t SET t.revokedAt = :now WHERE t.sessionId = :sessionId AND t.revokedAt IS NULL")
    int revokeAllForSession(@Param("sessionId") UUID sessionId, @Param("now") Instant now);
}
