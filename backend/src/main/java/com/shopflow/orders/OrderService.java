package com.shopflow.orders;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.billing.CreditNote;
import com.shopflow.billing.CreditNoteService;
import com.shopflow.billing.Invoice;
import com.shopflow.billing.InvoiceItem;
import com.shopflow.billing.InvoiceService;
import com.shopflow.billing.TaxCalculator;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettings;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.idempotency.IdempotencyService;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.customers.CreditService;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerAddress;
import com.shopflow.customers.CustomerService;
import com.shopflow.inventory.InventoryService;
import com.shopflow.inventory.StockMovement.MovementType;
import com.shopflow.notifications.NotificationService;
import com.shopflow.orders.OrderDtos.AcceptLine;
import com.shopflow.orders.OrderDtos.AcceptOrderRequest;
import com.shopflow.orders.OrderDtos.CreateOrderRequest;
import com.shopflow.orders.OrderDtos.DeliverLine;
import com.shopflow.orders.OrderDtos.DeliverRequest;
import com.shopflow.orders.OrderDtos.DispatchRequest;
import com.shopflow.orders.OrderDtos.OrderLineRequest;
import com.shopflow.orders.OrderRepositories.DeliveryRepository;
import com.shopflow.orders.OrderRepositories.OrderRepository;
import com.shopflow.orders.OrderRepositories.OrderStatusHistoryRepository;
import com.shopflow.payments.Payment;
import com.shopflow.payments.PaymentMethod;
import com.shopflow.payments.PaymentService;
import com.shopflow.products.PricingService;
import com.shopflow.products.Product;
import com.shopflow.products.ProductService;
import com.shopflow.security.CurrentUser;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Customer ordering and the order state machine (§7, §19, §20, §21). Order creation validates and reserves stock
 * atomically (§76); every transition writes an immutable status-history row and an audit record.
 */
