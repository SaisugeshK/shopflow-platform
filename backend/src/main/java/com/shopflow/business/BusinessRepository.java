package com.shopflow.business;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** Businesses are the tenants (§0B); the platform console reads across them with platform access. */
public interface BusinessRepository extends JpaRepository<Business, UUID> {
    Optional<Business> findByTenantCode(String tenantCode);

    boolean existsByTenantCode(String tenantCode);
}
