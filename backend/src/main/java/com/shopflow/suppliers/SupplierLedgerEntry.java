package com.shopflow.suppliers;

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

/** Immutable supplier ledger line. Positive balance = the business owes the supplier. */
@Entity
@Table(name = "supplier_ledger_entries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SupplierLedgerEntry {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID supplierId;
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

    SupplierLedgerEntry(UUID supplierId, LocalDate date, EntryType type, String referenceType, UUID referenceId,
                        String referenceNumber, BigDecimal debit, BigDecimal credit, BigDecimal balanceAfter,
                        String narration, UUID createdBy) {
        this.id = UUID.randomUUID();
        this.supplierId = supplierId;
        this.entryDate = date;
        this.entryType = type;
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

    public enum EntryType { PURCHASE, PURCHASE_PAYMENT, PURCHASE_RETURN, PURCHASE_CANCELLATION, ADJUSTMENT }
}
