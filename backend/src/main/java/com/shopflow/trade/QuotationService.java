package com.shopflow.trade;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.billing.TaxCalculator;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerService;
import com.shopflow.notifications.NotificationService;
import com.shopflow.orders.Order;
import com.shopflow.orders.OrderDtos.CreateOrderRequest;
import com.shopflow.orders.OrderDtos.OrderLineRequest;
import com.shopflow.orders.OrderService;
import com.shopflow.products.PricingService;
import com.shopflow.products.Product;
import com.shopflow.products.ProductOptionsService;
import com.shopflow.products.ProductService;
import com.shopflow.security.CurrentUser;
import com.shopflow.trade.TradeDtos.AcceptQuotationRequest;
import com.shopflow.trade.TradeDtos.CreateQuotationRequest;
import com.shopflow.trade.TradeDtos.QuotationItemResponse;
import com.shopflow.trade.TradeDtos.QuotationLineRequest;
import com.shopflow.trade.TradeDtos.QuotationResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Customer quotations (§0B.9, QUOTATIONS module): DRAFT → SENT → (customer or staff) ACCEPTED, which places an order at
 * the quoted rates and marks the quotation CONVERTED; or REJECTED / CANCELLED. A sent quotation past its validity date
 * is EXPIRED the next time it is read or acted on.
 */
@Service
public class QuotationService {

    private static final String SELECT = """
            SELECT q.*, c.shop_name AS customer_name, p.name AS project_name, o.order_number
            FROM quotations q
            JOIN customers c ON c.id = q.customer_id
            LEFT JOIN projects p ON p.id = q.project_id
            LEFT JOIN orders o ON o.id = q.order_id
            """;

    private final JdbcTemplate jdbc;
    private final TradeSupport support;
    private final CustomerService customers;
    private final ProductService products;
    private final ProductOptionsService options;
    private final PricingService pricing;
    private final TaxCalculator taxCalculator;
    private final DocumentSequenceService sequences;
    private final OrderService orders;
    private final NotificationService notifications;
    private final BusinessContext businessContext;
    private final AuditService audit;

    public QuotationService(JdbcTemplate jdbc, TradeSupport support, CustomerService customers, ProductService products,
                            ProductOptionsService options, PricingService pricing, TaxCalculator taxCalculator,
                            DocumentSequenceService sequences, OrderService orders, NotificationService notifications,
                            BusinessContext businessContext, AuditService audit) {
        this.jdbc = jdbc;
        this.support = support;
        this.customers = customers;
        this.products = products;
        this.options = options;
        this.pricing = pricing;
        this.taxCalculator = taxCalculator;
        this.sequences = sequences;
        this.orders = orders;
        this.notifications = notifications;
        this.businessContext = businessContext;
        this.audit = audit;
    }

    @Transactional
    public List<QuotationResponse> list(UUID customerId, String status) {
        expireOld();
        StringBuilder sql = new StringBuilder(SELECT).append(" WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (customerId != null) {
            sql.append(" AND q.customer_id = ?");
            args.add(customerId);
        }
        if (status != null && !status.isBlank()) {
            sql.append(" AND q.status = ?");
            args.add(status.trim().toUpperCase());
        }
        sql.append(" ORDER BY q.created_at DESC LIMIT 300");
        return jdbc.queryForList(sql.toString(), args.toArray()).stream().map(r -> map(r, null)).toList();
    }

    @Transactional
    public QuotationResponse get(UUID id) {
        expireOld();
        Map<String, Object> row = jdbc.queryForList(SELECT + " WHERE q.id = ?", id).stream().findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Quotation"));
        return map(row, items(id));
    }

