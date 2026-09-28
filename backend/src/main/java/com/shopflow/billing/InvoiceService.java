package com.shopflow.billing;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.billing.BillingRepositories.InvoiceRepository;
import com.shopflow.billing.InvoiceDtos.CreateInvoiceRequest;
import com.shopflow.billing.InvoiceDtos.InvoiceLineRequest;
import com.shopflow.business.Business;
import com.shopflow.business.BusinessBankAccount;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettings.PartialDeliveryInvoicePolicy;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.business.InvoiceSettings;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.idempotency.IdempotencyService;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.AmountInWords;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.config.AppProperties;
import com.shopflow.customers.CreditService;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerAddress;
import com.shopflow.customers.CustomerLedgerEntry.EntryType;
import com.shopflow.customers.CustomerLedgerService;
import com.shopflow.customers.CustomerService;
import com.shopflow.integrations.ProviderException;
import com.shopflow.integrations.einvoice.EInvoiceProvider;
import com.shopflow.inventory.InventoryService;
import com.shopflow.inventory.StockMovement.MovementType;
import com.shopflow.notifications.NotificationService;
import com.shopflow.orders.Order;
import com.shopflow.orders.OrderItem;
import com.shopflow.orders.OrderRepositories.OrderRepository;
import com.shopflow.payments.PaymentMethod;
import com.shopflow.payments.PaymentService;
import com.shopflow.products.PricingService;
import com.shopflow.products.Product;
import com.shopflow.products.ProductService;
import com.shopflow.security.CurrentUser;
import com.shopflow.security.Permissions;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Order-based and admin-created invoices (§22). Totals are always recalculated by {@link TaxCalculator}.
 * Generation is transactional and idempotent: number + snapshot + items + tax summary + ledger (+ stock for manual
 * invoices) succeed together (§76, §77).
 */
@Service
public class InvoiceService {

    private static final Logger log = LoggerFactory.getLogger(InvoiceService.class);

    private final InvoiceRepository invoices;
    private final OrderRepository orders;
    private final CustomerService customers;
    private final CreditService credit;
    private final ProductService products;
    private final PricingService pricing;
    private final InventoryService inventory;
    private final TaxCalculator calculator;
    private final CustomerLedgerService ledger;
    private final PaymentService payments;
    private final CreditNoteService creditNotes;
    private final DocumentSequenceService sequences;
    private final IdempotencyService idempotency;
    private final BusinessSettingsService settings;
    private final BusinessContext businessContext;
    private final EInvoiceProvider einvoice;
    private final AppProperties properties;
    private final JdbcTemplate jdbc;
    private final NotificationService notifications;
    private final AuditService audit;

