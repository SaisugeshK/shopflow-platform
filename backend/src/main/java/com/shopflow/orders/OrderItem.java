package com.shopflow.orders;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Order line with a price/tax snapshot and partial-delivery quantity tracking (§20).
 * pending = accepted − delivered − cancelled.
 */
@Entity
@Table(name = "order_items")
@Getter
@Setter
public class OrderItem {

    @Id
    private UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private Order order;
    private int lineNumber;
    @Column(nullable = false)
    private UUID productId;
    @Column(nullable = false)
    private String productName;
    @Column(nullable = false)
    private String sku;
    private String hsnCode;
    @Column(nullable = false)
    private String unit;
    private BigDecimal orderedQuantity;
    private BigDecimal acceptedQuantity = BigDecimal.ZERO;
    private BigDecimal packedQuantity = BigDecimal.ZERO;
    private BigDecimal deliveredQuantity = BigDecimal.ZERO;
    private BigDecimal cancelledQuantity = BigDecimal.ZERO;
    private BigDecimal returnedQuantity = BigDecimal.ZERO;
    private BigDecimal invoicedQuantity = BigDecimal.ZERO;
    private BigDecimal reservedQuantity = BigDecimal.ZERO;
    private BigDecimal rate;
    private BigDecimal discountPercent = BigDecimal.ZERO;
    private BigDecimal discountAmount = BigDecimal.ZERO;
    private BigDecimal taxRate;
    private BigDecimal grossAmount;
    private BigDecimal taxableAmount;
    private BigDecimal cgstAmount;
    private BigDecimal sgstAmount;
    private BigDecimal igstAmount;
    private BigDecimal lineTotal;

    public BigDecimal pendingQuantity() {
        BigDecimal base = acceptedQuantity.signum() > 0 ? acceptedQuantity : orderedQuantity;
        return base.subtract(deliveredQuantity).subtract(cancelledQuantity).max(BigDecimal.ZERO);
    }
}
