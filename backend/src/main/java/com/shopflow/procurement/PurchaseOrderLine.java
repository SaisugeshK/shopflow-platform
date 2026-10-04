package com.shopflow.procurement;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** A purchase order line: what the business asks for and the supplier's answer (§0B.8). */
@Entity
@Table(name = "purchase_order_lines")
@Getter
@Setter
public class PurchaseOrderLine {

    @Id
    private UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "purchase_order_id")
    private PurchaseOrder purchaseOrder;
    private int lineNumber;
    /** Null for an extra line a supplier added; the business links a product before accepting it. */
    private UUID productId;
    @Column(nullable = false)
    private String description;
    private String hsnCode;
    @Column(nullable = false)
    private String unit;
    private BigDecimal unitFactor = BigDecimal.ONE;
    private BigDecimal quantity = BigDecimal.ZERO;
    private BigDecimal rate = BigDecimal.ZERO;
    private BigDecimal discountPercent = BigDecimal.ZERO;
    private BigDecimal taxRate = BigDecimal.ZERO;
    private BigDecimal taxableAmount = BigDecimal.ZERO;
    private BigDecimal taxAmount = BigDecimal.ZERO;
    private BigDecimal lineTotal = BigDecimal.ZERO;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Availability availability = Availability.AVAILABLE;
    private LocalDate deliveryDate;
    private String lineNote;
    private String substituteNote;
    @Column(nullable = false)
    private String addedBy = "BUSINESS";
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LineStatus status = LineStatus.OPEN;
    private BigDecimal receivedQuantity = BigDecimal.ZERO;

    public enum Availability { AVAILABLE, PARTIAL, UNAVAILABLE }

    public enum LineStatus { OPEN, ACCEPTED, REJECTED }

    public BigDecimal pendingQuantity() {
        return quantity.subtract(receivedQuantity).max(BigDecimal.ZERO);
    }
}
