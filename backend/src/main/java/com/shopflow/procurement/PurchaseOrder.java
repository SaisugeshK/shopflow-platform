package com.shopflow.procurement;

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
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * A purchase order to a supplier with quotation rounds (§0B.8):
 * DRAFT → SENT → QUOTED ⇄ COUNTERED → ACCEPTED → PARTIALLY_RECEIVED → RECEIVED → CLOSED; side exits REJECTED,
 * CANCELLED, EXPIRED.
 */
@Entity
@Table(name = "purchase_orders")
@Getter
@Setter
public class PurchaseOrder extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String poNumber;
    @Column(nullable = false)
    private UUID supplierId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.DRAFT;
    @Column(nullable = false)
    private LocalDate orderDate;
    private LocalDate expectedDate;
    private LocalDate quoteValidUntil;
    private String notes;
    private String supplierNote;
    @Column(nullable = false)
    private boolean interState;
    /** Number of the latest revision (0 while a draft). */
    @Column(nullable = false)
    private int revision;
    private BigDecimal subtotal = BigDecimal.ZERO;
    private BigDecimal taxableTotal = BigDecimal.ZERO;
    private BigDecimal taxTotal = BigDecimal.ZERO;
    private BigDecimal grandTotal = BigDecimal.ZERO;
    private Instant sentAt;
    private Instant quotedAt;
    private Instant acceptedAt;
    private Instant closedAt;
    private Instant cancelledAt;
    private String cancelReason;
    private UUID createdBy;

    @OneToMany(mappedBy = "purchaseOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNumber")
    private List<PurchaseOrderLine> lines = new ArrayList<>();

    public enum Status {
        DRAFT, SENT, QUOTED, COUNTERED, ACCEPTED, PARTIALLY_RECEIVED, RECEIVED, CLOSED, REJECTED, CANCELLED, EXPIRED;

        static final Set<Status> NEGOTIATING = EnumSet.of(SENT, QUOTED, COUNTERED);
        static final Set<Status> FINAL = EnumSet.of(CLOSED, REJECTED, CANCELLED, EXPIRED, RECEIVED);

        public boolean negotiating() {
            return NEGOTIATING.contains(this);
        }

        public boolean receivable() {
            return this == ACCEPTED || this == PARTIALLY_RECEIVED;
        }
    }
}
