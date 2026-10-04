package com.shopflow.orders;

import com.shopflow.billing.Invoice;
import com.shopflow.billing.InvoiceService;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.common.web.ReadTx;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerService;
import com.shopflow.orders.OrderDtos.AcceptOrderRequest;
import com.shopflow.orders.OrderDtos.CreateOrderRequest;
import com.shopflow.orders.OrderDtos.DeliverRequest;
import com.shopflow.orders.OrderDtos.DeliveryResponse;
import com.shopflow.orders.OrderDtos.DispatchRequest;
import com.shopflow.orders.OrderDtos.NoteRequest;
import com.shopflow.orders.OrderDtos.OrderInvoiceRef;
import com.shopflow.orders.OrderDtos.OrderItemResponse;
import com.shopflow.orders.OrderDtos.OrderResponse;
import com.shopflow.orders.OrderDtos.ReasonRequest;
import com.shopflow.orders.OrderDtos.StatusHistoryResponse;
import com.shopflow.payments.Payment;
import com.shopflow.payments.PaymentDtos.PaymentIntentResponse;
import com.shopflow.payments.PaymentMethod;
import com.shopflow.payments.PaymentService;
import com.shopflow.payments.PaymentStatus;
import com.shopflow.security.CurrentUser;
import com.shopflow.users.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/orders")
@Tag(name = "Orders", description = "Checkout, order status workflow, delivery and cancellation")
@SecurityRequirement(name = "bearerAuth")
public class OrderController {

    private static final String READ = "hasAnyAuthority('ORDER_READ','CUSTOMER_SELF')";

    private final OrderService service;
    private final CustomerService customers;
    private final InvoiceService invoices;
    private final PaymentService payments;
    private final UserService users;
    private final ReadTx readTx;

    public OrderController(OrderService service, CustomerService customers, InvoiceService invoices,
                           PaymentService payments, UserService users, ReadTx readTx) {
        this.readTx = readTx;
        this.service = service;
        this.customers = customers;
        this.invoices = invoices;
        this.payments = payments;
        this.users = users;
    }

    @GetMapping
    @PreAuthorize(READ)
    @Operation(summary = "List orders", description = "Staff see all orders; customers see only their own. Filter by status (repeatable), payment status, customer and date. Sort: placedAt, orderNumber, grandTotal.")
    public ApiResponse<List<OrderResponse>> list(@RequestParam(required = false) String q,
                                                 @RequestParam(required = false) UUID customerId,
                                                 @RequestParam(required = false) List<OrderStatus> status,
                                                 @RequestParam(required = false) OrderPaymentStatus paymentStatus,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                 @RequestParam(required = false) Integer page,
                                                 @RequestParam(required = false) Integer pageSize,
                                                 @RequestParam(required = false) String sort) {
        var pageable = PageQuery.of(page, pageSize, sort, PageQuery.fields("placedAt", "orderNumber", "grandTotal"),
                Sort.by(Sort.Direction.DESC, "placedAt"));
        Map<UUID, Customer> cache = new HashMap<>();
        return ApiResponse.page(service.search(q, customerId, status, paymentStatus, from, to, pageable), o -> toResponse(o, false, cache));
    }

