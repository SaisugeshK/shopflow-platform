package com.shopflow.procurement;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request/response bodies for purchase orders, quotation rounds and goods receipts (§0B.8). */
public final class ProcurementDtos {

    private ProcurementDtos() {
    }

    public record PoLineRequest(@NotNull UUID productId,
                                @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
                                @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal rate,
                                @DecimalMin("0") @DecimalMax("100") BigDecimal discountPercent,
                                @DecimalMin("0") @DecimalMax("100") BigDecimal taxRate,
                                @Size(max = 20) String unit,
                                @Size(max = 500) String note) {
    }

    public record CreatePoRequest(@NotNull UUID supplierId, LocalDate orderDate, LocalDate expectedDate,
                                  @Size(max = 2000) String notes,
                                  @NotNull @Size(min = 1, max = 200) List<@Valid PoLineRequest> lines,
                                  Boolean send) {
    }

    /** One line of a quote or counter-offer; null fields keep their current value. */
    public record LineChange(@NotNull UUID lineId,
                             @DecimalMin("0") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
                             @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal rate,
                             @DecimalMin("0") @DecimalMax("100") BigDecimal discountPercent,
                             @DecimalMin("0") @DecimalMax("100") BigDecimal taxRate,
                             PurchaseOrderLine.Availability availability,
                             LocalDate deliveryDate,
                             @Size(max = 500) String note,
                             @Size(max = 500) String substituteNote) {
    }

    /** An extra line suggested by the supplier (a product of the business, or free text the business maps later). */
    public record ExtraLine(UUID productId, @NotBlank @Size(max = 300) String description,
                            @NotNull @DecimalMin("0.001") BigDecimal quantity, @Size(max = 20) String unit,
                            @NotNull @DecimalMin("0") BigDecimal rate, @DecimalMin("0") @DecimalMax("100") BigDecimal taxRate,
                            @Size(max = 500) String note) {
    }

    /** Supplier's quotation for the current round. */
    public record QuoteRequest(@Size(max = 200) List<@Valid LineChange> lines, @Size(max = 50) List<@Valid ExtraLine> extraLines,
                               LocalDate quoteValidUntil, LocalDate expectedDate, @Size(max = 2000) String note) {
    }

    /** Business counter-offer. */
    public record CounterRequest(@Size(max = 200) List<@Valid LineChange> lines, LocalDate expectedDate,
                                 @Size(max = 2000) String note) {
    }

    /** Accept all open lines (empty lineIds) or the selected ones; supplier extra lines need a product link. */
    public record AcceptRequest(List<UUID> lineIds, Map<UUID, UUID> productLinks, @Size(max = 2000) String note) {
    }

    public record ReasonRequest(@NotBlank @Size(min = 3, max = 500) String reason) {
    }

    public record ReceiptLineRequest(@NotNull UUID poLineId,
                                     @NotNull @DecimalMin("0") @Digits(integer = 11, fraction = 3) BigDecimal receivedQuantity,
                                     @DecimalMin("0") @Digits(integer = 11, fraction = 3) BigDecimal damagedQuantity,
                                     @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal rate,
                                     @Size(max = 60) String batchNumber, LocalDate mfgDate, LocalDate expiryDate,
                                     @Size(max = 500) List<@Size(max = 80) String> serialNumbers) {
    }

    public record CreateReceiptRequest(LocalDate receiptDate, @Size(max = 60) String supplierInvoiceNumber,
                                       LocalDate supplierInvoiceDate, @Size(max = 2000) String notes,
                                       @NotNull @Size(min = 1, max = 200) List<@Valid ReceiptLineRequest> lines) {
    }

    public record PoLineResponse(UUID id, int lineNumber, UUID productId, String description, String sku, String hsnCode,
                                 String unit, BigDecimal unitFactor, BigDecimal quantity, BigDecimal rate,
                                 BigDecimal discountPercent, BigDecimal taxRate, BigDecimal taxableAmount,
                                 BigDecimal taxAmount, BigDecimal lineTotal, String availability, LocalDate deliveryDate,
                                 String lineNote, String substituteNote, String addedBy, String status,
                                 BigDecimal receivedQuantity, BigDecimal pendingQuantity, boolean trackBatches,
                                 boolean trackSerials) {
    }

    public record RevisionResponse(UUID id, int revision, String actorType, String actorName, String action, String note,
                                   BigDecimal grandTotal, Instant createdAt, Object snapshot) {
    }

    public record AttachmentResponse(UUID id, String fileName, String uploadedByType, Instant createdAt) {
    }

    public record ReceiptLineResponse(UUID id, UUID poLineId, String description, BigDecimal receivedQuantity,
                                      BigDecimal damagedQuantity, BigDecimal rate, String batchNumber, LocalDate expiryDate,
                                      List<String> serialNumbers, String mismatchNote) {
    }

    public record ReceiptResponse(UUID id, String grnNumber, UUID purchaseOrderId, String poNumber, LocalDate receiptDate,
                                  String supplierInvoiceNumber, LocalDate supplierInvoiceDate, UUID purchaseId,
                                  String purchaseNumber, boolean hasMismatch, String notes, Instant createdAt,
                                  List<ReceiptLineResponse> lines) {
    }

    public record PoResponse(UUID id, String poNumber, UUID supplierId, String supplierName, String supplierCode,
                             boolean supplierHasPortal, String status, LocalDate orderDate, LocalDate expectedDate,
                             LocalDate quoteValidUntil, String notes, String supplierNote, boolean interState, int revision,
                             BigDecimal subtotal, BigDecimal taxableTotal, BigDecimal taxTotal, BigDecimal grandTotal,
                             Instant sentAt, Instant quotedAt, Instant acceptedAt, Instant closedAt, String cancelReason,
                             Instant createdAt, Instant updatedAt, List<PoLineResponse> lines,
                             List<RevisionResponse> revisions, List<AttachmentResponse> attachments,
                             List<ReceiptResponse> receipts, String businessName) {
    }

    public record PortalInviteRequest(@Size(max = 20) String mobileNumber, @Size(max = 200) String contactName) {
    }

    public record PortalAccessResponse(UUID supplierId, boolean enabled, String mobileNumber, String userStatus,
                                       Instant lastLoginAt) {
    }
}
