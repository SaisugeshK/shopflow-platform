package com.shopflow.suppliers;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

public interface SupplierRepositories {

    interface SupplierRepository extends JpaRepository<Supplier, UUID>, JpaSpecificationExecutor<Supplier> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT s FROM Supplier s WHERE s.id = :id")
        Optional<Supplier> findByIdForUpdate(@Param("id") UUID id);

        Optional<Supplier> findByUserId(UUID userId);
    }

    interface SupplierAddressRepository extends JpaRepository<SupplierAddress, UUID> {
        Optional<SupplierAddress> findFirstBySupplierIdOrderByDefaultAddressDescCreatedAtAsc(UUID supplierId);
    }

    interface SupplierLedgerRepository extends JpaRepository<SupplierLedgerEntry, UUID> {
        Page<SupplierLedgerEntry> findBySupplierId(UUID supplierId, Pageable pageable);

        @Query("SELECT COALESCE(SUM(e.credit) - SUM(e.debit), 0) FROM SupplierLedgerEntry e WHERE e.supplierId = :supplierId")
        BigDecimal balance(@Param("supplierId") UUID supplierId);
    }
}
