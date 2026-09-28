package com.shopflow.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "stock_adjustments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StockAdjustment {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String adjustmentNumber;
    @Column(nullable = false)
    private UUID productId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StockMovement.MovementType adjustmentType;
    @Column(nullable = false)
    private BigDecimal quantity;
    @Column(nullable = false)
    private String reason;
    @Column(nullable = false)
    private UUID stockMovementId;
    @Column(nullable = false)
    private Instant createdAt;
    private UUID createdBy;

    StockAdjustment(UUID id, UUID businessId, String number, UUID productId, StockMovement.MovementType type,
                    BigDecimal quantity, String reason, UUID movementId, UUID createdBy) {
        this.id = id;
        this.businessId = businessId;
        this.adjustmentNumber = number;
        this.productId = productId;
        this.adjustmentType = type;
        this.quantity = quantity;
        this.reason = reason;
        this.stockMovementId = movementId;
        this.createdAt = Instant.now();
        this.createdBy = createdBy;
    }
}
