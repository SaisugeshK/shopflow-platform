package com.shopflow.billing;

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
import java.util.UUID;

/** An invoice-level charge (transport, loading, cutting…) with its own GST (§0B.7, CHARGES module). */
@Entity
@Table(name = "invoice_charges")
@Getter
@Setter
public class InvoiceCharge {

    @Id
    private UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id")
    private Invoice invoice;
    private int lineNumber;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Type chargeType;
    private String description;
    private String sacCode;
    private BigDecimal amount = BigDecimal.ZERO;
    private BigDecimal taxRate = BigDecimal.ZERO;
    private BigDecimal cgstAmount = BigDecimal.ZERO;
    private BigDecimal sgstAmount = BigDecimal.ZERO;
    private BigDecimal igstAmount = BigDecimal.ZERO;
    private BigDecimal total = BigDecimal.ZERO;

    public enum Type {
        TRANSPORT("Transport", "9965"), LOADING("Loading", "9967"), UNLOADING("Unloading", "9967"),
        CUTTING("Cutting", "9988"), PACKING("Packing", "9985"), INSURANCE("Insurance", "9971"), OTHER("Other charges", "9997");

        private final String label;
        private final String sac;

        Type(String label, String sac) {
            this.label = label;
            this.sac = sac;
        }

        public String label() {
            return label;
        }

        /** Default SAC (services accounting code) printed in the tax summary. */
        public String sac() {
            return sac;
        }
    }

    public String displayName() {
        return description == null || description.isBlank() ? chargeType.label() : description;
    }
}
