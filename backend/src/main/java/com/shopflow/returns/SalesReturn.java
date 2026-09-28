package com.shopflow.returns;

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

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "sales_returns")
@Getter
@Setter
public class SalesReturn extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String returnNumber;
    @Column(nullable = false)
    private UUID invoiceId;
    private UUID orderId;
    @Column(nullable = false)
    private UUID customerId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.REQUESTED;
    @Column(nullable = false)
    private String reason;
    private String reviewNote;
    @Column(nullable = false)
    private Instant requestedAt = Instant.now();
    private UUID requestedBy;
    private Instant reviewedAt;
    private UUID reviewedBy;
    private UUID creditNoteId;

    @OneToMany(mappedBy = "salesReturn", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SalesReturnItem> items = new ArrayList<>();

    public enum Status { REQUESTED, APPROVED, REJECTED }
}
