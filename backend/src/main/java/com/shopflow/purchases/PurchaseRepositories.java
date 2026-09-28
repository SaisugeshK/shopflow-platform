package com.shopflow.purchases;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PurchaseRepositories {

    interface PurchaseRepository extends JpaRepository<Purchase, UUID>, JpaSpecificationExecutor<Purchase> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT p FROM Purchase p WHERE p.id = :id")
        Optional<Purchase> findByIdForUpdate(@Param("id") UUID id);
    }

    interface PurchasePaymentRepository extends JpaRepository<PurchasePayment, UUID> {
        List<PurchasePayment> findByPurchaseIdOrderByPaidAtAsc(UUID purchaseId);
    }

    interface PurchaseReturnRepository extends JpaRepository<PurchaseReturn, UUID>, JpaSpecificationExecutor<PurchaseReturn> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT r FROM PurchaseReturn r WHERE r.id = :id")
        Optional<PurchaseReturn> findByIdForUpdate(@Param("id") UUID id);

        List<PurchaseReturn> findByPurchaseId(UUID purchaseId);
    }
}
