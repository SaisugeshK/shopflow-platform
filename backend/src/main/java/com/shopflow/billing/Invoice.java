package com.shopflow.billing;

import com.shopflow.common.domain.BaseEntity;
import com.shopflow.payments.PaymentMethod;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Tax invoice. Seller, buyer, lines and totals are snapshots taken when the invoice is generated; historical
 * invoices are never re-rendered from current master data (§25, §94).
 */
@Entity
@Table(name = "invoices")
@Getter
@Setter
public class Invoice extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    private String invoiceNumber;
    @Column(nullable = false)
    private String invoiceType = "TAX_INVOICE";
    @Column(nullable = false)
    private String copyLabel = "ORIGINAL";
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Source source;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InvoiceStatus status = InvoiceStatus.DRAFT;
    @Column(nullable = false)
    private UUID customerId;
    private UUID orderId;
    @Column(nullable = false)
    private LocalDate invoiceDate;
    private LocalDate dueDate;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentMethod paymentType;
    private String paymentTerms;
    private String buyerOrderNumber;
    private String deliveryNote;
    private String dispatchDocument;
    private String transport;
    private String vehicleNumber;
    private String destination;
    private String notes;
    private boolean interState;

    private String sellerName;
    private String sellerAddress;
    private String sellerPhone;
    private String sellerEmail;
    private String sellerGstin;
    private String sellerPan;
    private String sellerState;
    private String sellerStateCode;
    private UUID sellerLogoFileId;
    private String bankName;
    private String bankAccountNumber;
    private String bankIfsc;
    private String bankBranch;
    private String termsAndConditions;
    private String declaration;
    private String authorizedSignatory;

    private String buyerName;
    private String buyerContactName;
    private String buyerAddress;
    private String buyerCity;
    private String buyerState;
    private String buyerStateCode;
    private String buyerPincode;
    private String buyerMobile;
    private String buyerGstin;
    private String buyerPan;
    private String buyerEmail;

    private BigDecimal subtotal = BigDecimal.ZERO;
    private BigDecimal discountTotal = BigDecimal.ZERO;
    private BigDecimal taxableTotal = BigDecimal.ZERO;
    private BigDecimal cgstTotal = BigDecimal.ZERO;
    private BigDecimal sgstTotal = BigDecimal.ZERO;
    private BigDecimal igstTotal = BigDecimal.ZERO;
    private BigDecimal roundOff = BigDecimal.ZERO;
    private BigDecimal grandTotal = BigDecimal.ZERO;
    private BigDecimal paidAmount = BigDecimal.ZERO;
    private BigDecimal creditedAmount = BigDecimal.ZERO;
    private String amountInWords;
    private String taxAmountInWords;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EInvoiceStatus einvoiceStatus = EInvoiceStatus.NOT_APPLICABLE;
    private String irn;
    private String ackNumber;
    private Instant ackDate;
    private String signedQrData;
    private UUID pdfFileId;
    private Instant sentAt;
    private Instant generatedAt;
    private UUID generatedBy;
    private Instant cancelledAt;
    private UUID cancelledBy;
    private String cancelReason;
    private UUID createdBy;
    private UUID updatedBy;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNumber")
    private List<InvoiceItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<InvoiceTaxSummary> taxSummaries = new ArrayList<>();

    public BigDecimal outstanding() {
        if (status == InvoiceStatus.DRAFT || status == InvoiceStatus.CANCELLED) {
            return BigDecimal.ZERO;
        }
        return grandTotal.subtract(paidAmount).subtract(creditedAmount).max(BigDecimal.ZERO);
    }

    public BigDecimal totalTax() {
        return cgstTotal.add(sgstTotal).add(igstTotal);
    }

    /** Payment-driven status per §30; DRAFT and CANCELLED are never changed here. */
    public void refreshStatus() {
        if (status == InvoiceStatus.DRAFT || status == InvoiceStatus.CANCELLED) {
            return;
        }
        if (outstanding().signum() == 0) {
            status = InvoiceStatus.PAID;
        } else if (paidAmount.signum() > 0 || creditedAmount.signum() > 0) {
            status = InvoiceStatus.PARTIALLY_PAID;
        } else if (paymentType == PaymentMethod.CREDIT) {
            status = InvoiceStatus.CREDIT;
        } else if (sentAt != null) {
            status = InvoiceStatus.SENT;
        } else {
            status = InvoiceStatus.GENERATED;
        }
    }

    public enum Source { ORDER, MANUAL }

    public enum EInvoiceStatus { REAL_IRN, TEST_IRN, NOT_APPLICABLE, PENDING, FAILED }
}
