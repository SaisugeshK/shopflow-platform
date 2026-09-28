package com.shopflow.purchases;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
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
@Table(name = "purchase_returns")
@Getter
@Setter
public class PurchaseReturn extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String returnNumber;
    @Column(nullable = false)
    private UUID purchaseId;
    @Column(nullable = false)
    private UUID supplierId;
    @Column(nullable = false)
    private LocalDate returnDate;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.DRAFT;
    @Column(nullable = false)
    private String reason;
    private BigDecimal taxableTotal;
    private BigDecimal cgstTotal;
    private BigDecimal sgstTotal;
    private BigDecimal igstTotal;
    private BigDecimal roundOff;
    private BigDecimal grandTotal;
    private Instant postedAt;
    private UUID postedBy;
    private UUID createdBy;

    @OneToMany(mappedBy = "purchaseReturn", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PurchaseReturnItem> items = new ArrayList<>();

    public enum Status { DRAFT, POSTED }
}
