package com.shopflow.trade;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.billing.Invoice;
import com.shopflow.billing.InvoiceDtos.CreateInvoiceRequest;
import com.shopflow.billing.InvoiceDtos.InvoiceLineRequest;
import com.shopflow.billing.InvoiceService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerService;
import com.shopflow.inventory.InventoryService;
import com.shopflow.inventory.StockMovement.MovementType;
import com.shopflow.inventory.StockTrace;
import com.shopflow.products.PricingService;
import com.shopflow.products.Product;
import com.shopflow.products.ProductOptionsService;
import com.shopflow.products.ProductService;
import com.shopflow.security.CurrentUser;
import com.shopflow.trade.TradeDtos.ChallanInvoiceRequest;
import com.shopflow.trade.TradeDtos.ChallanItemResponse;
import com.shopflow.trade.TradeDtos.ChallanLineRequest;
import com.shopflow.trade.TradeDtos.ChallanResponse;
import com.shopflow.trade.TradeDtos.CreateChallanRequest;
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
 * Delivery challans (§0B.9, DELIVERY_CHALLAN module). Issuing a challan takes the goods out of stock (CHALLAN_OUT, with
 * batches/serials like a sale); cancelling it brings them back (CHALLAN_RETURN_IN). An invoice made from the challan
 * bills the same lines and does not move stock again.
 */
@Service
public class ChallanService {

    private static final String SELECT = """
            SELECT d.*, c.shop_name AS customer_name, p.name AS project_name, i.invoice_number
            FROM delivery_challans d
            JOIN customers c ON c.id = d.customer_id
            LEFT JOIN projects p ON p.id = d.project_id
            LEFT JOIN invoices i ON i.id = d.invoice_id
            """;

    private final JdbcTemplate jdbc;
    private final TradeSupport support;
    private final CustomerService customers;
    private final ProductService products;
    private final ProductOptionsService options;
    private final PricingService pricing;
    private final InventoryService inventory;
    private final DocumentSequenceService sequences;
    private final InvoiceService invoices;
    private final BusinessContext businessContext;
    private final AuditService audit;

