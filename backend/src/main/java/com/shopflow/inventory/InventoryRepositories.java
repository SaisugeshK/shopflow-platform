package com.shopflow.inventory;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InventoryRepositories {

    interface StockBalanceRepository extends JpaRepository<StockBalance, UUID> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT b FROM StockBalance b WHERE b.productId = :productId")
        Optional<StockBalance> findForUpdate(@Param("productId") UUID productId);

        List<StockBalance> findByProductIdIn(Collection<UUID> productIds);
    }

    interface StockMovementRepository extends JpaRepository<StockMovement, UUID>, JpaSpecificationExecutor<StockMovement> {
        Page<StockMovement> findByProductId(UUID productId, Pageable pageable);

        List<StockMovement> findByReferenceTypeAndReferenceId(String referenceType, UUID referenceId);
    }

    interface StockAdjustmentRepository extends JpaRepository<StockAdjustment, UUID> {
    }
}