    @Transactional
    public QuotationResponse create(CreateQuotationRequest r) {
        Customer customer = customers.get(r.customerId());
        if (customer.getStatus() == Customer.CustomerStatus.BLOCKED) {
            throw new BusinessException(ErrorCode.CUSTOMER_BLOCKED, "The customer is blocked");
        }
        support.checkProject(r.projectId(), customer.getId());
        LocalDate date = r.quoteDate() != null ? r.quoteDate() : businessContext.today();
        LocalDate validUntil = r.validUntil() != null ? r.validUntil() : date.plusDays(15);
        if (validUntil.isBefore(date)) {
            throw BusinessException.validation("validUntil", "Valid-until cannot be before the quotation date");
        }
        boolean interState = support.interState(customer.getId());
        Map<UUID, Product> productMap = products.getAll(r.items().stream().map(QuotationLineRequest::productId).toList())
                .stream().collect(Collectors.toMap(Product::getId, Function.identity()));
        UUID id = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now());
        String number = sequences.next(DocumentType.QUOTATION, date);
        jdbc.update("""
                INSERT INTO quotations (id, quotation_number, customer_id, project_id, status, quote_date, valid_until, notes, inter_state,
                                        created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)
                """, id, number, customer.getId(), r.projectId(), TradeSupport.date(date), TradeSupport.date(validUntil),
                Validation.trim(r.notes()), interState, CurrentUser.id(), now, now);
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal discount = BigDecimal.ZERO;
        BigDecimal taxable = BigDecimal.ZERO;
        BigDecimal tax = BigDecimal.ZERO;
        int lineNumber = 1;
        for (QuotationLineRequest l : r.items()) {
            Product p = productMap.get(l.productId());
            if (p == null) {
                throw BusinessException.validation("items", "Product " + l.productId() + " not found");
            }
            if (!p.isActive()) {
                throw new BusinessException(ErrorCode.PRODUCT_INACTIVE, p.getName() + " is inactive");
            }
            ProductOptionsService.ResolvedUnit unit = options.resolve(p, l.unit());
            options.validateQuantity(p, unit.toBase(l.quantity()));
            BigDecimal rate = l.rate() != null ? Money.of(l.rate()) : Money.of(pricing.priceFor(p, customer.getId()).multiply(unit.factor()));
            TaxCalculator.LineResult lr = taxCalculator.line(new TaxCalculator.Line(l.quantity(), rate, l.discountPercent(), null,
                    p.getGstRate(), p.getHsnCode()), interState);
            jdbc.update("""
                    INSERT INTO quotation_items (id, quotation_id, line_number, product_id, product_name, hsn_code, unit, unit_factor, quantity,
                                                 rate, discount_percent, tax_rate, taxable_amount, tax_amount, line_total)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, UUID.randomUUID(), id, lineNumber++, p.getId(), p.getName(), p.getHsnCode(), unit.unit(), unit.factor(),
                    Money.qty(l.quantity()), rate, lr.discountPercent(), p.getGstRate(), lr.taxable(), lr.tax(), lr.total());
            subtotal = subtotal.add(lr.gross());
            discount = discount.add(lr.discountAmount());
            taxable = taxable.add(lr.taxable());
            tax = tax.add(lr.tax());
        }
        jdbc.update("UPDATE quotations SET subtotal = ?, discount_total = ?, taxable_total = ?, tax_total = ?, grand_total = ? WHERE id = ?",
                subtotal, discount, taxable, tax, support.grandTotal(taxable.add(tax)), id);
        audit.record(AuditAction.QUOTATION_CREATED, "QUOTATION", id, null, Map.of("number", number, "grandTotal", support.grandTotal(taxable.add(tax))));
        return get(id);
    }

    /** Sends the quotation to the customer (in-app notification when they have a login). */
    @Transactional
    public QuotationResponse send(UUID id) {
        Map<String, Object> q = lock(id);
        requireStatus(q, "DRAFT", "SENT");
        jdbc.update("UPDATE quotations SET status = 'SENT', sent_at = COALESCE(sent_at, now()), updated_at = now(), version = version + 1 WHERE id = ?", id);
        Customer customer = customers.get((UUID) q.get("customer_id"));
        if (customer.getUserId() != null) {
            notifications.notifyUser(customer.getUserId(), "QUOTATION_SENT", "Quotation " + q.get("quotation_number"),
                    "A quotation for " + q.get("grand_total") + " is waiting for your decision.", "QUOTATION", id);
        }
        audit.record(AuditAction.QUOTATION_STATUS_CHANGED, "QUOTATION", id, Map.of("status", q.get("status")), Map.of("status", "SENT"));
        return get(id);
    }

    /** Staff accepting on the customer's behalf (e.g. a phone confirmation). */
    @Transactional
    public QuotationResponse accept(UUID id, AcceptQuotationRequest r) {
        Map<String, Object> q = lock(id);
        requireStatus(q, "DRAFT", "SENT");
        return convert(q, r);
    }

    @Transactional
    public QuotationResponse acceptMine(UUID id, AcceptQuotationRequest r) {
        Map<String, Object> q = lockMine(id);
        requireStatus(q, "SENT");
        return convert(q, r);
    }

    @Transactional
    public QuotationResponse reject(UUID id, String note) {
        Map<String, Object> q = lock(id);
        requireStatus(q, "DRAFT", "SENT");
        return decide(q, "REJECTED", note);
    }

    @Transactional
    public QuotationResponse rejectMine(UUID id, String note) {
        Map<String, Object> q = lockMine(id);
        requireStatus(q, "SENT");
        return decide(q, "REJECTED", note);
    }

    @Transactional
    public QuotationResponse cancel(UUID id, String note) {
        Map<String, Object> q = lock(id);
        requireStatus(q, "DRAFT", "SENT", "EXPIRED");
        return decide(q, "CANCELLED", note);
    }

    /** The signed-in customer's quotations (never drafts). */
    @Transactional
    public List<QuotationResponse> mine() {
        return list(TradeSupport.currentCustomer(), null).stream().filter(q -> !"DRAFT".equals(q.status())).toList();
    }

    @Transactional
    public QuotationResponse getMine(UUID id) {
        QuotationResponse q = get(id);
        if (!q.customerId().equals(TradeSupport.currentCustomer()) || "DRAFT".equals(q.status())) {
            throw BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Quotation");
        }
        return q;
    }

    private QuotationResponse convert(Map<String, Object> q, AcceptQuotationRequest r) {
        UUID id = (UUID) q.get("id");
        List<QuotationItemResponse> items = items(id);
        List<OrderLineRequest> lines = items.stream().map(i -> new OrderLineRequest(i.productId(), i.quantity(),
                i.unit(), i.rate(), i.discountPercent())).toList();
        Order order = orders.createFromQuotation(new CreateOrderRequest((UUID) q.get("customer_id"), r.addressId(), r.paymentMethod(),
                "Quotation " + q.get("quotation_number") + (r.note() == null || r.note().isBlank() ? "" : " - " + r.note().trim()),
                lines, (UUID) q.get("project_id")), (UUID) q.get("customer_id"));
        jdbc.update("""
                UPDATE quotations SET status = 'CONVERTED', order_id = ?, decided_at = now(), decision_note = ?, updated_at = now(),
                       version = version + 1 WHERE id = ?
                """, order.getId(), Validation.trim(r.note()), id);
        audit.record(AuditAction.QUOTATION_STATUS_CHANGED, "QUOTATION", id, Map.of("status", q.get("status")),
                Map.of("status", "CONVERTED", "orderId", order.getId()));
        return get(id);
    }

    private QuotationResponse decide(Map<String, Object> q, String status, String note) {
        UUID id = (UUID) q.get("id");
        jdbc.update("UPDATE quotations SET status = ?, decided_at = now(), decision_note = ?, updated_at = now(), version = version + 1 WHERE id = ?",
                status, Validation.trim(note), id);
        audit.record(AuditAction.QUOTATION_STATUS_CHANGED, "QUOTATION", id, Map.of("status", q.get("status")), Map.of("status", status));
        return get(id);
    }

    private Map<String, Object> lock(UUID id) {
        expireOld();
        return jdbc.queryForList("SELECT * FROM quotations WHERE id = ? FOR UPDATE", id).stream().findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Quotation"));
    }

    private Map<String, Object> lockMine(UUID id) {
        Map<String, Object> q = lock(id);
        if (!TradeSupport.currentCustomer().equals(q.get("customer_id")) || "DRAFT".equals(q.get("status"))) {
            throw BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Quotation");
        }
        return q;
    }

    private static void requireStatus(Map<String, Object> q, String... allowed) {
        String status = (String) q.get("status");
        for (String s : allowed) {
            if (s.equals(status)) {
                return;
            }
        }
        throw new BusinessException(ErrorCode.CONFLICT, "The quotation is " + status);
    }

    /** Lazy expiry: sent or draft quotations past their validity date. */
    private void expireOld() {
        jdbc.update("UPDATE quotations SET status = 'EXPIRED', updated_at = now(), version = version + 1 WHERE status IN ('DRAFT','SENT') AND valid_until < ?",
                TradeSupport.date(businessContext.today()));
    }

    private List<QuotationItemResponse> items(UUID id) {
        return jdbc.queryForList("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY line_number", id).stream()
                .map(r -> new QuotationItemResponse((UUID) r.get("id"), (Integer) r.get("line_number"), (UUID) r.get("product_id"),
                        (String) r.get("product_name"), (String) r.get("hsn_code"), (String) r.get("unit"), (BigDecimal) r.get("unit_factor"),
                        (BigDecimal) r.get("quantity"), (BigDecimal) r.get("rate"), (BigDecimal) r.get("discount_percent"),
                        (BigDecimal) r.get("tax_rate"), (BigDecimal) r.get("taxable_amount"), (BigDecimal) r.get("tax_amount"),
                        (BigDecimal) r.get("line_total"))).toList();
    }

    private static QuotationResponse map(Map<String, Object> r, List<QuotationItemResponse> items) {
        return new QuotationResponse((UUID) r.get("id"), (String) r.get("quotation_number"), (UUID) r.get("customer_id"),
                (String) r.get("customer_name"), (UUID) r.get("project_id"), (String) r.get("project_name"), (String) r.get("status"),
                TradeSupport.localDate(r.get("quote_date")), TradeSupport.localDate(r.get("valid_until")), (String) r.get("notes"),
                (Boolean) r.get("inter_state"), (BigDecimal) r.get("subtotal"), (BigDecimal) r.get("discount_total"),
                (BigDecimal) r.get("taxable_total"), (BigDecimal) r.get("tax_total"), (BigDecimal) r.get("grand_total"),
                (UUID) r.get("order_id"), (String) r.get("order_number"), TradeSupport.instant(r.get("sent_at")),
                TradeSupport.instant(r.get("decided_at")), (String) r.get("decision_note"), TradeSupport.instant(r.get("created_at")), items);
    }
}
