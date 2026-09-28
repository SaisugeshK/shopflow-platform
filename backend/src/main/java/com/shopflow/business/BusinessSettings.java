package com.shopflow.business;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Operational rules the business can change without a code release.
 */
@Entity
@Table(name = "business_settings")
@Getter
@Setter
public class BusinessSettings {

    @Id
    private UUID businessId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CreditPolicy creditPolicy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CustomerCancelUntil customerCancelAllowedUntil;

    private boolean showStockToCustomers;
    private boolean gstinRequiredForCustomers;
    private boolean panRequiredForCustomers;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PartialDeliveryInvoicePolicy partialDeliveryInvoicePolicy;

    private int defaultCreditDays;
    @Column(nullable = false)
    private BigDecimal defaultCreditLimit;
    private boolean whatsappEnabled;
    private String whatsappSender;
    @Column(nullable = false)
    private String whatsappInvoiceTemplate;
    private boolean notifyPush;
    private boolean notifySms;
    private boolean notifyEmail;
    private boolean notifyWhatsapp;
    private int dataRetentionYears;

    @Column(nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public enum CreditPolicy { BLOCK, REQUIRE_ADMIN_APPROVAL, ALLOW }

    /** Last order status in which a customer may still cancel their own order. */
    public enum CustomerCancelUntil { PLACED, ACCEPTED, NEVER }

    public enum PartialDeliveryInvoicePolicy { INVOICE_ACCEPTED_QUANTITY, INVOICE_DELIVERED_QUANTITY }
}
