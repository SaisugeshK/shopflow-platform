package com.shopflow.billing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Foundation: an additional charge against an invoice, posted to the customer ledger. */
@Entity
@Table(name = "debit_notes")
@Getter
@Setter
public class DebitNote {

    @Id
    private UUID id = UUID.randomUUID();
    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String debitNoteNumber;
    @Column(nullable = false)
    private UUID invoiceId;
    @Column(nullable = false)
    private UUID customerId;
    @Column(nullable = false)
    private String reason;
    @Column(nullable = false)
    private LocalDate noteDate;
    private BigDecimal taxableTotal;
    private BigDecimal taxTotal;
    private BigDecimal grandTotal;
    @Column(nullable = false)
    private Instant createdAt = Instant.now();
    private UUID createdBy;
}
