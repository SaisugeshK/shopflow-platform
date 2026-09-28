package com.shopflow.purchases;

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

@Entity
@Table(name = "purchase_items")
@Getter
@Setter
public class PurchaseItem {

    @Id
    private UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "purchase_id")
    private Purchase purchase;
    private int lineNumber;
    @Column(nullable = false)
    private UUID productId;
    @Column(nullable = false)
    private String productName;
    private String hsnCode;
    @Column(nullable = false)
    private String unit;
    private BigDecimal quantity;
    private BigDecimal rate;
    private BigDecimal discountPercent;
    private BigDecimal discountAmount;
    private BigDecimal taxRate;
    private BigDecimal grossAmount;
    private BigDecimal taxableAmount;
    private BigDecimal cgstAmount;
    private BigDecimal sgstAmount;
    private BigDecimal igstAmount;
    private BigDecimal lineTotal;
    private BigDecimal returnedQuantity = BigDecimal.ZERO;
}
