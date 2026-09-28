package com.shopflow.purchases;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "purchases")
@Getter
@Setter
public class Purchase extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String purchaseNumber;
    @Column(nullable = false)
    private LocalDate purchaseDate;
    @Column(nullable = false)
    private UUID supplierId;
    private String supplierInvoiceNumber;
    private LocalDate supplierInvoiceDate;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.DRAFT;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentStatus paymentStatus = PaymentStatus.UNPAID;
    private boolean interState;
    private BigDecimal subtotal;
    private BigDecimal discountTotal;
    private BigDecimal taxableTotal;
    private BigDecimal cgstTotal;
    private BigDecimal sgstTotal;
    private BigDecimal igstTotal;
    private BigDecimal roundOff;
    private BigDecimal grandTotal;
    private BigDecimal paidAmount = BigDecimal.ZERO;
    private String notes;
    private Instant postedAt;
    private UUID postedBy;
    private Instant cancelledAt;
    private UUID cancelledBy;
    private String cancelReason;
    private UUID createdBy;
    private UUID updatedBy;

    @OneToMany(mappedBy = "purchase", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNumber")
    private List<PurchaseItem> items = new ArrayList<>();

    public enum Status { DRAFT, POSTED, CANCELLED }

    public enum PaymentStatus { UNPAID, PARTIALLY_PAID, PAID }
}
