package com.shopflow.platform;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlatformAdminRepository extends JpaRepository<PlatformAdmin, UUID> {
    Optional<PlatformAdmin> findByMobileNumber(String mobileNumber);

    List<PlatformAdmin> findAllByOrderByFullNameAsc();

    /** Last sign-in time without the version check (simultaneous sign-ins must not conflict). */
    @Modifying
    @Query(value = "UPDATE platform_admins SET last_login_at = :at WHERE id = :id", nativeQuery = true)
    void touchLastLogin(@Param("id") UUID id, @Param("at") Instant at);
}
