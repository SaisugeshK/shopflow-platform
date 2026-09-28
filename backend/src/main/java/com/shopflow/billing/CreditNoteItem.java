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
@Table(name = "credit_note_items")
@Getter
@Setter
public class CreditNoteItem {

    @Id
    private UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "credit_note_id")
    private CreditNote creditNote;
    @Column(nullable = false)
    private UUID invoiceItemId;
    @Column(nullable = false)
    private UUID productId;
    @Column(nullable = false)
    private String productName;
    private BigDecimal quantity;
    private BigDecimal rate;
    private BigDecimal taxRate;
    private BigDecimal taxableAmount;
    private BigDecimal cgstAmount;
    private BigDecimal sgstAmount;
    private BigDecimal igstAmount;
    private BigDecimal lineTotal;
}
