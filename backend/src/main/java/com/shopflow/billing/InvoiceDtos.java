package com.shopflow.billing;

import com.shopflow.payments.PaymentMethod;
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
import java.util.UUID;

public final class InvoiceDtos {

    private InvoiceDtos() {
    }

    public record InvoiceLineRequest(@NotNull UUID productId,
                                     @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
                                     @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal rate,
                                     @DecimalMin("0") @DecimalMax("100") BigDecimal discountPercent,
                                     @DecimalMin("0") BigDecimal discountAmount,
                                     @Size(max = 500) String description) {
    }

    /**
     * Order-based invoice: set {@code orderId} (lines come from the order).
     * Admin-created invoice: set {@code customerId}, {@code paymentType} and {@code items}; the rate defaults to the
     * customer's price when omitted.
     */
    public record CreateInvoiceRequest(UUID orderId,
                                       UUID customerId,
                                       PaymentMethod paymentType,
                                       LocalDate invoiceDate,
                                       @Size(max = 200) List<@Valid InvoiceLineRequest> items,
                                       @Size(max = 200) String paymentTerms,
                                       @Size(max = 60) String buyerOrderNumber,
                                       @Size(max = 200) String deliveryNote,
                                       @Size(max = 200) String dispatchDocument,
                                       @Size(max = 200) String transport,
                                       @Size(max = 20) String vehicleNumber,
                                       @Size(max = 200) String destination,
                                       @Size(max = 1000) String notes,
                                       Boolean generate) {
    }

    public record CancelInvoiceRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record CreditNoteLineRequest(@NotNull UUID invoiceItemId,
                                        @NotNull @DecimalMin("0.001") BigDecimal quantity) {
    }

    public record CreateCreditNoteRequest(@NotNull CreditNote.ReasonType reasonType,
                                          @NotBlank @Size(max = 500) String reason,
                                          @NotNull @Size(min = 1) List<@Valid CreditNoteLineRequest> items) {
    }

    public record InvoiceItemResponse(UUID id, int lineNumber, UUID productId, String productName, String description,
                                      String sku, String hsnCode, String unit, BigDecimal quantity, BigDecimal rate,
                                      BigDecimal discountPercent, BigDecimal discountAmount, BigDecimal taxRate,
                                      BigDecimal taxableAmount, BigDecimal cgstAmount, BigDecimal sgstAmount,
                                      BigDecimal igstAmount, BigDecimal lineTotal, BigDecimal returnedQuantity) {
    }

    public record TaxSummaryResponse(String hsnCode, BigDecimal taxRate, BigDecimal taxableAmount, BigDecimal cgstAmount,
                                     BigDecimal sgstAmount, BigDecimal igstAmount, BigDecimal totalTax) {
    }

    public record PartyResponse(String name, String contactName, String address, String city, String state,
                                String stateCode, String pincode, String phone, String email, String gstin, String pan) {
    }

    public record CreditNoteResponse(UUID id, String creditNoteNumber, LocalDate noteDate, String reasonType,
                                     String reason, BigDecimal taxableTotal, BigDecimal taxTotal, BigDecimal grandTotal) {
    }

    public record InvoiceResponse(UUID id, String invoiceNumber, String invoiceType, String copyLabel, String source,
                                  String status, UUID customerId, UUID orderId, String orderNumber,
                                  LocalDate invoiceDate, LocalDate dueDate, String paymentType, String paymentTerms,
                                  String buyerOrderNumber, String deliveryNote, String dispatchDocument,
                                  String transport, String vehicleNumber, String destination, String notes,
                                  boolean interState, PartyResponse seller, PartyResponse buyer,
                                  BigDecimal subtotal, BigDecimal discountTotal, BigDecimal taxableTotal,
                                  BigDecimal cgstTotal, BigDecimal sgstTotal, BigDecimal igstTotal, BigDecimal roundOff,
                                  BigDecimal grandTotal, BigDecimal paidAmount, BigDecimal creditedAmount,
                                  BigDecimal outstanding, String amountInWords, String taxAmountInWords,
                                  String einvoiceStatus, String irn, String ackNumber, boolean overdue,
                                  Instant generatedAt, Instant sentAt, String cancelReason,
                                  List<InvoiceItemResponse> items, List<TaxSummaryResponse> taxSummary,
                                  List<CreditNoteResponse> creditNotes, Instant createdAt) {
    }
}
