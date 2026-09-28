package com.shopflow.customers;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Immutable ledger line. Corrections are new reversing entries, never edits. */
@Entity
@Table(name = "customer_ledger_entries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CustomerLedgerEntry {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID customerId;
    @Column(nullable = false)
    private LocalDate entryDate;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EntryType entryType;
    @Column(nullable = false)
    private String referenceType;
    @Column(nullable = false)
    private UUID referenceId;
    @Column(nullable = false)
    private String referenceNumber;
    @Column(nullable = false)
    private BigDecimal debit;
    @Column(nullable = false)
    private BigDecimal credit;
    @Column(nullable = false)
    private BigDecimal balanceAfter;
    private String narration;
    @Column(nullable = false)
    private Instant createdAt;
    private UUID createdBy;

    CustomerLedgerEntry(UUID customerId, LocalDate entryDate, EntryType entryType, String referenceType, UUID referenceId,
                        String referenceNumber, BigDecimal debit, BigDecimal credit, BigDecimal balanceAfter,
                        String narration, UUID createdBy) {
        this.id = UUID.randomUUID();
        this.customerId = customerId;
        this.entryDate = entryDate;
        this.entryType = entryType;
        this.referenceType = referenceType;
        this.referenceId = referenceId;
        this.referenceNumber = referenceNumber;
        this.debit = debit;
        this.credit = credit;
        this.balanceAfter = balanceAfter;
        this.narration = narration;
        this.createdAt = Instant.now();
        this.createdBy = createdBy;
    }

    public enum EntryType { OPENING, INVOICE, PAYMENT, CREDIT_NOTE, DEBIT_NOTE, INVOICE_CANCELLATION, PAYMENT_REVERSAL, ADJUSTMENT }
}