@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private final OrderRepository orders;
    private final OrderStatusHistoryRepository history;
    private final DeliveryRepository deliveries;
    private final CartService cartService;
    private final CustomerService customers;
    private final CreditService credit;
    private final ProductService products;
    private final PricingService pricing;
    private final InventoryService inventory;
    private final TaxCalculator calculator;
    private final PaymentService payments;
    private final InvoiceService invoices;
    private final CreditNoteService creditNotes;
    private final DocumentSequenceService sequences;
    private final IdempotencyService idempotency;
    private final BusinessContext businessContext;
    private final BusinessSettingsService settings;
    private final NotificationService notifications;
    private final AuditService audit;

    public OrderService(OrderRepository orders, OrderStatusHistoryRepository history, DeliveryRepository deliveries,
                        CartService cartService, CustomerService customers, CreditService credit, ProductService products,
                        PricingService pricing, InventoryService inventory, TaxCalculator calculator,
                        PaymentService payments, InvoiceService invoices, CreditNoteService creditNotes,
                        DocumentSequenceService sequences, IdempotencyService idempotency, BusinessContext businessContext,
                        BusinessSettingsService settings, NotificationService notifications, AuditService audit) {
        this.orders = orders;
        this.history = history;
        this.deliveries = deliveries;
        this.cartService = cartService;
        this.customers = customers;
        this.credit = credit;
        this.products = products;
        this.pricing = pricing;
        this.inventory = inventory;
        this.calculator = calculator;
        this.payments = payments;
        this.invoices = invoices;
        this.creditNotes = creditNotes;
        this.sequences = sequences;
        this.idempotency = idempotency;
        this.businessContext = businessContext;
        this.settings = settings;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ---------------------------------------------------------------- queries

    public Order get(UUID id) {
        return orders.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order"));
    }

    /** Customers can only see their own orders (object-level authorization, §114). */
    public Order getForCurrentUser(UUID id) {
        Order order = get(id);
        if (CurrentUser.isCustomer() && !order.getCustomerId().equals(CurrentUser.customerId())) {
            throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order");
        }
        return order;
    }

    public List<OrderStatusHistory> history(UUID orderId) {
        return history.findByOrderIdOrderByChangedAtAsc(orderId);
    }

    public java.util.Optional<Delivery> latestDelivery(UUID orderId) {
        return deliveries.findFirstByOrderIdOrderByAttemptNumberDesc(orderId);
    }

    public Page<Order> search(String q, UUID customerId, List<OrderStatus> statuses, OrderPaymentStatus paymentStatus,
                              LocalDate from, LocalDate to, Pageable pageable) {
        Specification<Order> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            if (CurrentUser.isCustomer()) {
                p.add(cb.equal(root.get("customerId"), CurrentUser.customerId()));
            } else if (customerId != null) {
                p.add(cb.equal(root.get("customerId"), customerId));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                p.add(cb.or(cb.like(cb.lower(root.get("orderNumber")), like), cb.like(cb.lower(root.get("deliveryName")), like)));
            }
            if (statuses != null && !statuses.isEmpty()) {
                p.add(root.get("status").in(statuses));
            }
            if (paymentStatus != null) {
                p.add(cb.equal(root.get("paymentStatus"), paymentStatus));
            }
            if (from != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("placedAt"), from.atStartOfDay(businessContext.zone()).toInstant()));
            }
            if (to != null) {
                p.add(cb.lessThan(root.get("placedAt"), to.plusDays(1).atStartOfDay(businessContext.zone()).toInstant()));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return orders.findAll(spec, pageable);
    }

    // ---------------------------------------------------------------- creation

    /** Returns the created order id (idempotent per Idempotency-Key). */
    @Transactional
    public UUID create(CreateOrderRequest r, String idempotencyKey) {
        return idempotency.execute("order.create", CurrentUser.id(), idempotencyKey, () -> doCreate(r).getId());
    }

    private Order doCreate(CreateOrderRequest r) {
        boolean byCustomer = CurrentUser.isCustomer();
        Customer customer;
        if (byCustomer) {
            customer = customers.currentApprovedCustomer();
        } else {
            if (r.customerId() == null) {
                throw BusinessException.validation("customerId", "customerId is required when staff place an order");
            }
            customer = customers.get(r.customerId());
            CustomerService.requireApproved(customer);
        }
        if (r.paymentMethod() == PaymentMethod.OTHER) {
            throw BusinessException.validation("paymentMethod", "Choose ONLINE, CASH, UPI, BANK_TRANSFER or CREDIT");
        }
        CustomerAddress address = r.addressId() != null
                ? customers.address(customer.getId(), r.addressId())
                : customers.defaultAddress(customer.getId())
                .orElseThrow(() -> BusinessException.validation("addressId", "Add a delivery address before placing an order"));

        boolean fromCart = r.items() == null || r.items().isEmpty();
        Map<UUID, BigDecimal> requested = new LinkedHashMap<>();
        if (fromCart) {
            if (!byCustomer) {
                throw BusinessException.validation("items", "Items are required");
            }
            cartService.cart(customer.getId()).getItems().forEach(i -> requested.merge(i.getProductId(), i.getQuantity(), BigDecimal::add));
        } else {
            for (OrderLineRequest l : r.items()) {
                requested.merge(l.productId(), Money.qty(l.quantity()), BigDecimal::add);
            }
        }
        if (requested.isEmpty()) {
            throw new BusinessException(ErrorCode.CART_EMPTY, "Your cart is empty");
        }
        Map<UUID, Product> productMap = products.getAll(requested.keySet()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        for (UUID productId : requested.keySet()) {
            Product p = productMap.get(productId);
            if (p == null) {
                throw BusinessException.notFound(ErrorCode.PRODUCT_NOT_FOUND, "Product " + productId);
            }
            if (!p.isActive()) {
                throw new BusinessException(ErrorCode.PRODUCT_INACTIVE, p.getName() + " is no longer available");
            }
        }

        boolean interState = TaxCalculator.isInterState(settings.business().getStateCode(), address.getStateCode());
        Order order = new Order();
        order.setBusinessId(businessContext.businessId());
        order.setOrderNumber(sequences.next(DocumentType.ORDER, businessContext.today()));
        order.setCustomerId(customer.getId());
        order.setStatus(OrderStatus.PLACED);
        order.setPaymentMethod(r.paymentMethod());
        order.setPaymentStatus(r.paymentMethod() == PaymentMethod.CREDIT ? OrderPaymentStatus.CREDIT : OrderPaymentStatus.PENDING);
        order.setSource(byCustomer ? "CUSTOMER" : "STAFF");
        order.setDeliveryName(customer.getShopName());
        order.setDeliveryLine1(address.getAddressLine1());
        order.setDeliveryLine2(address.getAddressLine2());
        order.setDeliveryCity(address.getCity());
        order.setDeliveryState(address.getState());
        order.setDeliveryStateCode(address.getStateCode());
        order.setDeliveryPincode(address.getPincode());
        order.setContactMobile(customer.getMobileNumber());
        order.setOrderNote(Validation.trim(r.orderNote()));
        order.setInterState(interState);
        order.setPlacedAt(Instant.now());
        order.setPlacedBy(CurrentUser.id());
        int line = 1;
        for (Map.Entry<UUID, BigDecimal> e : requested.entrySet()) {
            Product p = productMap.get(e.getKey());
            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setLineNumber(line++);
            item.setProductId(p.getId());
            item.setProductName(p.getName());
            item.setSku(p.getSku());
            item.setHsnCode(p.getHsnCode());
            item.setUnit(p.getUnit().name());
            item.setOrderedQuantity(e.getValue());
            item.setRate(pricing.priceFor(p, customer.getId()));
            item.setTaxRate(p.getGstRate());
            order.getItems().add(item);
        }
        recalculate(order);

        if (r.paymentMethod() == PaymentMethod.CREDIT) {
            CreditService.CreditDecision decision = credit.evaluate(customer.getId(), order.getGrandTotal());
            switch (decision.decision()) {
                case NOT_ENABLED -> throw new BusinessException(ErrorCode.CREDIT_NOT_ENABLED, "Credit purchase is not enabled for this account");
                case BLOCKED -> throw new BusinessException(ErrorCode.CREDIT_LIMIT_EXCEEDED,
                        "This order exceeds the available credit limit of " + decision.creditLimit());
                case REQUIRES_APPROVAL -> order.setCreditApprovalStatus(Order.CreditApprovalStatus.PENDING);
                case ALLOWED, ALLOWED_OVER_LIMIT -> order.setCreditApprovalStatus(Order.CreditApprovalStatus.NOT_REQUIRED);
            }
        }

        // Reserve in product-id order so concurrent orders lock rows consistently and cannot deadlock.
        order.getItems().stream().sorted(Comparator.comparing(OrderItem::getProductId)).forEach(item -> {
            inventory.reserve(item.getProductId(), item.getOrderedQuantity());
            item.setReservedQuantity(item.getOrderedQuantity());
        });
        orders.saveAndFlush(order);
        recordStatus(order, null, OrderStatus.PLACED, null);
        if (fromCart) {
            cartService.clear(customer.getId());
        }
        audit.record(AuditAction.ORDER_CREATED, "ORDER", order.getId(), null, Map.of(
                "orderNumber", order.getOrderNumber(), "grandTotal", order.getGrandTotal(), "paymentMethod", r.paymentMethod(),
                "creditApproval", order.getCreditApprovalStatus()));
        notifications.notifyStaff("ORDER_PLACED", "New order " + order.getOrderNumber(),
                customer.getShopName() + " placed an order for " + order.getGrandTotal()
                        + (order.getCreditApprovalStatus() == Order.CreditApprovalStatus.PENDING ? " (credit approval needed)" : ""),
                "ORDER", order.getId());
        if (r.paymentMethod() == PaymentMethod.ONLINE) {
            try {
                payments.createOrderIntent(order.getId());
            } catch (BusinessException e) {
                // The order stands; the customer retries payment from the order screen (§113).
                log.warn("Payment intent for {} not created: {}", order.getOrderNumber(), e.getMessage());
            }
        }
        return order;
    }

    /** Re-prices lines for their effective quantity (accepted − cancelled once accepted). */
    private void recalculate(Order order) {
        List<TaxCalculator.Line> lines = new ArrayList<>();
        List<OrderItem> included = new ArrayList<>();
        for (OrderItem i : order.getItems()) {
            BigDecimal qty = effectiveQuantity(order, i);
            if (qty.signum() > 0) {
                lines.add(new TaxCalculator.Line(qty, i.getRate(), i.getDiscountPercent(), null, i.getTaxRate(), i.getHsnCode()));
                included.add(i);
            } else {
                i.setGrossAmount(Money.ZERO);
                i.setTaxableAmount(Money.ZERO);
                i.setCgstAmount(Money.ZERO);
                i.setSgstAmount(Money.ZERO);
                i.setIgstAmount(Money.ZERO);
                i.setLineTotal(Money.ZERO);
                i.setDiscountAmount(Money.ZERO);
            }
        }
        TaxCalculator.Result calc = lines.isEmpty()
                ? calculator.calculate(List.of(), order.isInterState(), false)
                : calculator.calculate(lines, order.isInterState(), settings.taxSettings().isRoundOffEnabled());
        for (int idx = 0; idx < included.size(); idx++) {
            OrderItem i = included.get(idx);
            TaxCalculator.LineResult lr = calc.lines().get(idx);
            i.setDiscountAmount(lr.discountAmount());
            i.setGrossAmount(lr.gross());
            i.setTaxableAmount(lr.taxable());
            i.setCgstAmount(lr.cgst());
            i.setSgstAmount(lr.sgst());
            i.setIgstAmount(lr.igst());
            i.setLineTotal(lr.total());
        }
        order.setSubtotal(calc.subtotal());
        order.setDiscountTotal(calc.discount());
        order.setTaxableTotal(calc.taxable());
        order.setCgstTotal(calc.cgst());
        order.setSgstTotal(calc.sgst());
        order.setIgstTotal(calc.igst());
        order.setRoundOff(calc.roundOff());
        order.setGrandTotal(calc.grandTotal());
    }

    private static BigDecimal effectiveQuantity(Order order, OrderItem i) {
        BigDecimal base = order.getStatus() == OrderStatus.PLACED ? i.getOrderedQuantity() : i.getAcceptedQuantity();
        return base.subtract(i.getCancelledQuantity()).max(BigDecimal.ZERO);
    }

    // ---------------------------------------------------------------- transitions

    @Transactional
    public Order accept(UUID id, AcceptOrderRequest r) {
        Order order = lock(id);
        transition(order, OrderStatus.ACCEPTED);
        Map<UUID, BigDecimal> accepted = new java.util.HashMap<>();
        if (r != null && r.items() != null) {
            for (AcceptLine l : r.items()) {
                accepted.put(l.orderItemId(), Money.qty(l.acceptedQuantity()));
            }
        }
        BigDecimal totalAccepted = BigDecimal.ZERO;
        for (OrderItem item : order.getItems().stream().sorted(Comparator.comparing(OrderItem::getProductId)).toList()) {
            BigDecimal qty = accepted.getOrDefault(item.getId(), item.getOrderedQuantity());
            if (qty.compareTo(item.getOrderedQuantity()) > 0) {
                throw BusinessException.validation("acceptedQuantity", "Cannot accept more than ordered for " + item.getProductName());
            }
            item.setAcceptedQuantity(qty);
            BigDecimal release = item.getReservedQuantity().subtract(qty);
            if (release.signum() > 0) {
                inventory.release(item.getProductId(), release);
                item.setReservedQuantity(qty);
            }
            totalAccepted = totalAccepted.add(qty);
        }
        if (totalAccepted.signum() == 0) {
            throw BusinessException.validation("items", "Accept at least one item, or reject the order");
        }
        if (order.getCreditApprovalStatus() == Order.CreditApprovalStatus.PENDING) {
            // Accepting a pending-credit order is the admin approval required by the credit policy (§10).
            order.setCreditApprovalStatus(Order.CreditApprovalStatus.APPROVED);
        }
        order.setStatus(OrderStatus.ACCEPTED);
        recalculate(order);
        payments.refreshOrder(order.getId());
        recordStatus(order, OrderStatus.PLACED, OrderStatus.ACCEPTED, r == null ? null : r.note());
        audit.record(AuditAction.ORDER_ACCEPTED, "ORDER", id, Map.of("status", OrderStatus.PLACED),
                Map.of("status", OrderStatus.ACCEPTED, "grandTotal", order.getGrandTotal()));
        notifyCustomer(order, "ORDER_ACCEPTED", "Order " + order.getOrderNumber() + " accepted", "Your order has been accepted.");
        return order;
    }

    @Transactional
    public Order reject(UUID id, String reason) {
        Order order = lock(id);
        transition(order, OrderStatus.REJECTED);
        releaseAll(order);
        order.setStatus(OrderStatus.REJECTED);
        order.setRejectReason(reason);
        if (order.getCreditApprovalStatus() == Order.CreditApprovalStatus.PENDING) {
            order.setCreditApprovalStatus(Order.CreditApprovalStatus.REJECTED);
        }
        refundOnlinePayments(order, "Order rejected");
        payments.refreshOrder(order.getId());
        recordStatus(order, OrderStatus.PLACED, OrderStatus.REJECTED, reason);
        audit.record(AuditAction.ORDER_REJECTED, "ORDER", id, Map.of("status", OrderStatus.PLACED),
                Map.of("status", OrderStatus.REJECTED, "reason", reason));
        notifyCustomer(order, "ORDER_REJECTED", "Order " + order.getOrderNumber() + " was not accepted", reason);
        return order;
    }

    /**
     * Customers may cancel until the configured status (default: before packing); staff may cancel any time before
     * delivery. After delivery the return workflow applies (§19).
     */
    @Transactional
    public Order cancel(UUID id, String reason) {
        Order order = lock(id);
        if (CurrentUser.isCustomer()) {
            if (!order.getCustomerId().equals(CurrentUser.customerId())) {
                throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order");
            }
            if (!customerCanCancel(order)) {
                throw new BusinessException(ErrorCode.ORDER_CANNOT_CANCEL, "This order can no longer be cancelled. Please contact the shop.");
            }
        }
        if (!order.getStatus().canTransitionTo(OrderStatus.CANCELLED)) {
            throw new BusinessException(ErrorCode.ORDER_CANNOT_CANCEL,
                    order.getStatus() == OrderStatus.DELIVERED || order.getStatus() == OrderStatus.COMPLETED
                            ? "Delivered orders cannot be cancelled; create a sales return instead"
                            : "The order cannot be cancelled in status " + order.getStatus());
        }
        OrderStatus previous = order.getStatus();
        voidOrderFinancials(order, "Order cancelled: " + reason);
        releaseAll(order);
        order.setStatus(OrderStatus.CANCELLED);
        order.setCancelReason(reason);
        payments.refreshOrder(order.getId());
        recordStatus(order, previous, OrderStatus.CANCELLED, reason);
        audit.record(AuditAction.ORDER_CANCELLED, "ORDER", id, Map.of("status", previous),
                Map.of("status", OrderStatus.CANCELLED, "reason", reason));
        if (CurrentUser.isCustomer()) {
            notifications.notifyStaff("ORDER_CANCELLED", "Order " + order.getOrderNumber() + " cancelled by customer", reason, "ORDER", id);
        } else {
            notifyCustomer(order, "ORDER_CANCELLED", "Order " + order.getOrderNumber() + " cancelled", reason);
        }
        return order;
    }

    public boolean customerCanCancel(Order order) {
        BusinessSettings.CustomerCancelUntil until = settings.settings().getCustomerCancelAllowedUntil();
        return switch (until) {
            case NEVER -> false;
            case PLACED -> order.getStatus() == OrderStatus.PLACED;
            case ACCEPTED -> order.getStatus() == OrderStatus.PLACED || order.getStatus() == OrderStatus.ACCEPTED;
        };
    }

    @Transactional
    public Order startPacking(UUID id, String note) {
        Order order = lock(id);
        requireCreditApproved(order);
        transition(order, OrderStatus.PACKING);
        order.getItems().forEach(i -> i.setPackedQuantity(i.getAcceptedQuantity().subtract(i.getCancelledQuantity())));
        return move(order, OrderStatus.PACKING, note);
    }

    @Transactional
    public Order readyForDelivery(UUID id, String note) {
        Order order = lock(id);
        transition(order, OrderStatus.READY_FOR_DELIVERY);
        return move(order, OrderStatus.READY_FOR_DELIVERY, note);
    }

    @Transactional
    public Order outForDelivery(UUID id, DispatchRequest r) {
        Order order = lock(id);
        transition(order, OrderStatus.OUT_FOR_DELIVERY);
        int attempt = deliveries.findFirstByOrderIdOrderByAttemptNumberDesc(id).map(d -> d.getAttemptNumber() + 1).orElse(1);
        Delivery d = new Delivery();
        d.setOrderId(id);
        d.setAttemptNumber(attempt);
        if (r != null) {
            d.setDeliveryPerson(Validation.trim(r.deliveryPerson()));
            d.setDeliveryPersonMobile(MobileNumbers.normalizeOptional(r.deliveryPersonMobile()));
            d.setVehicleNumber(Validation.upper(r.vehicleNumber()));
            d.setNotes(Validation.trim(r.notes()));
        }
        d.setDispatchedAt(Instant.now());
        deliveries.save(d);
        return move(order, OrderStatus.OUT_FOR_DELIVERY, r == null ? null : r.notes());
    }

    /**
     * Records delivery (full or partial). Delivered stock leaves the warehouse (SALE_OUT) and its reservation is
     * released; undelivered quantities are cancelled and, if already invoiced, credited via a SHORT_DELIVERY credit
     * note so they are never billed (§20).
     */
    @Transactional
    public Order deliver(UUID id, DeliverRequest r) {
        Order order = lock(id);
        transition(order, OrderStatus.DELIVERED);
        Map<UUID, BigDecimal> requested = new java.util.HashMap<>();
        if (r != null && r.items() != null) {
            for (DeliverLine l : r.items()) {
                requested.put(l.orderItemId(), Money.qty(l.deliveredQuantity()));
            }
        }
        Map<UUID, BigDecimal> shortfalls = new java.util.HashMap<>();
        BigDecimal delivered = BigDecimal.ZERO;
        for (OrderItem item : order.getItems().stream().sorted(Comparator.comparing(OrderItem::getProductId)).toList()) {
            BigDecimal deliverable = item.getAcceptedQuantity().subtract(item.getCancelledQuantity()).subtract(item.getDeliveredQuantity());
            BigDecimal qty = requested.getOrDefault(item.getId(), deliverable);
            if (qty.compareTo(deliverable) > 0) {
                throw BusinessException.validation("deliveredQuantity", "Cannot deliver more than " + deliverable.stripTrailingZeros().toPlainString()
                        + " of " + item.getProductName());
            }
            if (qty.signum() > 0) {
                inventory.post(item.getProductId(), MovementType.SALE_OUT, qty, null, "ORDER", order.getId(),
                        order.getOrderNumber(), "Delivered", qty);
                item.setReservedQuantity(item.getReservedQuantity().subtract(qty).max(BigDecimal.ZERO));
                item.setDeliveredQuantity(item.getDeliveredQuantity().add(qty));
                delivered = delivered.add(qty);
            }
            BigDecimal shortfall = deliverable.subtract(qty);
            if (shortfall.signum() > 0) {
                item.setCancelledQuantity(item.getCancelledQuantity().add(shortfall));
                shortfalls.put(item.getId(), shortfall);
            }
            if (item.getReservedQuantity().signum() > 0) {
                inventory.release(item.getProductId(), item.getReservedQuantity());
                item.setReservedQuantity(BigDecimal.ZERO);
            }
        }
        if (delivered.signum() == 0) {
            throw BusinessException.validation("items", "Nothing was delivered; mark the delivery as failed instead");
        }
        if (!shortfalls.isEmpty()) {
            creditShortDelivery(order, shortfalls);
        }
        deliveries.findFirstByOrderIdOrderByAttemptNumberDesc(id).ifPresent(d -> {
            d.setDeliveredAt(Instant.now());
            if (r != null) {
                d.setReceivedBy(Validation.trim(r.receivedBy()));
                d.setProofOfDelivery(Validation.trim(r.proofOfDelivery()));
                d.setCustomerConfirmed(Boolean.TRUE.equals(r.customerConfirmed()));
                if (r.notes() != null) {
                    d.setNotes(Validation.trim(r.notes()));
                }
            }
        });
        order.setStatus(OrderStatus.DELIVERED);
        recalculate(order);
        payments.refreshOrder(order.getId());
        recordStatus(order, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED,
                shortfalls.isEmpty() ? null : "Partial delivery: " + shortfalls.size() + " line(s) short");
        audit.record(AuditAction.ORDER_DELIVERED, "ORDER", id, Map.of("status", OrderStatus.OUT_FOR_DELIVERY),
                Map.of("status", OrderStatus.DELIVERED, "partial", !shortfalls.isEmpty()));
        notifyCustomer(order, "ORDER_DELIVERED", "Order " + order.getOrderNumber() + " delivered", "Thank you for your order.");
        return order;
    }

    private void creditShortDelivery(Order order, Map<UUID, BigDecimal> shortfalls) {
        for (Invoice invoice : invoices.forOrder(order.getId())) {
            if (!invoice.getStatus().isPosted()) {
                continue;
            }
            List<CreditNoteService.Line> lines = new ArrayList<>();
            for (InvoiceItem ii : invoice.getItems()) {
                OrderItem oi = order.getItems().stream().filter(o -> o.getId().equals(ii.getOrderItemId())).findFirst().orElse(null);
                if (oi == null) {
                    continue;
                }
                // Invoiced beyond what can now be delivered.
                BigDecimal overBilled = oi.getInvoicedQuantity().subtract(oi.getAcceptedQuantity().subtract(oi.getCancelledQuantity()));
                BigDecimal alreadyCredited = creditNotes.creditedQuantity(invoice.getId(), ii.getId());
                BigDecimal toCredit = overBilled.subtract(alreadyCredited).min(ii.getQuantity().subtract(alreadyCredited));
                if (toCredit.signum() > 0) {
                    lines.add(new CreditNoteService.Line(ii, toCredit));
                }
            }
            if (!lines.isEmpty()) {
                creditNotes.issue(invoice, lines, CreditNote.ReasonType.SHORT_DELIVERY, "Short delivery on " + order.getOrderNumber(),
                        "ORDER", order.getId());
            }
        }
    }

    /** Terminal: the delivery could not be completed. Stock is released and any invoice is cancelled. */
    @Transactional
    public Order deliveryFailed(UUID id, String reason) {
        Order order = lock(id);
        transition(order, OrderStatus.DELIVERY_FAILED);
        voidOrderFinancials(order, "Delivery failed: " + reason);
        releaseAll(order);
        deliveries.findFirstByOrderIdOrderByAttemptNumberDesc(id).ifPresent(d -> {
            d.setFailedAt(Instant.now());
            d.setFailureReason(reason);
        });
        order.setStatus(OrderStatus.DELIVERY_FAILED);
        order.setCancelReason(reason);
        payments.refreshOrder(order.getId());
        recordStatus(order, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERY_FAILED, reason);
        audit.record(AuditAction.ORDER_STATUS_CHANGED, "ORDER", id, Map.of("status", OrderStatus.OUT_FOR_DELIVERY),
                Map.of("status", OrderStatus.DELIVERY_FAILED, "reason", reason));
        notifyCustomer(order, "ORDER_DELIVERY_FAILED", "Delivery of " + order.getOrderNumber() + " failed", reason);
        return order;
    }

    @Transactional
    public Order complete(UUID id, String note) {
        Order order = lock(id);
        transition(order, OrderStatus.COMPLETED);
        return move(order, OrderStatus.COMPLETED, note);
    }

    // ---------------------------------------------------------------- helpers

    private Order lock(UUID id) {
        return orders.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order"));
    }

    private static void transition(Order order, OrderStatus next) {
        if (!order.getStatus().canTransitionTo(next)) {
            throw new BusinessException(ErrorCode.ORDER_INVALID_STATUS,
                    "Cannot move order from " + order.getStatus() + " to " + next);
        }
    }

    private static void requireCreditApproved(Order order) {
        if (order.getCreditApprovalStatus() == Order.CreditApprovalStatus.PENDING) {
            throw new BusinessException(ErrorCode.ORDER_INVALID_STATUS, "Credit approval is pending for this order");
        }
    }

    private Order move(Order order, OrderStatus next, String note) {
        OrderStatus previous = order.getStatus();
        order.setStatus(next);
        recordStatus(order, previous, next, note);
        audit.record(AuditAction.ORDER_STATUS_CHANGED, "ORDER", order.getId(), Map.of("status", previous), Map.of("status", next));
        String label = switch (next) {
            case PACKING -> "is being packed";
            case READY_FOR_DELIVERY -> "is ready for delivery";
            case OUT_FOR_DELIVERY -> "is out for delivery";
            case COMPLETED -> "is completed";
            default -> "was updated";
        };
        notifyCustomer(order, "ORDER_" + next, "Order " + order.getOrderNumber() + " " + label, null);
        return order;
    }

    private void recordStatus(Order order, OrderStatus previous, OrderStatus next, String note) {
        history.save(new OrderStatusHistory(order.getId(), previous, next, CurrentUser.idIfPresent().orElse(null), Validation.trim(note)));
    }

    private void releaseAll(Order order) {
        order.getItems().stream().sorted(Comparator.comparing(OrderItem::getProductId)).forEach(item -> {
            if (item.getReservedQuantity().signum() > 0) {
                inventory.release(item.getProductId(), item.getReservedQuantity());
                item.setReservedQuantity(BigDecimal.ZERO);
            }
            BigDecimal open = effectiveQuantity(order, item).subtract(item.getDeliveredQuantity());
            if (open.signum() > 0) {
                item.setCancelledQuantity(item.getCancelledQuantity().add(open));
            }
        });
    }

    /** Cancels the order's invoices and refunds captured online payments. Cash advances stay on the ledger. */
    private void voidOrderFinancials(Order order, String reason) {
        for (Invoice invoice : invoices.forOrder(order.getId())) {
            invoices.cancel(invoice.getId(), reason);
        }
        refundOnlinePayments(order, reason);
    }

    private void refundOnlinePayments(Order order, String reason) {
        for (Payment p : payments.forOrder(order.getId())) {
            if (p.getMethod() == PaymentMethod.ONLINE && PaymentService.RECEIVED.contains(p.getStatus())
                    && p.getAmount().subtract(p.getRefundedAmount()).signum() > 0) {
                payments.refund(p.getId(), null, reason);
            }
        }
    }

    private void notifyCustomer(Order order, String type, String title, String body) {
        Customer c = customers.get(order.getCustomerId());
        if (c.getUserId() != null) {
            notifications.notifyUser(c.getUserId(), type, title, body, "ORDER", order.getId());
        }
    }
}