    public ChallanService(JdbcTemplate jdbc, TradeSupport support, CustomerService customers, ProductService products,
                          ProductOptionsService options, PricingService pricing, InventoryService inventory,
                          DocumentSequenceService sequences, InvoiceService invoices, BusinessContext businessContext,
                          AuditService audit) {
        this.jdbc = jdbc;
        this.support = support;
        this.customers = customers;
        this.products = products;
        this.options = options;
        this.pricing = pricing;
        this.inventory = inventory;
        this.sequences = sequences;
        this.invoices = invoices;
        this.businessContext = businessContext;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<ChallanResponse> list(UUID customerId, String status) {
        StringBuilder sql = new StringBuilder(SELECT).append(" WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (customerId != null) {
            sql.append(" AND d.customer_id = ?");
            args.add(customerId);
        }
        if (status != null && !status.isBlank()) {
            sql.append(" AND d.status = ?");
            args.add(status.trim().toUpperCase());
        }
        sql.append(" ORDER BY d.created_at DESC LIMIT 300");
        return jdbc.queryForList(sql.toString(), args.toArray()).stream().map(r -> map(r, null)).toList();
    }

    @Transactional(readOnly = true)
    public ChallanResponse get(UUID id) {
        Map<String, Object> row = jdbc.queryForList(SELECT + " WHERE d.id = ?", id).stream().findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Delivery challan"));
        return map(row, items(id));
    }

    @Transactional
    public ChallanResponse issue(CreateChallanRequest r) {
        Customer customer = customers.get(r.customerId());
        CustomerService.requireApproved(customer);
        support.checkProject(r.projectId(), customer.getId());
        LocalDate date = r.challanDate() != null ? r.challanDate() : businessContext.today();
        Map<UUID, Product> productMap = products.getAll(r.items().stream().map(ChallanLineRequest::productId).toList())
                .stream().collect(Collectors.toMap(Product::getId, Function.identity()));
        UUID id = UUID.randomUUID();
        String number = sequences.next(DocumentType.DELIVERY_CHALLAN, date);
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO delivery_challans (id, challan_number, customer_id, project_id, challan_date, status, purpose, vehicle_number,
                                               transport, destination, notes, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, number, customer.getId(), r.projectId(), TradeSupport.date(date), r.purpose() == null ? "SUPPLY" : r.purpose(),
                Validation.upper(Validation.trim(r.vehicleNumber())), Validation.trim(r.transport()), Validation.trim(r.destination()),
                Validation.trim(r.notes()), CurrentUser.id(), now, now);
        BigDecimal total = BigDecimal.ZERO;
        // Lock stock rows in a stable order (deadlock safety), but keep the user's line numbers.
        List<Integer> order = new ArrayList<>();
        for (int i = 0; i < r.items().size(); i++) {
            order.add(i);
        }
        order.sort(Comparator.comparing(i -> r.items().get(i).productId()));
        for (int idx : order) {
            ChallanLineRequest l = r.items().get(idx);
            Product p = productMap.get(l.productId());
            if (p == null) {
                throw BusinessException.validation("items", "Product " + l.productId() + " not found");
            }
            if (!p.isActive()) {
                throw new BusinessException(ErrorCode.PRODUCT_INACTIVE, p.getName() + " is inactive");
            }
            options.requireSellable(p);
            ProductOptionsService.ResolvedUnit unit = options.resolve(p, l.unit());
            BigDecimal base = unit.toBase(l.quantity());
            options.validateQuantity(p, base);
            List<String> serials = l.serialNumbers() == null ? null
                    : l.serialNumbers().stream().filter(s -> s != null && !s.isBlank()).map(s -> s.trim().toUpperCase()).toList();
            if (p.isTrackSerials() && serials != null && !serials.isEmpty() && serials.size() != base.longValue()) {
                throw BusinessException.validation("serialNumbers", "Choose exactly " + base.stripTrailingZeros().toPlainString()
                        + " serial number(s) for " + p.getName());
            }
            String batch = l.batchNumber() == null || l.batchNumber().isBlank() ? null : l.batchNumber().trim().toUpperCase();
            InventoryService.TracedMovement moved = inventory.postTraced(p.getId(), MovementType.CHALLAN_OUT, Money.qty(base),
                    Money.of(p.getPurchasePrice()), "DELIVERY_CHALLAN", id, number, "Delivery challan", null,
                    new StockTrace(batch, null, null, serials == null || serials.isEmpty() ? null : serials, null, null, customer.getId()));
            BigDecimal rate = l.rate() != null ? Money.of(l.rate()) : Money.of(pricing.priceFor(p, customer.getId()).multiply(unit.factor()));
            jdbc.update("""
                    INSERT INTO delivery_challan_items (id, delivery_challan_id, line_number, product_id, product_name, hsn_code, unit,
                                                        unit_factor, quantity, rate, tax_rate, batch_details, serial_numbers)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, UUID.randomUUID(), id, idx + 1, p.getId(), p.getName(), p.getHsnCode(), unit.unit(), unit.factor(),
                    Money.qty(l.quantity()), rate, p.getGstRate(), moved.trace().batchDetails(),
                    moved.trace().serials().isEmpty() ? null : String.join(",", moved.trace().serials()));
            total = total.add(Money.of(rate.multiply(l.quantity())));
        }
        jdbc.update("UPDATE delivery_challans SET total_value = ? WHERE id = ?", total, id);
        audit.record(AuditAction.CHALLAN_ISSUED, "DELIVERY_CHALLAN", id, null, Map.of("number", number, "totalValue", total));
        return get(id);
    }

    /** Goods come back into stock (to the batches/serials they left with). */
    @Transactional
    public ChallanResponse cancel(UUID id, String reason) {
        Map<String, Object> d = lock(id);
        if (!"ISSUED".equals(d.get("status"))) {
            throw new BusinessException(ErrorCode.CONFLICT, "Only an issued, uninvoiced challan can be cancelled (it is " + d.get("status") + ")");
        }
        UUID customerId = (UUID) d.get("customer_id");
        List<ChallanItemResponse> lines = new ArrayList<>(items(id));
        lines.sort(Comparator.comparing(ChallanItemResponse::productId));
        for (ChallanItemResponse l : lines) {
            Product p = products.get(l.productId());
            inventory.postTraced(l.productId(), MovementType.CHALLAN_RETURN_IN, Money.qty(l.quantity().multiply(l.unitFactor())),
                    Money.of(p.getPurchasePrice()), "DELIVERY_CHALLAN", id, (String) d.get("challan_number"), "Challan cancelled", null,
                    new StockTrace(null, null, null, null, "DELIVERY_CHALLAN", id, customerId));
        }
        jdbc.update("UPDATE delivery_challans SET status = 'CANCELLED', cancel_reason = ?, updated_at = now(), version = version + 1 WHERE id = ?",
                reason.trim(), id);
        audit.record(AuditAction.CHALLAN_CANCELLED, "DELIVERY_CHALLAN", id, Map.of("status", "ISSUED"), Map.of("status", "CANCELLED", "reason", reason.trim()));
        return get(id);
    }

    /** Bills the challan: a generated invoice with the challan's lines at its rates; stock is not moved again. */
    @Transactional
    public Invoice invoice(UUID id, ChallanInvoiceRequest r) {
        Map<String, Object> d = lock(id);
        if (!"ISSUED".equals(d.get("status"))) {
            throw new BusinessException(ErrorCode.CONFLICT, "The challan is " + d.get("status"));
        }
        List<ChallanItemResponse> lines = items(id);
        List<InvoiceLineRequest> invoiceLines = lines.stream().map(l -> new InvoiceLineRequest(l.productId(), l.quantity(), l.rate(),
                null, null, null, l.unit(), null, null)).toList();
        List<String[]> details = lines.stream().map(l -> new String[]{l.batchDetails(),
                l.serialNumbers().isEmpty() ? null : String.join(",", l.serialNumbers())}).toList();
        CreateInvoiceRequest request = new CreateInvoiceRequest(null, (UUID) d.get("customer_id"), r.paymentType(), r.invoiceDate(),
                invoiceLines, null, null, (String) d.get("challan_number"), null, (String) d.get("transport"),
                (String) d.get("vehicle_number"), (String) d.get("destination"), null, true, null, (UUID) d.get("project_id"));
        Invoice invoice = invoices.createFromChallan(id, request, details);
        jdbc.update("UPDATE delivery_challans SET status = 'INVOICED', invoice_id = ?, updated_at = now(), version = version + 1 WHERE id = ?",
                invoice.getId(), id);
        audit.record(AuditAction.CHALLAN_INVOICED, "DELIVERY_CHALLAN", id, Map.of("status", "ISSUED"),
                Map.of("status", "INVOICED", "invoiceId", invoice.getId()));
        return invoice;
    }

    private Map<String, Object> lock(UUID id) {
        return jdbc.queryForList("SELECT * FROM delivery_challans WHERE id = ? FOR UPDATE", id).stream().findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Delivery challan"));
    }

    private List<ChallanItemResponse> items(UUID id) {
        return jdbc.queryForList("SELECT * FROM delivery_challan_items WHERE delivery_challan_id = ? ORDER BY line_number", id).stream()
                .map(r -> new ChallanItemResponse((UUID) r.get("id"), (Integer) r.get("line_number"), (UUID) r.get("product_id"),
                        (String) r.get("product_name"), (String) r.get("hsn_code"), (String) r.get("unit"), (BigDecimal) r.get("unit_factor"),
                        (BigDecimal) r.get("quantity"), (BigDecimal) r.get("rate"), (BigDecimal) r.get("tax_rate"),
                        (String) r.get("batch_details"), r.get("serial_numbers") == null ? List.of()
                        : List.of(((String) r.get("serial_numbers")).split(",")))).toList();
    }

    private static ChallanResponse map(Map<String, Object> r, List<ChallanItemResponse> items) {
        return new ChallanResponse((UUID) r.get("id"), (String) r.get("challan_number"), (UUID) r.get("customer_id"),
                (String) r.get("customer_name"), (UUID) r.get("project_id"), (String) r.get("project_name"),
                TradeSupport.localDate(r.get("challan_date")), (String) r.get("status"), (String) r.get("purpose"),
                (String) r.get("vehicle_number"), (String) r.get("transport"), (String) r.get("destination"), (String) r.get("notes"),
                (BigDecimal) r.get("total_value"), (UUID) r.get("invoice_id"), (String) r.get("invoice_number"),
                (String) r.get("cancel_reason"), TradeSupport.instant(r.get("created_at")), items);
    }
}
