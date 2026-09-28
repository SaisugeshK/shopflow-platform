package com.shopflow.billing;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
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

/** Reduces what a customer owes on an invoice (returns, short delivery, failed delivery). Immutable once issued. */
@Entity
@Table(name = "credit_notes")
@Getter
@Setter
public class CreditNote {

    @Id
    private UUID id = UUID.randomUUID();
    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String creditNoteNumber;
    @Column(nullable = false)
    private UUID invoiceId;
    @Column(nullable = false)
    private UUID customerId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReasonType reasonType;
    @Column(nullable = false)
    private String reason;
    private String referenceType;
    private UUID referenceId;
    @Column(nullable = false)
    private LocalDate noteDate;
    private BigDecimal taxableTotal;
    private BigDecimal cgstTotal;
    private BigDecimal sgstTotal;
    private BigDecimal igstTotal;
    private BigDecimal roundOff;
    private BigDecimal grandTotal;
    @Column(nullable = false)
    private Instant createdAt = Instant.now();
    private UUID createdBy;

    @OneToMany(mappedBy = "creditNote", cascade = CascadeType.ALL)
    private List<CreditNoteItem> items = new ArrayList<>();

    public enum ReasonType { SALES_RETURN, SHORT_DELIVERY, DELIVERY_FAILED, PRICE_ADJUSTMENT, OTHER }
}
