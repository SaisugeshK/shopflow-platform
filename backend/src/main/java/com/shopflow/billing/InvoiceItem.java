package com.shopflow.billing;

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
@Table(name = "invoice_items")
@Getter
@Setter
public class InvoiceItem {

    @Id
    private UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id")
    private Invoice invoice;
    private int lineNumber;
    /** Base (stock) units per {@link #unit} — 1 for the product's own unit (§0B.7). */
    private BigDecimal unitFactor = BigDecimal.ONE;
    /** A free-goods line from a buy-X-get-Y scheme (rate 0). */
    private boolean freeItem;
    private UUID schemeId;
    private String schemeName;
    /** Serial numbers sold on this line, comma separated. */
    private String serialNumbers;
    /** Batches (and expiry) the stock came from. */
    private String batchDetails;
    @Column(nullable = false)
    private UUID productId;
    private UUID orderItemId;
    @Column(nullable = false)
    private String productName;
    private String description;
    private String sku;
    private String hsnCode;
    @Column(nullable = false)
    private String unit;
    private BigDecimal quantity;
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
    /** Internal cost snapshot for profit reporting; never exposed to customers. */
    private BigDecimal unitCost = BigDecimal.ZERO;
    private BigDecimal returnedQuantity = BigDecimal.ZERO;
}
