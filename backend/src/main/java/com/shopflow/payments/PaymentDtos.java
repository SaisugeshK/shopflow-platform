package com.shopflow.payments;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PaymentDtos {

    private PaymentDtos() {
    }

    /**
     * Staff-recorded payment (cash, UPI, bank transfer, other). When invoiceId is given the payment is applied to it;
     * otherwise it is applied to the customer's oldest open invoices and any remainder stays as an advance.
     */
    public record RecordPaymentRequest(@NotNull UUID customerId,
                                       UUID invoiceId,
                                       UUID orderId,
                                       @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount,
                                       @NotNull PaymentMethod method,
                                       @Size(max = 100) String referenceNumber,
                                       Instant paidAt,
                                       @Size(max = 500) String notes) {
    }

    public record CancelPaymentRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record RefundRequest(@DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount,
                                @NotBlank @Size(max = 500) String reason) {
    }

    public record VerifyOnlinePaymentRequest(@NotBlank String providerPaymentId, @NotBlank String signature) {
    }

    public record AllocationResponse(UUID invoiceId, String invoiceNumber, BigDecimal amount, boolean reversed) {
    }

    public record PaymentResponse(UUID id, String paymentNumber, UUID customerId, String customerName, UUID invoiceId,
                                  String invoiceNumber, UUID orderId, String orderNumber, BigDecimal amount,
                                  String method, String status, String referenceNumber, Instant paidAt,
                                  String collectedBy, String notes, String provider, String providerOrderId,
                                  String providerPaymentId, String failureReason, BigDecimal allocatedAmount,
                                  BigDecimal refundedAmount, BigDecimal unallocatedAmount, String cancelReason,
                                  List<AllocationResponse> allocations, Instant createdAt) {
    }

    /** What a client needs to open the provider checkout. Secrets are never included. */
    public record PaymentIntentResponse(UUID paymentId, String paymentNumber, String provider, String providerOrderId,
                                        BigDecimal amount, String currency, String checkoutKey, String status) {
    }
}
