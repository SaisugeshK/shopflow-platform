package com.shopflow.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Materialised per-product balance, updated only by {@link InventoryService} in the same transaction as the stock
 * movement journal. available = onHand - reserved.
 */
@Entity
@Table(name = "stock_balances")
@Getter
@Setter(AccessLevel.PACKAGE)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StockBalance {

    @Id
    private UUID productId;
    @Column(nullable = false)
    private BigDecimal onHand;
    @Column(nullable = false)
    private BigDecimal reserved;
    @Column(nullable = false)
    private Instant updatedAt;
    @Version
    private Long version;

    StockBalance(UUID productId) {
        this.productId = productId;
        this.onHand = BigDecimal.ZERO;
        this.reserved = BigDecimal.ZERO;
    }

    public BigDecimal available() {
        return onHand.subtract(reserved);
    }

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }
}
