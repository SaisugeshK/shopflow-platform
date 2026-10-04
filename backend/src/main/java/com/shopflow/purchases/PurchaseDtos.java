package com.shopflow.purchases;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class PurchaseDtos {

    private PurchaseDtos() {
    }

    public record PurchaseItemRequest(@NotNull UUID productId,
                                      @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
                                      @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal rate,
                                      @DecimalMin("0") @DecimalMax("100") BigDecimal discountPercent,
                                      @DecimalMin("0") BigDecimal discountAmount,
                                      @DecimalMin("0") @DecimalMax("100") BigDecimal taxRate,
                                      @Size(max = 20) String unit,
                                      @Size(max = 60) String batchNumber,
                                      LocalDate mfgDate,
                                      LocalDate expiryDate,
                                      @Size(max = 500) List<@Size(max = 80) String> serialNumbers) {
    }

    public record CreatePurchaseRequest(@NotNull UUID supplierId,
                                        LocalDate purchaseDate,
                                        @Size(max = 60) String supplierInvoiceNumber,
                                        LocalDate supplierInvoiceDate,
                                        @NotEmpty @Size(max = 200) List<@Valid PurchaseItemRequest> items,
                                        @Size(max = 2000) String notes,
                                        Boolean post) {
    }

    public record CancelRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record PurchasePaymentRequest(@NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount,
                                         @NotNull @Pattern(regexp = "CASH|UPI|BANK_TRANSFER|CHEQUE|OTHER") String method,
                                         @Size(max = 100) String referenceNumber,
                                         Instant paidAt,
                                         @Size(max = 500) String notes) {
    }

    public record PurchaseItemResponse(UUID id, int lineNumber, UUID productId, String productName, String hsnCode,
                                       String unit, BigDecimal quantity, BigDecimal rate, BigDecimal discountPercent,
                                       BigDecimal discountAmount, BigDecimal taxRate, BigDecimal taxableAmount,
                                       BigDecimal cgstAmount, BigDecimal sgstAmount, BigDecimal igstAmount,
                                       BigDecimal lineTotal, BigDecimal returnedQuantity, BigDecimal unitFactor,
                                       String batchNumber, LocalDate mfgDate, LocalDate expiryDate, List<String> serialNumbers) {
    }

    public record PurchasePaymentResponse(UUID id, String paymentNumber, BigDecimal amount, String method,
                                          String referenceNumber, Instant paidAt, String notes) {
    }

    public record PurchaseResponse(UUID id, String purchaseNumber, LocalDate purchaseDate, UUID supplierId,
                                   String supplierName, String supplierInvoiceNumber, LocalDate supplierInvoiceDate,
                                   String status, String paymentStatus, boolean interState, BigDecimal subtotal,
                                   BigDecimal discountTotal, BigDecimal taxableTotal, BigDecimal cgstTotal,
                                   BigDecimal sgstTotal, BigDecimal igstTotal, BigDecimal roundOff, BigDecimal grandTotal,
                                   BigDecimal paidAmount, BigDecimal balanceDue, String notes, Instant postedAt,
                                   String cancelReason, List<PurchaseItemResponse> items,
                                   List<PurchasePaymentResponse> payments, Instant createdAt) {
    }

    public record PurchaseReturnItemRequest(@NotNull UUID purchaseItemId,
                                            @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity) {
    }

    public record CreatePurchaseReturnRequest(@NotNull UUID purchaseId,
                                              @NotBlank @Size(max = 500) String reason,
                                              LocalDate returnDate,
                                              @NotEmpty List<@Valid PurchaseReturnItemRequest> items,
                                              Boolean post) {
    }

    public record PurchaseReturnItemResponse(UUID id, UUID purchaseItemId, UUID productId, String productName,
                                             BigDecimal quantity, BigDecimal rate, BigDecimal taxRate,
                                             BigDecimal taxableAmount, BigDecimal taxAmount, BigDecimal lineTotal) {
    }

    public record PurchaseReturnResponse(UUID id, String returnNumber, UUID purchaseId, String purchaseNumber,
                                         UUID supplierId, String supplierName, LocalDate returnDate, String status,
                                         String reason, BigDecimal taxableTotal, BigDecimal taxTotal,
                                         BigDecimal roundOff, BigDecimal grandTotal, Instant postedAt,
                                         List<PurchaseReturnItemResponse> items, Instant createdAt) {
    }
}
