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

/** Immutable stock journal entry (§13). */
@Entity
@Table(name = "stock_movements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StockMovement {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID productId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MovementType movementType;
    @Column(nullable = false)
    private String direction;
    @Column(nullable = false)
    private BigDecimal quantity;
    private BigDecimal unitCost;
    @Column(nullable = false)
    private BigDecimal balanceAfter;
    @Column(nullable = false)
    private String referenceType;
    @Column(nullable = false)
    private UUID referenceId;
    private String referenceNumber;
    private String reason;
    @Column(nullable = false)
    private Instant createdAt;
    private UUID createdBy;

    StockMovement(UUID productId, MovementType type, BigDecimal quantity, BigDecimal unitCost, BigDecimal balanceAfter,
                  String referenceType, UUID referenceId, String referenceNumber, String reason, UUID createdBy) {
        this.id = UUID.randomUUID();
        this.productId = productId;
        this.movementType = type;
        this.direction = type.inbound() ? "IN" : "OUT";
        this.quantity = quantity;
        this.unitCost = unitCost;
        this.balanceAfter = balanceAfter;
        this.referenceType = referenceType;
        this.referenceId = referenceId;
        this.referenceNumber = referenceNumber;
        this.reason = reason;
        this.createdAt = Instant.now();
        this.createdBy = createdBy;
    }

    public enum MovementType {
        OPENING(true), PURCHASE_IN(true), SALE_OUT(false), SALES_RETURN_IN(true), PURCHASE_RETURN_OUT(false),
        DAMAGE_OUT(false), LOSS_OUT(false), ADJUSTMENT_IN(true), ADJUSTMENT_OUT(false);

        private final boolean inbound;

        MovementType(boolean inbound) {
            this.inbound = inbound;
        }

        public boolean inbound() {
            return inbound;
        }
    }
}