    @GetMapping("/{id}")
    @PreAuthorize(READ)
    @Operation(summary = "Get order detail", description = "Items with partial-delivery quantities, invoices, delivery and pending online-payment intent.")
    public ApiResponse<OrderResponse> get(@PathVariable UUID id) {
        return readTx.call(() -> ApiResponse.ok(toResponse(service.getForCurrentUser(id), true, new HashMap<>())));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('CUSTOMER_SELF','ORDER_WRITE')")
    @Operation(summary = "Place an order (checkout)",
            description = "Customers check out their cart (omit items). Staff must pass customerId and items. Prices, discounts, GST and totals are calculated by the backend; "
                    + "stock is reserved atomically. CREDIT orders are validated against the credit limit and policy. ONLINE orders return a payment intent. "
                    + "Send an Idempotency-Key header to make retries safe. Errors: CART_EMPTY, INSUFFICIENT_STOCK, PRODUCT_INACTIVE, CREDIT_LIMIT_EXCEEDED, CREDIT_NOT_ENABLED, CUSTOMER_NOT_APPROVED.")
    public ApiResponse<OrderResponse> create(@Valid @RequestBody CreateOrderRequest request,
                                             @Parameter(description = "Client-generated key; retries with the same key return the same order")
                                             @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        UUID id = service.create(request, idempotencyKey);
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true, new HashMap<>()), "Order placed"));
    }

    @PostMapping("/{id}/accept")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Accept an order", description = "Optionally accept partial quantities per line; unaccepted stock is released. Accepting a credit order awaiting approval approves it.")
    public ApiResponse<OrderResponse> accept(@PathVariable UUID id, @Valid @RequestBody(required = false) AcceptOrderRequest request) {
        return ok(service.accept(id, request));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Reject a placed order", description = "Releases reserved stock and refunds captured online payments.")
    public ApiResponse<OrderResponse> reject(@PathVariable UUID id, @Valid @RequestBody ReasonRequest request) {
        return ok(service.reject(id, request.reason()));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyAuthority('ORDER_WRITE','CUSTOMER_SELF')")
    @Operation(summary = "Cancel an order", description = "Customers can cancel until the configured status (default: before packing); staff until delivery. "
            + "Cancels the order's invoice, releases stock and refunds online payments. Errors: ORDER_CANNOT_CANCEL.")
    public ApiResponse<OrderResponse> cancel(@PathVariable UUID id, @Valid @RequestBody ReasonRequest request) {
        return ok(service.cancel(id, request.reason()));
    }

    @PostMapping("/{id}/packing")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Move to PACKING")
    public ApiResponse<OrderResponse> packing(@PathVariable UUID id, @Valid @RequestBody(required = false) NoteRequest request) {
        return ok(service.startPacking(id, request == null ? null : request.note()));
    }

    @PostMapping("/{id}/ready-for-delivery")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Move to READY_FOR_DELIVERY")
    public ApiResponse<OrderResponse> ready(@PathVariable UUID id, @Valid @RequestBody(required = false) NoteRequest request) {
        return ok(service.readyForDelivery(id, request == null ? null : request.note()));
    }

    @PostMapping("/{id}/out-for-delivery")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Dispatch (OUT_FOR_DELIVERY)", description = "Records delivery person and vehicle.")
    public ApiResponse<OrderResponse> dispatch(@PathVariable UUID id, @Valid @RequestBody(required = false) DispatchRequest request) {
        return ok(service.outForDelivery(id, request));
    }

    @PostMapping("/{id}/deliver")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Mark delivered", description = "Supports partial delivery per line. Delivered stock is posted as SALE_OUT; short quantities are cancelled and credited if already invoiced.")
    public ApiResponse<OrderResponse> deliver(@PathVariable UUID id, @Valid @RequestBody(required = false) DeliverRequest request) {
        return ok(service.deliver(id, request));
    }

    @PostMapping("/{id}/delivery-failed")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Mark delivery failed (terminal)", description = "Releases stock, cancels the invoice and refunds online payments.")
    public ApiResponse<OrderResponse> deliveryFailed(@PathVariable UUID id, @Valid @RequestBody ReasonRequest request) {
        return ok(service.deliveryFailed(id, request.reason()));
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Complete a delivered order")
    public ApiResponse<OrderResponse> complete(@PathVariable UUID id, @Valid @RequestBody(required = false) NoteRequest request) {
        return ok(service.complete(id, request == null ? null : request.note()));
    }

    @GetMapping("/{id}/status-history")
    @PreAuthorize(READ)
    @Operation(summary = "Order status timeline")
    public ApiResponse<List<StatusHistoryResponse>> history(@PathVariable UUID id) {
        service.getForCurrentUser(id);
        Map<UUID, String> names = new HashMap<>();
        return ApiResponse.ok(service.history(id).stream().map(h -> new StatusHistoryResponse(
                h.getPreviousStatus() == null ? null : h.getPreviousStatus().name(), h.getNewStatus().name(),
                h.getChangedBy() == null ? null : names.computeIfAbsent(h.getChangedBy(), u -> CurrentUser.isCustomer() ? null : users.get(u).getFullName()),
                h.getChangedAt(), h.getNote())).toList());
    }

    @PostMapping("/{id}/payment-intent")
    @PreAuthorize("hasAnyAuthority('CUSTOMER_SELF','PAYMENT_WRITE')")
    @Operation(summary = "Create or reuse an online payment intent", description = "For ONLINE orders with an amount due. Errors: PAYMENT_PROVIDER_ERROR (retry later).")
    public ApiResponse<PaymentIntentResponse> paymentIntent(@PathVariable UUID id) {
        return ApiResponse.ok(intent(payments.createOrderIntent(id)));
    }

    private ApiResponse<OrderResponse> ok(Order order) {
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(order.getId()), true, new HashMap<>())));
    }

    private static PaymentIntentResponse intent(Payment p) {
        return new PaymentIntentResponse(p.getId(), p.getPaymentNumber(), p.getProvider(), p.getProviderOrderId(),
                p.getAmount(), "INR", "mock_checkout_key", p.getStatus().name());
    }

    OrderResponse toResponse(Order o, boolean detail, Map<UUID, Customer> cache) {
        Customer c = cache.computeIfAbsent(o.getCustomerId(), customers::get);
        List<OrderItemResponse> items = detail ? o.getItems().stream().map(i -> new OrderItemResponse(i.getId(), i.getLineNumber(),
                i.getProductId(), i.getSku(), i.getProductName(), i.getHsnCode(), i.getUnit(), i.getOrderedQuantity(),
                i.getAcceptedQuantity(), i.getPackedQuantity(), i.getDeliveredQuantity(), i.getCancelledQuantity(),
                i.getReturnedQuantity(), i.getInvoicedQuantity(), i.pendingQuantity(), i.getRate(), i.getDiscountAmount(),
                i.getTaxRate(), i.getTaxableAmount(), i.getCgstAmount().add(i.getSgstAmount()).add(i.getIgstAmount()),
                i.getLineTotal(), i.getUnitFactor(), i.isFreeItem(), i.getSchemeName())).toList() : null;
        List<OrderInvoiceRef> invoiceRefs = null;
        DeliveryResponse delivery = null;
        PaymentIntentResponse pending = null;
        BigDecimal total = o.getGrandTotal();
        if (detail) {
            List<Invoice> list = invoices.forOrder(o.getId());
            invoiceRefs = list.stream().filter(i -> !CurrentUser.isCustomer() || i.getStatus().isPosted())
                    .map(i -> new OrderInvoiceRef(i.getId(), i.getInvoiceNumber(), i.getStatus().name(), i.getGrandTotal(), i.outstanding())).toList();
            delivery = service.latestDelivery(o.getId()).map(d -> new DeliveryResponse(d.getAttemptNumber(), d.getDeliveryPerson(),
                    d.getDeliveryPersonMobile(), d.getVehicleNumber(), d.getNotes(), d.getDispatchedAt(), d.getDeliveredAt(),
                    d.getFailedAt(), d.getFailureReason(), d.getReceivedBy(), d.getProofOfDelivery())).orElse(null);
            if (o.getPaymentMethod() == PaymentMethod.ONLINE) {
                pending = payments.forOrder(o.getId()).stream()
                        .filter(p -> p.getStatus() == PaymentStatus.UNPAID || p.getStatus() == PaymentStatus.PENDING)
                        .reduce((a, b) -> b).map(OrderController::intent).orElse(null);
            }
            total = payments.effectiveTotal(o);
        }
        boolean terminal = o.getStatus() == OrderStatus.CANCELLED || o.getStatus() == OrderStatus.REJECTED || o.getStatus() == OrderStatus.DELIVERY_FAILED;
        return new OrderResponse(o.getId(), o.getOrderNumber(), o.getCustomerId(), c.getShopName(), c.getCustomerCode(),
                o.getStatus().name(), o.getPaymentStatus().name(), o.getPaymentMethod().name(), o.getCreditApprovalStatus().name(),
                o.getSource(), o.getDeliveryName(), o.deliveryAddress(), o.getDeliveryStateCode(), o.getContactMobile(),
                o.getOrderNote(), o.isInterState(), o.getSubtotal(), o.getDiscountTotal(), o.getTaxableTotal(), o.getCgstTotal(),
                o.getSgstTotal(), o.getIgstTotal(), o.getRoundOff(), o.getGrandTotal(), o.getPaidAmount(),
                terminal ? BigDecimal.ZERO : total.subtract(o.getPaidAmount()).max(BigDecimal.ZERO), o.getPlacedAt(),
                o.getCancelReason(), o.getRejectReason(), service.customerCanCancel(o), items, invoiceRefs, delivery, pending,
                o.getUpdatedAt());
    }
}