    public InvoiceService(InvoiceRepository invoices, OrderRepository orders, CustomerService customers, CreditService credit,
                          ProductService products, PricingService pricing, InventoryService inventory,
                          TaxCalculator calculator, CustomerLedgerService ledger, PaymentService payments,
                          CreditNoteService creditNotes, DocumentSequenceService sequences, IdempotencyService idempotency,
                          BusinessSettingsService settings, BusinessContext businessContext, EInvoiceProvider einvoice,
                          AppProperties properties, JdbcTemplate jdbc, NotificationService notifications, AuditService audit) {
        this.invoices = invoices;
        this.orders = orders;
        this.customers = customers;
        this.credit = credit;
        this.products = products;
        this.pricing = pricing;
        this.inventory = inventory;
        this.calculator = calculator;
        this.ledger = ledger;
        this.payments = payments;
        this.creditNotes = creditNotes;
        this.sequences = sequences;
        this.idempotency = idempotency;
        this.settings = settings;
        this.businessContext = businessContext;
        this.einvoice = einvoice;
        this.properties = properties;
        this.jdbc = jdbc;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ---------------------------------------------------------------- queries

    public Invoice get(UUID id) {
        return invoices.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, "Invoice"));
    }

    /** Customers can see only their own generated invoices; drafts are staff-only. */
    public Invoice getForCurrentUser(UUID id) {
        Invoice invoice = get(id);
        if (CurrentUser.isCustomer()
                && (!invoice.getCustomerId().equals(CurrentUser.customerId()) || invoice.getStatus() == InvoiceStatus.DRAFT)) {
            throw BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, "Invoice");
        }
        return invoice;
    }

    public List<Invoice> forOrder(UUID orderId) {
        return invoices.findByOrderIdAndStatusNot(orderId, InvoiceStatus.CANCELLED);
    }

    public Page<Invoice> search(String q, UUID customerId, InvoiceStatus status, Invoice.Source source, Boolean overdue,
                                LocalDate from, LocalDate to, Pageable pageable) {
        LocalDate today = businessContext.today();
        Specification<Invoice> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            if (CurrentUser.isCustomer()) {
                p.add(cb.equal(root.get("customerId"), CurrentUser.customerId()));
                p.add(cb.notEqual(root.get("status"), InvoiceStatus.DRAFT));
            } else if (customerId != null) {
                p.add(cb.equal(root.get("customerId"), customerId));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                p.add(cb.or(cb.like(cb.lower(cb.coalesce(root.get("invoiceNumber"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("buyerName"), "")), like)));
            }
            if (status != null) {
                p.add(cb.equal(root.get("status"), status));
            }
            if (source != null) {
                p.add(cb.equal(root.get("source"), source));
            }
            if (Boolean.TRUE.equals(overdue)) {
                p.add(cb.lessThan(root.get("dueDate"), today));
                p.add(root.get("status").in(InvoiceStatus.GENERATED, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.CREDIT));
            }
            if (from != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("invoiceDate"), from));
            }
            if (to != null) {
                p.add(cb.lessThanOrEqualTo(root.get("invoiceDate"), to));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return invoices.findAll(spec, pageable);
    }

    // ---------------------------------------------------------------- creation

    @Transactional
    public Invoice create(CreateInvoiceRequest r) {
        Invoice invoice = r.orderId() != null ? draftFromOrder(r) : draftManual(r);
        applyHeader(invoice, r);
        invoices.saveAndFlush(invoice);
        audit.record(AuditAction.INVOICE_CREATED, "INVOICE", invoice.getId(), null,
                Map.of("source", invoice.getSource(), "customerId", invoice.getCustomerId(), "grandTotal", invoice.getGrandTotal()));
        if (Boolean.TRUE.equals(r.generate())) {
            return generate(invoice.getId(), null);
        }
        return invoice;
    }

    private Invoice draftFromOrder(CreateInvoiceRequest r) {
        Order order = orders.findByIdForUpdate(r.orderId()).orElseThrow(() -> BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order"));
        if (!order.getStatus().invoiceable()) {
            throw new BusinessException(ErrorCode.ORDER_INVALID_STATUS, "Accept the order before invoicing it (status " + order.getStatus() + ")");
        }
        if (invoices.findByOrderIdAndStatusNot(order.getId(), InvoiceStatus.CANCELLED).stream().anyMatch(i -> i.getStatus() == InvoiceStatus.DRAFT)) {
            throw new BusinessException(ErrorCode.CONFLICT, "A draft invoice already exists for this order");
        }
        PartialDeliveryInvoicePolicy policy = settings.settings().getPartialDeliveryInvoicePolicy();
        Invoice invoice = newInvoice(order.getCustomerId(), Invoice.Source.ORDER, order.getPaymentMethod(), r.invoiceDate());
        invoice.setOrderId(order.getId());
        invoice.setBuyerOrderNumber(order.getOrderNumber());
        invoice.setDestination(order.getDeliveryCity());
        invoice.setInterState(order.isInterState());
        int line = 1;
        List<TaxCalculator.Line> calcLines = new ArrayList<>();
        for (OrderItem oi : order.getItems()) {
            BigDecimal billable = billableQuantity(oi, policy);
            if (billable.signum() <= 0) {
                continue;
            }
            InvoiceItem item = new InvoiceItem();
            item.setInvoice(invoice);
            item.setLineNumber(line++);
            item.setProductId(oi.getProductId());
            item.setOrderItemId(oi.getId());
            item.setProductName(oi.getProductName());
            item.setSku(oi.getSku());
            item.setHsnCode(oi.getHsnCode());
            item.setUnit(oi.getUnit());
            item.setQuantity(billable);
            item.setRate(oi.getRate());
            item.setDiscountPercent(oi.getDiscountPercent());
            item.setTaxRate(oi.getTaxRate());
            invoice.getItems().add(item);
            calcLines.add(new TaxCalculator.Line(billable, oi.getRate(), oi.getDiscountPercent(), null, oi.getTaxRate(), oi.getHsnCode()));
        }
        if (invoice.getItems().isEmpty()) {
            throw new BusinessException(ErrorCode.NOTHING_TO_INVOICE, policy == PartialDeliveryInvoicePolicy.INVOICE_DELIVERED_QUANTITY
                    ? "Nothing to invoice yet: invoicing happens on delivered quantities" : "All accepted quantities are already invoiced");
        }
        applyCalculation(invoice, calcLines);
        return invoice;
    }

    /** Never double-bills: already invoiced quantities are excluded (§20). */
    static BigDecimal billableQuantity(OrderItem oi, PartialDeliveryInvoicePolicy policy) {
        BigDecimal base = policy == PartialDeliveryInvoicePolicy.INVOICE_DELIVERED_QUANTITY
                ? oi.getDeliveredQuantity()
                : oi.getAcceptedQuantity().subtract(oi.getCancelledQuantity());
        return base.subtract(oi.getInvoicedQuantity()).max(BigDecimal.ZERO);
    }

    private Invoice draftManual(CreateInvoiceRequest r) {
        if (r.customerId() == null || r.items() == null || r.items().isEmpty() || r.paymentType() == null) {
            throw BusinessException.validation("customerId", "customerId, paymentType and items are required for an admin-created invoice");
        }
        Customer customer = customers.get(r.customerId());
        CustomerService.requireApproved(customer);
        Invoice invoice = newInvoice(customer.getId(), Invoice.Source.MANUAL, r.paymentType(), r.invoiceDate());
        String buyerState = customers.defaultAddress(customer.getId()).map(CustomerAddress::getStateCode).orElse(null);
        invoice.setInterState(TaxCalculator.isInterState(settings.business().getStateCode(), buyerState));
        Map<UUID, Product> productMap = products.getAll(r.items().stream().map(InvoiceLineRequest::productId).toList())
                .stream().collect(Collectors.toMap(Product::getId, Function.identity()));
        List<TaxCalculator.Line> calcLines = new ArrayList<>();
        int line = 1;
        for (InvoiceLineRequest l : r.items()) {
            Product product = productMap.get(l.productId());
            if (product == null) {
                throw BusinessException.validation("items", "Product " + l.productId() + " not found");
            }
            if (!product.isActive()) {
                throw new BusinessException(ErrorCode.PRODUCT_INACTIVE, product.getName() + " is inactive");
            }
            BigDecimal rate = l.rate() != null ? Money.of(l.rate()) : pricing.priceFor(product, customer.getId());
            InvoiceItem item = new InvoiceItem();
            item.setInvoice(invoice);
            item.setLineNumber(line++);
            item.setProductId(product.getId());
            item.setProductName(product.getName());
            item.setDescription(Validation.trim(l.description()));
            item.setSku(product.getSku());
            item.setHsnCode(product.getHsnCode());
            item.setUnit(product.getUnit().name());
            item.setQuantity(Money.qty(l.quantity()));
            item.setRate(rate);
            item.setTaxRate(product.getGstRate());
            invoice.getItems().add(item);
            calcLines.add(new TaxCalculator.Line(l.quantity(), rate, l.discountPercent(), l.discountAmount(), product.getGstRate(), product.getHsnCode()));
        }
        applyCalculation(invoice, calcLines);
        return invoice;
    }

    private Invoice newInvoice(UUID customerId, Invoice.Source source, PaymentMethod paymentType, LocalDate date) {
        LocalDate today = businessContext.today();
        LocalDate invoiceDate = date != null ? date : today;
        if (invoiceDate.isAfter(today)) {
            throw BusinessException.validation("invoiceDate", "Invoice date cannot be in the future");
        }
        if (date != null && !date.equals(today) && !CurrentUser.hasPermission(Permissions.SETTINGS_MANAGE)) {
            throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, "Only the Owner can back-date an invoice");
        }
        Invoice invoice = new Invoice();
        invoice.setBusinessId(businessContext.businessId());
        invoice.setSource(source);
        invoice.setCustomerId(customerId);
        invoice.setPaymentType(paymentType);
        invoice.setInvoiceDate(invoiceDate);
        invoice.setCreatedBy(CurrentUser.id());
        return invoice;
    }

    private void applyHeader(Invoice invoice, CreateInvoiceRequest r) {
        InvoiceSettings is = settings.invoiceSettings();
        invoice.setPaymentTerms(r.paymentTerms() != null ? Validation.trim(r.paymentTerms())
                : invoice.getPaymentType() == PaymentMethod.CREDIT
                ? credit.creditDays(invoice.getCustomerId()) + " days credit"
                : is.getDefaultPaymentTerms());
        if (r.buyerOrderNumber() != null) {
            invoice.setBuyerOrderNumber(Validation.trim(r.buyerOrderNumber()));
        }
        invoice.setDeliveryNote(Validation.trim(r.deliveryNote()));
        invoice.setDispatchDocument(Validation.trim(r.dispatchDocument()));
        invoice.setTransport(Validation.trim(r.transport()));
        invoice.setVehicleNumber(Validation.upper(r.vehicleNumber()));
        if (r.destination() != null) {
            invoice.setDestination(Validation.trim(r.destination()));
        }
        invoice.setNotes(Validation.trim(r.notes()));
    }

    private void applyCalculation(Invoice invoice, List<TaxCalculator.Line> calcLines) {
        TaxCalculator.Result calc;
        try {
            calc = calculator.calculate(calcLines, invoice.isInterState(), settings.taxSettings().isRoundOffEnabled());
        } catch (IllegalArgumentException e) {
            throw BusinessException.validation("items", e.getMessage());
        }
        for (int i = 0; i < invoice.getItems().size(); i++) {
            InvoiceItem item = invoice.getItems().get(i);
            TaxCalculator.LineResult lr = calc.lines().get(i);
            item.setDiscountPercent(lr.discountPercent());
            item.setDiscountAmount(lr.discountAmount());
            item.setGrossAmount(lr.gross());
            item.setTaxableAmount(lr.taxable());
            item.setCgstAmount(lr.cgst());
            item.setSgstAmount(lr.sgst());
            item.setIgstAmount(lr.igst());
            item.setLineTotal(lr.total());
        }
        invoice.setSubtotal(calc.subtotal());
        invoice.setDiscountTotal(calc.discount());
        invoice.setTaxableTotal(calc.taxable());
        invoice.setCgstTotal(calc.cgst());
        invoice.setSgstTotal(calc.sgst());
        invoice.setIgstTotal(calc.igst());
        invoice.setRoundOff(calc.roundOff());
        invoice.setGrandTotal(calc.grandTotal());
        invoice.getTaxSummaries().clear();
        for (TaxCalculator.TaxSummary ts : calc.taxSummary()) {
            InvoiceTaxSummary s = new InvoiceTaxSummary();
            s.setInvoice(invoice);
            s.setHsnCode(ts.hsnCode());
            s.setTaxRate(ts.taxRate());
            s.setTaxableAmount(ts.taxable());
            s.setCgstAmount(ts.cgst());
            s.setSgstAmount(ts.sgst());
            s.setIgstAmount(ts.igst());
            s.setTotalTax(ts.totalTax());
            invoice.getTaxSummaries().add(s);
        }
    }

    // ---------------------------------------------------------------- generation

    @Transactional
    public Invoice generate(UUID id, String idempotencyKey) {
        UUID resultId = idempotency.execute("invoice.generate:" + id, CurrentUser.id(), idempotencyKey, () -> doGenerate(id).getId());
        return get(resultId);
    }

    private Invoice doGenerate(UUID id) {
        Invoice invoice = invoices.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, "Invoice"));
        if (invoice.getStatus() != InvoiceStatus.DRAFT) {
            if (invoice.getStatus() == InvoiceStatus.CANCELLED) {
                throw new BusinessException(ErrorCode.INVOICE_ALREADY_CANCELLED, "The invoice is cancelled");
            }
            return invoice;
        }
        Customer customer = customers.get(invoice.getCustomerId());
        Order order = null;
        if (invoice.getOrderId() != null) {
            order = orders.findByIdForUpdate(invoice.getOrderId()).orElseThrow();
            if (!order.getStatus().invoiceable()) {
                throw new BusinessException(ErrorCode.ORDER_INVALID_STATUS, "The order can no longer be invoiced (" + order.getStatus() + ")");
            }
            PartialDeliveryInvoicePolicy policy = settings.settings().getPartialDeliveryInvoicePolicy();
            Map<UUID, OrderItem> items = order.getItems().stream().collect(Collectors.toMap(OrderItem::getId, Function.identity()));
            for (InvoiceItem item : invoice.getItems()) {
                OrderItem oi = items.get(item.getOrderItemId());
                if (item.getQuantity().compareTo(billableQuantity(oi, policy)) > 0) {
                    throw new BusinessException(ErrorCode.CONFLICT, "Order quantities changed since this draft was created; cancel it and create a new invoice");
                }
            }
        } else if (invoice.getPaymentType() == PaymentMethod.CREDIT) {
            CreditService.CreditDecision decision = credit.evaluate(customer.getId(), invoice.getGrandTotal());
            if (decision.decision() == CreditService.Decision.NOT_ENABLED) {
                throw new BusinessException(ErrorCode.CREDIT_NOT_ENABLED, "Credit is not enabled for this customer");
            }
            if (decision.decision() == CreditService.Decision.BLOCKED && !CurrentUser.hasPermission(Permissions.CREDIT_OVERRIDE)) {
                throw new BusinessException(ErrorCode.CREDIT_LIMIT_EXCEEDED, "Credit limit of " + decision.creditLimit()
                        + " would be exceeded (exposure " + decision.projectedExposure() + ")");
            }
        }

        InvoiceSettings is = settings.invoiceSettings();
        invoice.setInvoiceNumber(sequences.next(DocumentType.INVOICE, invoice.getInvoiceDate(), is.getInvoicePrefix(),
                is.getStartingNumber(), is.getNumberPadding()));
        snapshotSeller(invoice, is);
        snapshotBuyer(invoice, customer, order);
        // Recalculate from the stored lines with the final buyer state so totals can never drift from the snapshot.
        invoice.setInterState(TaxCalculator.isInterState(invoice.getSellerStateCode(), invoice.getBuyerStateCode()));
        applyCalculation(invoice, invoice.getItems().stream().map(i -> new TaxCalculator.Line(i.getQuantity(), i.getRate(),
                i.getDiscountPercent(), i.getDiscountAmount(), i.getTaxRate(), i.getHsnCode())).toList());
        Map<UUID, Product> productMap = products.getAll(invoice.getItems().stream().map(InvoiceItem::getProductId).toList())
                .stream().collect(Collectors.toMap(Product::getId, Function.identity()));
        invoice.getItems().forEach(i -> i.setUnitCost(Money.of(productMap.get(i.getProductId()).getPurchasePrice())));
        invoice.setAmountInWords(AmountInWords.inr(invoice.getGrandTotal()));
        invoice.setTaxAmountInWords(AmountInWords.inr(invoice.totalTax()));
        invoice.setDueDate(invoice.getPaymentType() == PaymentMethod.CREDIT
                ? invoice.getInvoiceDate().plusDays(credit.creditDays(customer.getId()))
                : invoice.getInvoiceDate());
        invoice.setGeneratedAt(Instant.now());
        invoice.setGeneratedBy(CurrentUser.id());
        invoice.setStatus(InvoiceStatus.GENERATED);

        if (order != null) {
            Map<UUID, OrderItem> items = order.getItems().stream().collect(Collectors.toMap(OrderItem::getId, Function.identity()));
            invoice.getItems().forEach(i -> {
                OrderItem oi = items.get(i.getOrderItemId());
                oi.setInvoicedQuantity(oi.getInvoicedQuantity().add(i.getQuantity()));
            });
        } else {
            // Admin-created invoices are counter/direct sales: stock leaves now.
            invoice.getItems().stream().sorted(Comparator.comparing(InvoiceItem::getProductId)).forEach(i ->
                    inventory.post(i.getProductId(), MovementType.SALE_OUT, i.getQuantity(), i.getUnitCost(), "INVOICE",
                            invoice.getId(), invoice.getInvoiceNumber(), "Sale", null));
        }
        invoices.saveAndFlush(invoice);
        ledger.debit(customer.getId(), EntryType.INVOICE, "INVOICE", invoice.getId(), invoice.getInvoiceNumber(),
                invoice.getGrandTotal(), "Invoice " + invoice.getInvoiceNumber());
        payments.applyAdvances(invoice);
        invoice.refreshStatus();
        registerEInvoice(invoice);
        if (order != null) {
            payments.refreshOrder(order.getId());
        }
        audit.record(AuditAction.INVOICE_GENERATED, "INVOICE", invoice.getId(), Map.of("status", "DRAFT"), Map.of(
                "status", invoice.getStatus(), "invoiceNumber", invoice.getInvoiceNumber(), "grandTotal", invoice.getGrandTotal()));
        if (customer.getUserId() != null) {
            notifications.notifyUser(customer.getUserId(), "INVOICE_GENERATED", "Invoice " + invoice.getInvoiceNumber(),
                    "Invoice for " + invoice.getGrandTotal() + " is available.", "INVOICE", invoice.getId());
        }
        return invoice;
    }

    private void snapshotSeller(Invoice invoice, InvoiceSettings is) {
        Business b = settings.business();
        invoice.setSellerName(b.getLegalName() != null ? b.getLegalName() : b.getName());
        invoice.setSellerAddress(b.formattedAddress());
        invoice.setSellerPhone(joinNonBlank(" / ", b.getPhone(), b.getMobile()));
        invoice.setSellerEmail(b.getEmail());
        invoice.setSellerGstin(b.getGstin());
        invoice.setSellerPan(b.getPan());
        invoice.setSellerState(b.getState());
        invoice.setSellerStateCode(b.getStateCode());
        invoice.setSellerLogoFileId(b.getLogoFileId());
        if (is.isShowBankDetails()) {
            settings.defaultBankAccount().ifPresent((BusinessBankAccount bank) -> {
                invoice.setBankName(bank.getBankName());
                invoice.setBankAccountNumber(bank.getAccountNumber());
                invoice.setBankIfsc(bank.getIfsc());
                invoice.setBankBranch(bank.getBranch());
            });
        }
        invoice.setTermsAndConditions(is.getDefaultTerms() != null ? is.getDefaultTerms() : b.getTermsAndConditions());
        invoice.setDeclaration(is.getDeclaration());
        invoice.setAuthorizedSignatory(b.getAuthorizedSignatory());
    }

    /** Buyer billing details are the customer's default address at generation time (§25). */
    private void snapshotBuyer(Invoice invoice, Customer c, Order order) {
        invoice.setBuyerName(c.getShopName());
        invoice.setBuyerContactName(c.getContactName());
        invoice.setBuyerMobile(c.getMobileNumber());
        invoice.setBuyerGstin(c.getGstin());
        invoice.setBuyerPan(c.getPan());
        invoice.setBuyerEmail(c.getEmail());
        CustomerAddress address = customers.defaultAddress(c.getId()).orElse(null);
        if (address != null) {
            invoice.setBuyerAddress(address.getAddressLine1() + (address.getAddressLine2() != null ? ", " + address.getAddressLine2() : ""));
            invoice.setBuyerCity(address.getCity());
            invoice.setBuyerState(address.getState());
            invoice.setBuyerStateCode(address.getStateCode());
            invoice.setBuyerPincode(address.getPincode());
        } else if (order != null) {
            invoice.setBuyerAddress(order.getDeliveryLine1());
            invoice.setBuyerCity(order.getDeliveryCity());
            invoice.setBuyerState(order.getDeliveryState());
            invoice.setBuyerStateCode(order.getDeliveryStateCode());
            invoice.setBuyerPincode(order.getDeliveryPincode());
        }
    }

    /** E-invoice registration never blocks invoicing; failures are recorded for retry (§113). */
    private void registerEInvoice(Invoice invoice) {
        if (!properties.einvoice().enabled() || invoice.getBuyerGstin() == null) {
            return;
        }
        String status;
        String error = null;
        try {
            EInvoiceProvider.Registration reg = einvoice.register(new EInvoiceProvider.Request(invoice.getInvoiceNumber(),
                    invoice.getInvoiceDate(), invoice.getSellerGstin(), invoice.getBuyerGstin(), invoice.getTaxableTotal(),
                    invoice.totalTax(), invoice.getGrandTotal()));
            invoice.setIrn(reg.irn());
            invoice.setAckNumber(reg.ackNumber());
            invoice.setAckDate(reg.ackDate());
            invoice.setSignedQrData(reg.signedQrData());
            invoice.setEinvoiceStatus(einvoice.testOnly() ? Invoice.EInvoiceStatus.TEST_IRN : Invoice.EInvoiceStatus.REAL_IRN);
            status = "SUCCESS";
        } catch (ProviderException e) {
            log.warn("E-invoice registration failed for {}: {}", invoice.getInvoiceNumber(), e.getMessage());
            invoice.setEinvoiceStatus(Invoice.EInvoiceStatus.FAILED);
            status = "FAILED";
            error = e.getMessage();
        }
        jdbc.update("""
                INSERT INTO einvoice_requests (id, invoice_id, provider, status, irn, ack_number, error_message, test_only, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), invoice.getId(), einvoice.name(), status, invoice.getIrn(), invoice.getAckNumber(),
                error, einvoice.testOnly(), Timestamp.from(Instant.now()));
    }

    // ---------------------------------------------------------------- cancellation

    /**
     * Cancels an invoice without deleting it (§30). Allocated payments become customer advances; the ledger gets a
     * reversing credit; stock from admin-created invoices comes back; order quantities become invoiceable again.
     */
    @Transactional
    public Invoice cancel(UUID id, String reason) {
        Invoice invoice = invoices.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, "Invoice"));
        return cancelLocked(invoice, reason);
    }

    @Transactional
    public Invoice cancelLocked(Invoice invoice, String reason) {
        if (invoice.getStatus() == InvoiceStatus.CANCELLED) {
            throw new BusinessException(ErrorCode.INVOICE_ALREADY_CANCELLED, "The invoice is already cancelled");
        }
        InvoiceStatus before = invoice.getStatus();
        if (before != InvoiceStatus.DRAFT) {
            if (invoice.getItems().stream().anyMatch(i -> i.getReturnedQuantity().signum() > 0)) {
                throw new BusinessException(ErrorCode.INVOICE_INVALID_STATUS, "An invoice with approved returns cannot be cancelled");
            }
            payments.reverseAllocations(invoice);
            BigDecimal reversal = invoice.getGrandTotal().subtract(invoice.getCreditedAmount());
            if (reversal.signum() > 0) {
                ledger.credit(invoice.getCustomerId(), EntryType.INVOICE_CANCELLATION, "INVOICE", invoice.getId(),
                        invoice.getInvoiceNumber(), reversal, "Invoice cancelled: " + reason);
            }
            if (invoice.getOrderId() != null) {
                Order order = orders.findByIdForUpdate(invoice.getOrderId()).orElseThrow();
                Map<UUID, OrderItem> items = order.getItems().stream().collect(Collectors.toMap(OrderItem::getId, Function.identity()));
                invoice.getItems().forEach(i -> {
                    OrderItem oi = items.get(i.getOrderItemId());
                    oi.setInvoicedQuantity(oi.getInvoicedQuantity().subtract(i.getQuantity()).max(BigDecimal.ZERO));
                });
            } else {
                BigDecimal zero = BigDecimal.ZERO;
                invoice.getItems().stream().sorted(Comparator.comparing(InvoiceItem::getProductId)).forEach(i -> {
                    BigDecimal back = i.getQuantity().subtract(creditNotes.creditedQuantity(invoice.getId(), i.getId())).max(zero);
                    if (back.signum() > 0) {
                        inventory.post(i.getProductId(), MovementType.ADJUSTMENT_IN, back, i.getUnitCost(), "INVOICE",
                                invoice.getId(), invoice.getInvoiceNumber(), "Invoice cancelled", null);
                    }
                });
            }
        }
        invoice.setStatus(InvoiceStatus.CANCELLED);
        invoice.setCancelledAt(Instant.now());
        invoice.setCancelledBy(CurrentUser.idIfPresent().orElse(null));
        invoice.setCancelReason(reason);
        invoices.saveAndFlush(invoice);
        payments.refreshOrder(invoice.getOrderId());
        audit.record(AuditAction.INVOICE_CANCELLED, "INVOICE", invoice.getId(), Map.of("status", before),
                Map.of("status", InvoiceStatus.CANCELLED, "reason", reason));
        return invoice;
    }

    private static String joinNonBlank(String separator, String... parts) {
        return java.util.Arrays.stream(parts).filter(s -> s != null && !s.isBlank()).collect(Collectors.joining(separator));
    }

    @Transactional
    public void markSent(UUID invoiceId) {
        invoices.findByIdForUpdate(invoiceId).ifPresent(i -> {
            if (i.getSentAt() == null) {
                i.setSentAt(Instant.now());
                i.refreshStatus();
            }
        });
    }
}
