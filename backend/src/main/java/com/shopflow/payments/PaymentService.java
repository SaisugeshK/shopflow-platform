package com.shopflow.payments;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.billing.BillingRepositories.InvoiceRepository;
import com.shopflow.billing.Invoice;
import com.shopflow.billing.InvoiceStatus;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.idempotency.IdempotencyService;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerLedgerEntry.EntryType;
import com.shopflow.customers.CustomerLedgerService;
import com.shopflow.customers.CustomerService;
import com.shopflow.integrations.ProviderException;
import com.shopflow.integrations.payment.PaymentGateway;
import com.shopflow.integrations.payment.PaymentGateway.GatewayEvent;
import com.shopflow.notifications.NotificationService;
import com.shopflow.orders.Order;
import com.shopflow.orders.OrderPaymentStatus;
import com.shopflow.orders.OrderRepositories.OrderRepository;
import com.shopflow.orders.OrderStatus;
import com.shopflow.payments.PaymentDtos.RecordPaymentRequest;
import com.shopflow.payments.PaymentRepositories.PaymentAllocationRepository;
import com.shopflow.payments.PaymentRepositories.PaymentReceiptRepository;
import com.shopflow.payments.PaymentRepositories.PaymentRepository;
import com.shopflow.security.CurrentUser;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Customer payments: recording, online intents, capture, allocation to invoices, cancellation and refunds.
 * Payment posting is transactional: payment + allocation + customer ledger succeed together (§76).
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    /** Transaction statuses that represent money actually received. */
    public static final Set<PaymentStatus> RECEIVED = EnumSet.of(PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_PAID);
    private static final List<InvoiceStatus> OPEN_INVOICE = List.of(InvoiceStatus.GENERATED, InvoiceStatus.SENT,
            InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.CREDIT);

    private final PaymentRepository payments;
    private final PaymentAllocationRepository allocations;
    private final PaymentReceiptRepository receipts;
    private final InvoiceRepository invoices;
    private final OrderRepository orders;
    private final CustomerLedgerService ledger;
    private final CustomerService customers;
    private final PaymentGateway gateway;
    private final DocumentSequenceService sequences;
    private final IdempotencyService idempotency;
    private final BusinessContext businessContext;
    private final NotificationService notifications;
    private final AuditService audit;

    public PaymentService(PaymentRepository payments, PaymentAllocationRepository allocations,
                          PaymentReceiptRepository receipts, InvoiceRepository invoices, OrderRepository orders,
                          CustomerLedgerService ledger, CustomerService customers, PaymentGateway gateway,
                          DocumentSequenceService sequences, IdempotencyService idempotency,
                          BusinessContext businessContext, NotificationService notifications, AuditService audit) {
        this.payments = payments;
        this.allocations = allocations;
        this.receipts = receipts;
        this.invoices = invoices;
        this.orders = orders;
        this.ledger = ledger;
        this.customers = customers;
        this.gateway = gateway;
        this.sequences = sequences;
        this.idempotency = idempotency;
        this.businessContext = businessContext;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ---------------------------------------------------------------- queries

    public Payment get(UUID id) {
        return payments.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment"));
    }

    /** Customers may only read their own payments. */
    public Payment getForCurrentUser(UUID id) {
        Payment p = get(id);
        if (CurrentUser.isCustomer() && !p.getCustomerId().equals(CurrentUser.customerId())) {
            throw BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment");
        }
        return p;
    }

    public List<PaymentAllocation> allocationsFor(UUID paymentId) {
        return allocations.findByPaymentIdAndReversedFalse(paymentId);
    }

    public List<Payment> forOrder(UUID orderId) {
        return payments.findByOrderIdOrderByCreatedAtAsc(orderId);
    }

    public List<Payment> forInvoice(UUID invoiceId) {
        return payments.findByInvoiceIdOrderByCreatedAtAsc(invoiceId);
    }

    public Page<Payment> search(UUID customerId, PaymentMethod method, PaymentStatus status, LocalDate from, LocalDate to,
                                String q, Pageable pageable) {
        Specification<Payment> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            if (customerId != null) {
                p.add(cb.equal(root.get("customerId"), customerId));
            }
            if (method != null) {
                p.add(cb.equal(root.get("method"), method));
            }
            if (status != null) {
                p.add(cb.equal(root.get("status"), status));
            }
            if (from != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from.atStartOfDay(businessContext.zone()).toInstant()));
            }
            if (to != null) {
                p.add(cb.lessThan(root.get("createdAt"), to.plusDays(1).atStartOfDay(businessContext.zone()).toInstant()));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                p.add(cb.or(cb.like(cb.lower(root.get("paymentNumber")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("referenceNumber"), "")), like)));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return payments.findAll(spec, pageable);
    }

    // ---------------------------------------------------------------- manual payments

    @Transactional
    public Payment recordManual(RecordPaymentRequest r, String idempotencyKey) {
        UUID id = idempotency.execute("payment.record", CurrentUser.id(), idempotencyKey, () -> doRecordManual(r).getId());
        return get(id);
    }

    private Payment doRecordManual(RecordPaymentRequest r) {
        if (r.method() == PaymentMethod.ONLINE || r.method() == PaymentMethod.CREDIT) {
            throw BusinessException.validation("method", "Online payments are captured by the gateway; CREDIT is not a payment");
        }
        Customer customer = customers.get(r.customerId());
        BigDecimal amount = Money.of(r.amount());
        Invoice invoice = null;
        UUID orderId = r.orderId();
        if (r.invoiceId() != null) {
            invoice = invoices.findByIdForUpdate(r.invoiceId())
                    .orElseThrow(() -> BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, "Invoice"));
            if (!invoice.getCustomerId().equals(customer.getId())) {
                throw BusinessException.validation("invoiceId", "Invoice belongs to another customer");
            }
            if (!invoice.getStatus().isPosted()) {
                throw new BusinessException(ErrorCode.INVOICE_INVALID_STATUS, "Payments can only be recorded against generated invoices");
            }
            if (amount.compareTo(invoice.outstanding()) > 0) {
                throw new BusinessException(ErrorCode.PAYMENT_INVALID_AMOUNT,
                        "Amount exceeds the invoice outstanding of " + invoice.outstanding());
            }
            orderId = invoice.getOrderId();
        } else if (orderId != null) {
            Order order = orders.findById(orderId).orElseThrow(() -> BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order"));
            if (!order.getCustomerId().equals(customer.getId())) {
                throw BusinessException.validation("orderId", "Order belongs to another customer");
            }
        }
        Instant paidAt = r.paidAt() != null ? r.paidAt() : Instant.now();
        if (paidAt.isAfter(Instant.now().plusSeconds(300))) {
            throw BusinessException.validation("paidAt", "Payment date cannot be in the future");
        }
        Payment p = newPayment(customer.getId(), amount, r.method(), PaymentStatus.CAPTURED, LocalDate.ofInstant(paidAt, businessContext.zone()));
        p.setInvoiceId(invoice == null ? null : invoice.getId());
        p.setOrderId(orderId);
        p.setReferenceNumber(Validation.trim(r.referenceNumber()));
        p.setNotes(Validation.trim(r.notes()));
        p.setPaidAt(paidAt);
        p.setCollectedBy(CurrentUser.id());
        payments.saveAndFlush(p);
        onMoneyReceived(p, invoice);
        audit.record(AuditAction.PAYMENT_CREATED, "PAYMENT", p.getId(), null, Map.of(
                "paymentNumber", p.getPaymentNumber(), "amount", amount, "method", r.method(),
                "customerId", customer.getId(), "invoiceId", String.valueOf(p.getInvoiceId())));
        return p;
    }

    private Payment newPayment(UUID customerId, BigDecimal amount, PaymentMethod method, PaymentStatus status, LocalDate date) {
        Payment p = new Payment();
        p.setBusinessId(businessContext.businessId());
        p.setPaymentNumber(sequences.next(DocumentType.PAYMENT, date));
        p.setCustomerId(customerId);
        p.setAmount(amount);
        p.setMethod(method);
        p.setStatus(status);
        p.setCreatedBy(CurrentUser.idIfPresent().orElse(null));
        return p;
    }

    /** Ledger credit, allocation, receipt and order refresh for money that has actually been received. */
    private void onMoneyReceived(Payment p, Invoice targetInvoice) {
        ledger.credit(p.getCustomerId(), EntryType.PAYMENT, "PAYMENT", p.getId(), p.getPaymentNumber(), p.getAmount(),
                "Payment received (" + p.getMethod() + ")");
        if (targetInvoice != null) {
            allocate(p, targetInvoice, Money.min(p.unallocated(), targetInvoice.outstanding()));
        } else if (p.getOrderId() != null) {
            invoices.findByOrderIdAndStatusNot(p.getOrderId(), InvoiceStatus.CANCELLED).stream()
                    .filter(i -> i.getStatus().isPosted()).findFirst()
                    .ifPresent(inv -> {
                        Invoice locked = invoices.findByIdForUpdate(inv.getId()).orElseThrow();
                        allocate(p, locked, Money.min(p.unallocated(), locked.outstanding()));
                    });
        } else {
            autoAllocate(p);
        }
        if (receipts.findByPaymentId(p.getId()).isEmpty()) {
            receipts.save(new PaymentReceipt(p.getId(), p.getPaymentNumber()));
        }
        refreshOrder(p.getOrderId());
    }

    /** Applies an advance to the customer's oldest open invoices (FIFO). */
    private void autoAllocate(Payment p) {
        for (Invoice open : invoices.findOpenForCustomer(p.getCustomerId(), OPEN_INVOICE)) {
            if (p.unallocated().signum() <= 0) {
                break;
            }
            Invoice locked = invoices.findByIdForUpdate(open.getId()).orElseThrow();
            BigDecimal amount = Money.min(p.unallocated(), locked.outstanding());
            if (amount.signum() > 0) {
                allocate(p, locked, amount);
                refreshOrder(locked.getOrderId());
            }
        }
    }

    private void allocate(Payment p, Invoice invoice, BigDecimal amount) {
        if (amount.signum() <= 0) {
            return;
        }
        allocations.save(new PaymentAllocation(p.getId(), invoice.getId(), amount));
        p.setAllocatedAmount(p.getAllocatedAmount().add(amount));
        invoice.setPaidAmount(invoice.getPaidAmount().add(amount));
        invoice.refreshStatus();
    }

    /**
     * Called when an invoice is generated: applies unallocated money already received — first payments made for
     * this invoice's order (e.g. online prepayment), then other customer advances.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void applyAdvances(Invoice invoice) {
        List<Payment> candidates = new ArrayList<>(payments.findUnallocatedForCustomer(invoice.getCustomerId()));
        candidates.removeIf(p -> !RECEIVED.contains(p.getStatus()));
        candidates.sort(Comparator.comparing((Payment p) -> invoice.getOrderId() != null && invoice.getOrderId().equals(p.getOrderId()) ? 0 : 1)
                .thenComparing(p -> p.getPaidAt() == null ? Instant.EPOCH : p.getPaidAt()));
        for (Payment candidate : candidates) {
            if (invoice.outstanding().signum() <= 0) {
                break;
            }
            Payment p = payments.findByIdForUpdate(candidate.getId()).orElseThrow();
            allocate(p, invoice, Money.min(p.unallocated(), invoice.outstanding()));
        }
    }

    /** Invoice cancellation: allocated money becomes a customer advance again (ledger is unaffected). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void reverseAllocations(Invoice invoice) {
        for (PaymentAllocation a : allocations.findByInvoiceIdAndReversedFalse(invoice.getId())) {
            Payment p = payments.findByIdForUpdate(a.getPaymentId()).orElseThrow();
            a.setReversed(true);
            a.setReversedAt(Instant.now());
            p.setAllocatedAmount(p.getAllocatedAmount().subtract(a.getAmount()));
            invoice.setPaidAmount(invoice.getPaidAmount().subtract(a.getAmount()));
        }
    }

    /** After a credit note, money paid beyond the reduced invoice total is released back to a customer advance. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void releaseExcess(Invoice invoice) {
        BigDecimal excess = invoice.getPaidAmount().subtract(invoice.getGrandTotal().subtract(invoice.getCreditedAmount()));
        List<PaymentAllocation> list = new ArrayList<>(allocations.findByInvoiceIdAndReversedFalse(invoice.getId()));
        list.sort(Comparator.comparing(PaymentAllocation::getCreatedAt).reversed());
        for (PaymentAllocation a : list) {
            if (excess.signum() <= 0) {
                break;
            }
            Payment p = payments.findByIdForUpdate(a.getPaymentId()).orElseThrow();
            BigDecimal release = Money.min(a.getAmount(), excess);
            a.setReversed(true);
            a.setReversedAt(Instant.now());
            p.setAllocatedAmount(p.getAllocatedAmount().subtract(a.getAmount()));
            invoice.setPaidAmount(invoice.getPaidAmount().subtract(a.getAmount()));
            BigDecimal keep = a.getAmount().subtract(release);
            if (keep.signum() > 0) {
                allocate(p, invoice, keep);
            }
            excess = excess.subtract(release);
        }
    }

    // ---------------------------------------------------------------- cancellation and refunds

    /** Voids a manually recorded payment that was entered by mistake. Online payments are refunded instead. */
    @Transactional
    public Payment cancel(UUID id, String reason) {
        Payment p = payments.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment"));
        if (p.getStatus() == PaymentStatus.CANCELLED) {
            return p;
        }
        if (!RECEIVED.contains(p.getStatus()) || p.getMethod() == PaymentMethod.ONLINE) {
            throw new BusinessException(ErrorCode.PAYMENT_INVALID_STATUS, "Only captured manual payments can be cancelled; refund online payments");
        }
        if (p.getRefundedAmount().signum() > 0) {
            throw new BusinessException(ErrorCode.PAYMENT_INVALID_STATUS, "A partially refunded payment cannot be cancelled");
        }
        releaseAllocations(p, p.getAllocatedAmount());
        ledger.debit(p.getCustomerId(), EntryType.PAYMENT_REVERSAL, "PAYMENT", p.getId(), p.getPaymentNumber(),
                p.getAmount(), "Payment cancelled: " + reason);
        PaymentStatus before = p.getStatus();
        p.setStatus(PaymentStatus.CANCELLED);
        p.setCancelledAt(Instant.now());
        p.setCancelledBy(CurrentUser.id());
        p.setCancelReason(reason.trim());
        refreshOrder(p.getOrderId());
        audit.record(AuditAction.PAYMENT_CANCELLED, "PAYMENT", id, Map.of("status", before), Map.of("status", p.getStatus(), "reason", reason));
        return p;
    }

    /**
     * Refunds money to the customer. Online payments are refunded through the gateway; manual payments record a refund
     * paid out by the shop. Allocations are released as needed so invoices show the correct outstanding.
     */
    @Transactional
    public Payment refund(UUID id, BigDecimal requested, String reason) {
        Payment p = payments.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment"));
        if (!RECEIVED.contains(p.getStatus())) {
            throw new BusinessException(ErrorCode.PAYMENT_INVALID_STATUS, "Only captured payments can be refunded");
        }
        BigDecimal refundable = p.getAmount().subtract(p.getRefundedAmount());
        BigDecimal amount = requested == null ? refundable : Money.of(requested);
        if (amount.signum() <= 0 || amount.compareTo(refundable) > 0) {
            throw new BusinessException(ErrorCode.PAYMENT_INVALID_AMOUNT, "Refund must be between 0.01 and " + refundable);
        }
        BigDecimal shortfall = amount.subtract(p.unallocated());
        if (shortfall.signum() > 0) {
            releaseAllocations(p, shortfall);
        }
        if (p.getMethod() == PaymentMethod.ONLINE) {
            try {
                gateway.refund(p.getProviderPaymentId(), amount);
            } catch (ProviderException e) {
                throw new BusinessException(ErrorCode.PAYMENT_PROVIDER_ERROR, "The payment provider could not process the refund. Try again later.");
            }
        }
        p.setRefundedAmount(p.getRefundedAmount().add(amount));
        if (p.getRefundedAmount().compareTo(p.getAmount()) >= 0) {
            p.setStatus(PaymentStatus.REFUNDED);
        }
        ledger.debit(p.getCustomerId(), EntryType.PAYMENT_REVERSAL, "PAYMENT", p.getId(), p.getPaymentNumber(), amount,
                "Refund: " + reason);
        refreshOrder(p.getOrderId());
        audit.record(AuditAction.PAYMENT_REFUNDED, "PAYMENT", id, null, Map.of("amount", amount, "reason", reason));
        return p;
    }

    /** Releases up to {@code amount} of a payment's allocations, newest first. */
    private void releaseAllocations(Payment p, BigDecimal amount) {
        BigDecimal remaining = amount;
        List<PaymentAllocation> list = new ArrayList<>(allocations.findByPaymentIdAndReversedFalse(p.getId()));
        list.sort(Comparator.comparing(PaymentAllocation::getCreatedAt).reversed());
        for (PaymentAllocation a : list) {
            if (remaining.signum() <= 0) {
                break;
            }
            Invoice invoice = invoices.findByIdForUpdate(a.getInvoiceId()).orElseThrow();
            a.setReversed(true);
            a.setReversedAt(Instant.now());
            p.setAllocatedAmount(p.getAllocatedAmount().subtract(a.getAmount()));
            invoice.setPaidAmount(invoice.getPaidAmount().subtract(a.getAmount()));
            BigDecimal keep = a.getAmount().subtract(Money.min(a.getAmount(), remaining));
            remaining = remaining.subtract(a.getAmount().subtract(keep));
            if (keep.signum() > 0) {
                allocate(p, invoice, keep);
            }
            invoice.refreshStatus();
            refreshOrder(invoice.getOrderId());
        }
    }

    // ---------------------------------------------------------------- online payments

    /**
     * Creates (or reuses) a gateway payment intent for the amount still due on an order.
     * The order is never lost when the gateway is down: the customer can retry this call.
     */
    @Transactional
    public Payment createOrderIntent(UUID orderId) {
        Order order = orders.findByIdForUpdate(orderId).orElseThrow(() -> BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order"));
        if (CurrentUser.isCustomer() && !order.getCustomerId().equals(CurrentUser.customerId())) {
            throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order");
        }
        if (order.getPaymentMethod() != PaymentMethod.ONLINE) {
            throw new BusinessException(ErrorCode.PAYMENT_INVALID_STATUS, "This order is not an online-payment order");
        }
        if (order.getStatus().isTerminal() && order.getStatus() != OrderStatus.COMPLETED) {
            throw new BusinessException(ErrorCode.ORDER_INVALID_STATUS, "The order is " + order.getStatus());
        }
        BigDecimal due = effectiveTotal(order).subtract(order.getPaidAmount());
        if (due.signum() <= 0) {
            throw new BusinessException(ErrorCode.PAYMENT_INVALID_STATUS, "Nothing is due on this order");
        }
        for (Payment existing : payments.findByOrderIdOrderByCreatedAtAsc(orderId)) {
            if ((existing.getStatus() == PaymentStatus.UNPAID || existing.getStatus() == PaymentStatus.PENDING)
                    && existing.getAmount().compareTo(due) == 0) {
                return existing;
            }
        }
        PaymentGateway.GatewayOrder gatewayOrder;
        try {
            gatewayOrder = gateway.createOrder(order.getOrderNumber(), due, "INR");
        } catch (ProviderException e) {
            log.warn("Payment provider unavailable for order {}: {}", order.getOrderNumber(), e.getMessage());
            throw new BusinessException(ErrorCode.PAYMENT_PROVIDER_ERROR,
                    "The payment service is unavailable. Your order is saved; please retry payment shortly.");
        }
        Payment p = newPayment(order.getCustomerId(), due, PaymentMethod.ONLINE, PaymentStatus.UNPAID, businessContext.today());
        p.setOrderId(orderId);
        p.setProvider(gateway.name());
        p.setProviderOrderId(gatewayOrder.providerOrderId());
        return payments.saveAndFlush(p);
    }

    /**
     * Records the client's checkout result after verifying its signature. This never captures the payment; only the
     * signed provider webhook does (§110).
     */
    @Transactional
    public Payment verifyClientResult(UUID paymentId, String providerPaymentId, String signature) {
        Payment p = payments.findByIdForUpdate(paymentId).orElseThrow(() -> BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment"));
        if (CurrentUser.isCustomer() && !p.getCustomerId().equals(CurrentUser.customerId())) {
            throw BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment");
        }
        if (!gateway.verifyClientSignature(p.getProviderOrderId(), providerPaymentId, signature)) {
            audit.record(AuditAction.PAYMENT_FAILED, "PAYMENT", paymentId, null, Map.of("reason", "INVALID_CLIENT_SIGNATURE"));
            throw new BusinessException(ErrorCode.WEBHOOK_SIGNATURE_INVALID, "Payment verification failed");
        }
        if (p.getStatus() == PaymentStatus.UNPAID) {
            p.setStatus(PaymentStatus.PENDING);
        }
        if (p.getProviderPaymentId() == null) {
            p.setProviderPaymentId(providerPaymentId);
        }
        return p;
    }

    /**
     * Applies a verified, de-duplicated gateway event. Status only moves forward; once money is captured only a
     * refund can change it, so late or out-of-order events are ignored.
     *
     * @return processing note
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String applyGatewayEvent(GatewayEvent event) {
        Payment p = payments.findByProviderOrderForUpdate(gateway.name(), event.providerOrderId()).orElse(null);
        if (p == null) {
            return "UNKNOWN_PROVIDER_ORDER";
        }
        PaymentStatus next = switch (event.type()) {
            case "payment.authorized" -> PaymentStatus.AUTHORIZED;
            case "payment.captured" -> PaymentStatus.CAPTURED;
            case "payment.failed" -> PaymentStatus.FAILED;
            case "payment.pending" -> PaymentStatus.PENDING;
            case "payment.cancelled" -> PaymentStatus.CANCELLED;
            default -> null;
        };
        if (next == null) {
            return "IGNORED_EVENT_TYPE";
        }
        PaymentStatus current = p.getStatus();
        if (RECEIVED.contains(current) || current.isFinal() || next.rank() <= current.rank()) {
            return "IGNORED_STALE_" + current;
        }
        if (event.providerPaymentId() != null) {
            p.setProviderPaymentId(event.providerPaymentId());
        }
        if (next == PaymentStatus.CAPTURED) {
            BigDecimal captured = event.amount() == null ? p.getAmount() : Money.of(event.amount());
            if (captured.signum() <= 0 || captured.compareTo(p.getAmount()) > 0) {
                return "REJECTED_AMOUNT_MISMATCH";
            }
            if (captured.compareTo(p.getAmount()) < 0) {
                p.setAmount(captured);
                p.setStatus(PaymentStatus.PARTIALLY_PAID);
            } else {
                p.setStatus(PaymentStatus.CAPTURED);
            }
            p.setPaidAt(Instant.now());
            payments.saveAndFlush(p);
            onMoneyReceived(p, null);
            audit.recordAs(null, "SYSTEM", AuditAction.PAYMENT_CAPTURED, "PAYMENT", p.getId(), Map.of("status", current),
                    Map.of("status", p.getStatus(), "amount", captured, "providerPaymentId", String.valueOf(p.getProviderPaymentId())));
            notifyCustomer(p, "PAYMENT_RECEIVED", "Payment received", "We received " + captured + " for your order.");
            return "CAPTURED";
        }
        p.setStatus(next);
        if (next == PaymentStatus.FAILED || next == PaymentStatus.CANCELLED) {
            p.setFailureReason(event.failureReason());
            audit.recordAs(null, "SYSTEM", AuditAction.PAYMENT_FAILED, "PAYMENT", p.getId(), Map.of("status", current),
                    Map.of("status", next, "reason", String.valueOf(event.failureReason())));
            notifyCustomer(p, "PAYMENT_FAILED", "Payment not completed", "Your online payment did not go through. You can retry from the order.");
        }
        refreshOrder(p.getOrderId());
        return next.name();
    }

    private void notifyCustomer(Payment p, String type, String title, String body) {
        Customer c = customers.get(p.getCustomerId());
        if (c.getUserId() != null) {
            notifications.notifyUser(c.getUserId(), type, title, body, "PAYMENT", p.getId());
        }
    }

    // ---------------------------------------------------------------- order payment status

    /** Recomputes an order's paid amount and §8 payment status from payments and its invoice. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void refreshOrder(UUID orderId) {
        if (orderId == null) {
            return;
        }
        Order order = orders.findById(orderId).orElse(null);
        if (order == null) {
            return;
        }
        List<Payment> orderPayments = payments.findByOrderIdOrderByCreatedAtAsc(orderId);
        BigDecimal refunded = orderPayments.stream().map(Payment::getRefundedAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal unallocatedOnOrder = orderPayments.stream().filter(p -> RECEIVED.contains(p.getStatus()))
                .map(Payment::unallocated).reduce(BigDecimal.ZERO, BigDecimal::add);
        Invoice invoice = activeInvoice(orderId);
        BigDecimal paid = invoice != null
                ? invoice.getPaidAmount().add(unallocatedOnOrder)
                : orderPayments.stream().filter(p -> RECEIVED.contains(p.getStatus()))
                .map(p -> p.getAmount().subtract(p.getRefundedAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        order.setPaidAmount(Money.of(paid));
        BigDecimal total = effectiveTotal(order);
        OrderPaymentStatus status;
        boolean lastOnlineFailed = !orderPayments.isEmpty()
                && orderPayments.getLast().getMethod() == PaymentMethod.ONLINE
                && (orderPayments.getLast().getStatus() == PaymentStatus.FAILED || orderPayments.getLast().getStatus() == PaymentStatus.CANCELLED);
        if (paid.signum() > 0 && paid.compareTo(total) >= 0 && total.signum() > 0) {
            status = OrderPaymentStatus.PAID;
        } else if (paid.signum() > 0) {
            status = OrderPaymentStatus.PARTIALLY_PAID;
        } else if (refunded.signum() > 0) {
            status = OrderPaymentStatus.REFUNDED;
        } else if (order.getStatus() == OrderStatus.CANCELLED || order.getStatus() == OrderStatus.REJECTED
                || order.getStatus() == OrderStatus.DELIVERY_FAILED) {
            status = OrderPaymentStatus.CANCELLED;
        } else if (order.getPaymentMethod() == PaymentMethod.CREDIT) {
            status = OrderPaymentStatus.CREDIT;
        } else if (lastOnlineFailed) {
            status = OrderPaymentStatus.FAILED;
        } else {
            status = OrderPaymentStatus.PENDING;
        }
        order.setPaymentStatus(status);
    }

    private Invoice activeInvoice(UUID orderId) {
        return invoices.findByOrderIdAndStatusNot(orderId, InvoiceStatus.CANCELLED).stream()
                .filter(i -> i.getStatus().isPosted()).findFirst().orElse(null);
    }

    /** What the customer must pay for the order: the invoice total less credit notes once invoiced. */
    public BigDecimal effectiveTotal(Order order) {
        Invoice invoice = activeInvoice(order.getId());
        return invoice != null ? invoice.getGrandTotal().subtract(invoice.getCreditedAmount()) : order.getGrandTotal();
    }
}
