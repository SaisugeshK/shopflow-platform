package com.shopflow.business;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "invoice_settings")
@Getter
@Setter
public class InvoiceSettings {

    @Id
    private UUID businessId;
    @Column(nullable = false)
    private String invoicePrefix;
    private int numberPadding;
    private long startingNumber;
    private String defaultPaymentTerms;
    private String defaultTerms;
    private String defaultFooter;
    private String declaration;
    private UUID signatureFileId;
    @Column(nullable = false)
    private String templateCode;
    private boolean showBankDetails;
    @Column(nullable = false)
    private Instant updatedAt;
    @Version
    private Long version;

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }
}
