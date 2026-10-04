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
import com.shopflow.inventory.StockTrace;
import com.shopflow.inventory.TrackingService;
import com.shopflow.products.Product;
import com.shopflow.products.ProductOptionsService;
import com.shopflow.products.SchemeService;
import com.shopflow.tenancy.ModuleCode;
import com.shopflow.tenancy.TenantModules;
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
    private final ProductOptionsService options;
    private final SchemeService schemes;
    private final TrackingService tracking;
    private final TenantModules modules;

    public InvoiceService(InvoiceRepository invoices, OrderRepository orders, CustomerService customers, CreditService credit,
                          ProductService products, PricingService pricing, InventoryService inventory,
                          TaxCalculator calculator, CustomerLedgerService ledger, PaymentService payments,
                          CreditNoteService creditNotes, DocumentSequenceService sequences, IdempotencyService idempotency,
                          BusinessSettingsService settings, BusinessContext businessContext, EInvoiceProvider einvoice,
                          AppProperties properties, JdbcTemplate jdbc, NotificationService notifications, AuditService audit,
                          ProductOptionsService options, SchemeService schemes, TrackingService tracking, TenantModules modules) {
        this.options = options;
        this.schemes = schemes;
        this.tracking = tracking;
        this.modules = modules;
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
        Invoice invoice = r.orderId() != null ? draftFromOrder(r) : draftManual(r, true);
        applyCharges(invoice, r.charges());
        applyHeader(invoice, r);
        applyProject(invoice, r.projectId() != null ? r.projectId()
                : r.orderId() != null ? orders.findById(r.orderId()).map(Order::getProjectId).orElse(null) : null);
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
            item.setUnitFactor(oi.getUnitFactor());
            item.setFreeItem(oi.isFreeItem());
            item.setSchemeId(oi.getSchemeId());
            item.setSchemeName(oi.getSchemeName());
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

    /**
     * An invoice for a delivery challan (§0B.9): the challan's lines at its rates, no schemes, and no stock movement on
     * generation (the stock already left with the challan). Batch and serial details are copied from the challan.
     */
    @Transactional
    public Invoice createFromChallan(UUID challanId, CreateInvoiceRequest r, List<String[]> details) {
        Invoice invoice = draftManual(r, false);
        invoice.setSource(Invoice.Source.CHALLAN);
        invoice.setDeliveryChallanId(challanId);
        for (int i = 0; i < invoice.getItems().size() && i < details.size(); i++) {
            invoice.getItems().get(i).setBatchDetails(details.get(i)[0]);
            invoice.getItems().get(i).setSerialNumbers(details.get(i)[1]);
        }
        applyHeader(invoice, r);
        applyProject(invoice, r.projectId());
        invoices.saveAndFlush(invoice);
        audit.record(AuditAction.INVOICE_CREATED, "INVOICE", invoice.getId(), null,
                Map.of("source", "CHALLAN", "challanId", challanId, "grandTotal", invoice.getGrandTotal()));
        return generate(invoice.getId(), null);
    }

    /** Project / site of a contractor customer; it must belong to the invoice's customer. */
    private void applyProject(Invoice invoice, UUID projectId) {
        if (projectId == null) {
            return;
        }
        modules.require(ModuleCode.PROJECT_ACCOUNTS);
        List<UUID> owner = jdbc.queryForList("SELECT customer_id FROM projects WHERE id = ?", UUID.class, projectId);
        if (owner.isEmpty() || !owner.getFirst().equals(invoice.getCustomerId())) {
            throw BusinessException.validation("projectId", "The project does not belong to this customer");
        }
        invoice.setProjectId(projectId);
    }

    private Invoice draftManual(CreateInvoiceRequest r, boolean applySchemes) {
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
        List<ProductOptionsService.ResolvedUnit> units = new ArrayList<>();
        List<BigDecimal> rates = new ArrayList<>();
        List<SchemeService.Line> schemeLines = new ArrayList<>();
        for (InvoiceLineRequest l : r.items()) {
            Product product = productMap.get(l.productId());
            if (product == null) {
                throw BusinessException.validation("items", "Product " + l.productId() + " not found");
            }
            if (!product.isActive()) {
                throw new BusinessException(ErrorCode.PRODUCT_INACTIVE, product.getName() + " is inactive");
            }
            options.requireSellable(product);
            ProductOptionsService.ResolvedUnit unit = options.resolve(product, l.unit());
            BigDecimal baseQuantity = unit.toBase(l.quantity());
            options.validateQuantity(product, baseQuantity);
            if (product.isTrackSerials() && l.serialNumbers() != null && !l.serialNumbers().isEmpty()
                    && l.serialNumbers().stream().filter(s -> s != null && !s.isBlank()).count() != baseQuantity.longValue()) {
                throw BusinessException.validation("serialNumbers", "Choose exactly " + baseQuantity.stripTrailingZeros().toPlainString()
                        + " serial number(s) for " + product.getName());
            }
            // The rate is per chosen unit: the base price × the unit factor unless entered.
            BigDecimal rate = l.rate() != null ? Money.of(l.rate()) : Money.of(pricing.priceFor(product, customer.getId()).multiply(unit.factor()));
            units.add(unit);
            rates.add(rate);
            schemeLines.add(new SchemeService.Line(product.getId(), product.getCategoryId(), baseQuantity, Money.of(rate.multiply(l.quantity()))));
        }
        List<SchemeService.Outcome> outcomes = applySchemes ? schemes.evaluate(schemeLines)
                : schemeLines.stream().map(x -> SchemeService.Outcome.NONE).toList();
        int line = 1;
        for (int idx = 0; idx < r.items().size(); idx++) {
            InvoiceLineRequest l = r.items().get(idx);
            Product product = productMap.get(l.productId());
            SchemeService.Outcome scheme = outcomes.get(idx);
            boolean explicitDiscount = l.discountPercent() != null || l.discountAmount() != null;
            BigDecimal discountPercent = explicitDiscount ? l.discountPercent() : scheme.hasDiscount() ? scheme.discountPercent() : null;
            InvoiceItem item = newManualItem(invoice, line++, product, units.get(idx).unit(), units.get(idx).factor(), Money.qty(l.quantity()),
                    rates.get(idx), Validation.trim(l.description()));
            if (!explicitDiscount && scheme.hasDiscount()) {
                item.setSchemeId(scheme.discountSchemeId());
                item.setSchemeName(scheme.discountSchemeName());
            }
            if (product.isTrackSerials() && l.serialNumbers() != null) {
                item.setSerialNumbers(String.join(",", l.serialNumbers().stream().filter(s -> s != null && !s.isBlank())
                        .map(s -> s.trim().toUpperCase()).toList()));
            }
            if (product.isTrackBatches() && l.batchNumber() != null && !l.batchNumber().isBlank()) {
                item.setBatchDetails("BATCH:" + l.batchNumber().trim().toUpperCase());
            }
            invoice.getItems().add(item);
            calcLines.add(new TaxCalculator.Line(l.quantity(), rates.get(idx), discountPercent, explicitDiscount ? l.discountAmount() : null,
                    product.getGstRate(), product.getHsnCode()));
            if (scheme.hasFreeGoods()) {
                // Free goods: a separate zero-value line in the base unit; the stock still leaves.
                InvoiceItem free = newManualItem(invoice, line++, product, product.getUnit().name(), BigDecimal.ONE, scheme.freeQuantity(),
                        BigDecimal.ZERO, "Free under " + scheme.freeSchemeName());
                free.setFreeItem(true);
                free.setSchemeId(scheme.freeSchemeId());
                free.setSchemeName(scheme.freeSchemeName());
                invoice.getItems().add(free);
                calcLines.add(new TaxCalculator.Line(scheme.freeQuantity(), BigDecimal.ZERO, null, null, product.getGstRate(), product.getHsnCode()));
            }
        }
        applyCalculation(invoice, calcLines);
        return invoice;
    }

    /** Agent / broker commission on the taxable value (COMMISSION module), fixed when the invoice is generated. */
    private void applyCommission(Invoice invoice, Customer customer) {
        if (customer.getAgentId() == null || !modules.isEnabled(ModuleCode.COMMISSION)) {
            return;
        }
        List<BigDecimal> percent = jdbc.queryForList("SELECT commission_percent FROM agents WHERE id = ? AND active", BigDecimal.class, customer.getAgentId());
        if (percent.isEmpty() || percent.getFirst().signum() == 0) {
            return;
        }
        invoice.setAgentId(customer.getAgentId());
        invoice.setCommissionPercent(percent.getFirst());
        invoice.setCommissionAmount(Money.of(invoice.getTaxableTotal().multiply(percent.getFirst()).divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP)));
    }

    private static InvoiceItem newManualItem(Invoice invoice, int lineNumber, Product product, String unit, BigDecimal factor,
                                             BigDecimal quantity, BigDecimal rate, String description) {
        InvoiceItem item = new InvoiceItem();
        item.setInvoice(invoice);
        item.setLineNumber(lineNumber);
        item.setProductId(product.getId());
        item.setProductName(product.getName());
        item.setDescription(description);
        item.setSku(product.getSku());
        item.setHsnCode(product.getHsnCode());
        item.setUnit(unit);
        item.setUnitFactor(factor);
        item.setQuantity(quantity);
        item.setRate(rate);
        item.setTaxRate(product.getGstRate());
        return item;
    }

    /** Invoice-level charges (transport, loading…) with their own GST; needs the CHARGES module. */
    private void applyCharges(Invoice invoice, List<InvoiceDtos.ChargeRequest> requested) {
        invoice.getCharges().clear();
        if (requested == null || requested.isEmpty()) {
            return;
        }
        modules.require(ModuleCode.CHARGES);
        int line = 1;
        for (InvoiceDtos.ChargeRequest c : requested) {
            BigDecimal taxRate = c.taxRate() == null ? BigDecimal.ZERO : c.taxRate();
            if (taxRate.signum() > 0 && !settings.taxSettings().isAllowedRate(taxRate)) {
                throw BusinessException.validation("charges", "GST rate must be one of " + settings.taxSettings().getAllowedGstRates());
            }
            InvoiceCharge charge = new InvoiceCharge();
            charge.setInvoice(invoice);
            charge.setLineNumber(line++);
            charge.setChargeType(c.type());
            charge.setDescription(Validation.trim(c.description()));
            charge.setSacCode(c.type().sac());
            charge.setAmount(Money.of(c.amount()));
            charge.setTaxRate(taxRate);
            invoice.getCharges().add(charge);
        }
        // Recalculate the totals with the charges included.
        applyCalculation(invoice, invoice.getItems().stream().map(i -> new TaxCalculator.Line(i.getQuantity(), i.getRate(),
                i.getDiscountPercent(), i.getDiscountAmount(), i.getTaxRate(), i.getHsnCode())).toList());
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

    private void applyCalculation(Invoice invoice, List<TaxCalculator.Line> itemLines) {
        List<TaxCalculator.Line> calcLines = new ArrayList<>(itemLines);
        invoice.getCharges().forEach(c -> calcLines.add(new TaxCalculator.Line(BigDecimal.ONE, c.getAmount(), null, null,
                c.getTaxRate(), c.getSacCode())));
        TaxCalculator.Result calc;
        try {
            calc = calculator.calculate(calcLines, invoice.isInterState(), settings.taxSettings().isRoundOffEnabled());
        } catch (IllegalArgumentException e) {
            throw BusinessException.validation("items", e.getMessage());
        }
        BigDecimal chargesTotal = BigDecimal.ZERO;
        for (int c = 0; c < invoice.getCharges().size(); c++) {
            InvoiceCharge charge = invoice.getCharges().get(c);
            TaxCalculator.LineResult lr = calc.lines().get(invoice.getItems().size() + c);
            charge.setCgstAmount(lr.cgst());
            charge.setSgstAmount(lr.sgst());
            charge.setIgstAmount(lr.igst());
            charge.setTotal(lr.total());
            chargesTotal = chargesTotal.add(lr.total());
        }
        invoice.setChargesTotal(Money.of(chargesTotal));
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
        // Cost per invoiced unit (base cost × unit factor), for profit reports.
        invoice.getItems().forEach(i -> i.setUnitCost(Money.of(productMap.get(i.getProductId()).getPurchasePrice().multiply(i.getUnitFactor()))));
        invoice.setAmountInWords(AmountInWords.inr(invoice.getGrandTotal()));
        invoice.setTaxAmountInWords(AmountInWords.inr(invoice.totalTax()));
        invoice.setDueDate(invoice.getPaymentType() == PaymentMethod.CREDIT
                ? invoice.getInvoiceDate().plusDays(credit.creditDays(customer.getId()))
                : invoice.getInvoiceDate());
        invoice.setGeneratedAt(Instant.now());
        invoice.setGeneratedBy(CurrentUser.id());
        invoice.setStatus(InvoiceStatus.GENERATED);
        applyCommission(invoice, customer);

        if (order != null) {
            Map<UUID, OrderItem> items = order.getItems().stream().collect(Collectors.toMap(OrderItem::getId, Function.identity()));
            invoice.getItems().forEach(i -> {
                OrderItem oi = items.get(i.getOrderItemId());
                oi.setInvoicedQuantity(oi.getInvoicedQuantity().add(i.getQuantity()));
                Product product = productMap.get(i.getProductId());
                if (product.isTrackBatches() || product.isTrackSerials()) {
                    // Stock left at delivery under the order: show what was used.
                    StockTrace.Result used = tracking.describe("ORDER", invoice.getOrderId(), i.getProductId());
                    i.setBatchDetails(used.batchDetails());
                    i.setSerialNumbers(used.serials().isEmpty() ? null : String.join(",", used.serials()));
                }
            });
            tracking.linkOrderSerialsToInvoice(invoice.getOrderId(), invoice.getId());
        } else if (invoice.getSource() == Invoice.Source.MANUAL) {
            // Admin-created invoices are counter/direct sales: stock leaves now (base units, batches FEFO, chosen serials).
            // (A challan invoice does not move stock: the goods already left with the challan.)
            invoice.getItems().stream().sorted(Comparator.comparing(InvoiceItem::getProductId)).forEach(i -> {
                Product product = productMap.get(i.getProductId());
                String batch = i.getBatchDetails() != null && i.getBatchDetails().startsWith("BATCH:") ? i.getBatchDetails().substring(6) : null;
                List<String> serials = i.getSerialNumbers() == null || i.getSerialNumbers().isBlank() ? null : List.of(i.getSerialNumbers().split(","));
                InventoryService.TracedMovement moved = inventory.postTraced(i.getProductId(), MovementType.SALE_OUT,
                        Money.qty(i.getQuantity().multiply(i.getUnitFactor())), Money.of(product.getPurchasePrice()), "INVOICE",
                        invoice.getId(), invoice.getInvoiceNumber(), "Sale", null,
                        new StockTrace(batch, null, null, serials, null, null, customer.getId()));
                i.setBatchDetails(moved.trace().batchDetails());
                i.setSerialNumbers(moved.trace().serials().isEmpty() ? null : String.join(",", moved.trace().serials()));
            });
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
            } else if (invoice.getSource() == Invoice.Source.CHALLAN) {
                // The goods stay with the customer under the challan; it can be invoiced again.
                jdbc.update("UPDATE delivery_challans SET status = 'ISSUED', invoice_id = NULL, updated_at = now(), version = version + 1 WHERE id = ?",
                        invoice.getDeliveryChallanId());
            } else {
                BigDecimal zero = BigDecimal.ZERO;
                invoice.getItems().stream().sorted(Comparator.comparing(InvoiceItem::getProductId)).forEach(i -> {
                    BigDecimal back = i.getQuantity().subtract(creditNotes.creditedQuantity(invoice.getId(), i.getId())).max(zero);
                    if (back.signum() > 0) {
                        inventory.postTraced(i.getProductId(), MovementType.ADJUSTMENT_IN, Money.qty(back.multiply(i.getUnitFactor())),
                                i.getUnitCost().divide(i.getUnitFactor(), 2, java.math.RoundingMode.HALF_UP), "INVOICE",
                                invoice.getId(), invoice.getInvoiceNumber(), "Invoice cancelled", null,
                                StockTrace.reversing("INVOICE", invoice.getId()));
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

    /** Trade details for the invoice screen; commission is shown to staff only. Null when the invoice has none. */
    public InvoiceDtos.InvoiceTradeInfo tradeInfo(Invoice i, boolean staff) {
        if (i.getProjectId() == null && i.getAgentId() == null && i.getEwayBillNumber() == null && i.getDeliveryChallanId() == null) {
            return null;
        }
        String project = i.getProjectId() == null ? null
                : jdbc.queryForList("SELECT name FROM projects WHERE id = ?", String.class, i.getProjectId()).stream().findFirst().orElse(null);
        boolean showAgent = staff && i.getAgentId() != null;
        String agent = showAgent
                ? jdbc.queryForList("SELECT name FROM agents WHERE id = ?", String.class, i.getAgentId()).stream().findFirst().orElse(null) : null;
        String challan = i.getDeliveryChallanId() == null ? null
                : jdbc.queryForList("SELECT challan_number FROM delivery_challans WHERE id = ?", String.class, i.getDeliveryChallanId())
                .stream().findFirst().orElse(null);
        return new InvoiceDtos.InvoiceTradeInfo(i.getProjectId(), project, showAgent ? i.getAgentId() : null, agent,
                showAgent ? i.getCommissionPercent() : null, showAgent ? i.getCommissionAmount() : null,
                showAgent ? i.getCommissionPaidAt() : null, i.getEwayBillNumber(), i.getEwayBillDate(), i.getEwayValidUntil(),
                i.getEwayDistanceKm(), i.isEwayTestOnly(), i.getDeliveryChallanId(), challan);
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
