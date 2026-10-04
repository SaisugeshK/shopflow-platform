package com.shopflow.orders;

import com.shopflow.payments.PaymentDtos.PaymentIntentResponse;
import com.shopflow.payments.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class OrderDtos {

    private OrderDtos() {
    }

    // ---------------------------------------------------------------- cart

    public record CartItemRequest(@NotNull UUID productId,
                                  @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
                                  @Size(max = 20) String unit) {
    }

    public record UpdateCartItemRequest(@NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity) {
    }

    public record CartLine(UUID id, UUID productId, String sku, String productName, String unit, String imageUrl,
                           BigDecimal quantity, BigDecimal unitPrice, BigDecimal mrp, BigDecimal discountAmount,
                           BigDecimal taxRate, BigDecimal taxableAmount, BigDecimal taxAmount, BigDecimal lineTotal,
                           String stockStatus, String issue, BigDecimal unitFactor, String schemeName,
                           BigDecimal freeQuantity) {
    }

    /** Totals are a backend preview; the order is re-priced at checkout. */
    public record CartResponse(UUID id, List<CartLine> items, int itemCount, BigDecimal subtotal, BigDecimal discountTotal,
                               BigDecimal taxableTotal, BigDecimal cgstTotal, BigDecimal sgstTotal, BigDecimal igstTotal,
                               BigDecimal roundOff, BigDecimal grandTotal, boolean interState, boolean checkoutReady) {
    }

    // ---------------------------------------------------------------- orders

    public record OrderLineRequest(@NotNull UUID productId,
                                   @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
                                   @Size(max = 20) String unit,
                                   /* Used only when an order is made from an accepted quotation (server-side). */
                                   @DecimalMin("0") BigDecimal rate,
                                   @DecimalMin("0") BigDecimal discountPercent) {
        public OrderLineRequest(UUID productId, BigDecimal quantity, String unit) {
            this(productId, quantity, unit, null, null);
        }
    }

    /**
     * Customers check out their cart (items omitted) or send items directly. Staff must set customerId to order on a
     * customer's behalf.
     */
    public record CreateOrderRequest(UUID customerId,
                                     UUID addressId,
                                     @NotNull PaymentMethod paymentMethod,
                                     @Size(max = 1000) String orderNote,
                                     @Size(max = 200) List<@Valid OrderLineRequest> items,
                                     UUID projectId) {
        public CreateOrderRequest(UUID customerId, UUID addressId, PaymentMethod paymentMethod, String orderNote, List<OrderLineRequest> items) {
            this(customerId, addressId, paymentMethod, orderNote, items, null);
        }
    }

    public record AcceptLine(@NotNull UUID orderItemId, @NotNull @DecimalMin("0") BigDecimal acceptedQuantity) {
    }

    public record AcceptOrderRequest(List<@Valid AcceptLine> items, @Size(max = 500) String note) {
    }

    public record ReasonRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record NoteRequest(@Size(max = 500) String note) {
    }

    public record DispatchRequest(@Size(max = 200) String deliveryPerson, String deliveryPersonMobile,
                                  @Size(max = 20) String vehicleNumber, @Size(max = 1000) String notes) {
    }

    public record DeliverLine(@NotNull UUID orderItemId, @NotNull @DecimalMin("0") BigDecimal deliveredQuantity) {
    }

    public record DeliverRequest(List<@Valid DeliverLine> items, @Size(max = 200) String receivedBy,
                                 @Size(max = 500) String proofOfDelivery, @Size(max = 1000) String notes,
                                 Boolean customerConfirmed) {
    }

    public record OrderItemResponse(UUID id, int lineNumber, UUID productId, String sku, String productName,
                                    String hsnCode, String unit, BigDecimal orderedQuantity, BigDecimal acceptedQuantity,
                                    BigDecimal packedQuantity, BigDecimal deliveredQuantity,
                                    BigDecimal cancelledQuantity, BigDecimal returnedQuantity,
                                    BigDecimal invoicedQuantity, BigDecimal pendingQuantity, BigDecimal rate,
                                    BigDecimal discountAmount, BigDecimal taxRate, BigDecimal taxableAmount,
                                    BigDecimal taxAmount, BigDecimal lineTotal, BigDecimal unitFactor, boolean freeItem,
                                    String schemeName) {
    }

    public record StatusHistoryResponse(String previousStatus, String newStatus, String changedBy, Instant changedAt,
                                        String note) {
    }

    public record DeliveryResponse(int attemptNumber, String deliveryPerson, String deliveryPersonMobile,
                                   String vehicleNumber, String notes, Instant dispatchedAt, Instant deliveredAt,
                                   Instant failedAt, String failureReason, String receivedBy, String proofOfDelivery) {
    }

    public record OrderInvoiceRef(UUID id, String invoiceNumber, String status, BigDecimal grandTotal,
                                  BigDecimal outstanding) {
    }

    public record OrderResponse(UUID id, String orderNumber, UUID customerId, String customerName, String customerCode,
                                String status, String paymentStatus, String paymentMethod,
                                String creditApprovalStatus, String source, String deliveryName,
                                String deliveryAddress, String deliveryStateCode, String contactMobile,
                                String orderNote, boolean interState, BigDecimal subtotal, BigDecimal discountTotal,
                                BigDecimal taxableTotal, BigDecimal cgstTotal, BigDecimal sgstTotal,
                                BigDecimal igstTotal, BigDecimal roundOff, BigDecimal grandTotal,
                                BigDecimal paidAmount, BigDecimal balanceDue, Instant placedAt, String cancelReason,
                                String rejectReason, boolean customerCanCancel, List<OrderItemResponse> items,
                                List<OrderInvoiceRef> invoices, DeliveryResponse delivery,
                                PaymentIntentResponse paymentIntent, Instant updatedAt) {
    }
}
