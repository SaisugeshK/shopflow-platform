package com.shopflow.reports;

import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.reports.ReportResult.Column;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.shopflow.reports.ReportResult.date;
import static com.shopflow.reports.ReportResult.money;
import static com.shopflow.reports.ReportResult.number;
import static com.shopflow.reports.ReportResult.qty;
import static com.shopflow.reports.ReportResult.text;

/**
 * Report queries (§40). All figures come from posted documents (generated invoices, posted purchases, captured
 * payments, stock movements); cancelled documents are excluded. Profit is defined once here (§40 Profit Report):
 * net sales (taxable value after discounts) − cost of goods sold (unit cost snapshot × quantity) − sales returns
 * (credit-note taxable value − returned cost). Expenses are not included.
 */
@Service
@Transactional(readOnly = true)
public class ReportService {

    public static final int MAX_ROWS = 10_000;

    private final NamedParameterJdbcTemplate jdbc;
    private final BusinessContext businessContext;

    public ReportService(NamedParameterJdbcTemplate jdbc, BusinessContext businessContext) {
        this.jdbc = jdbc;
        this.businessContext = businessContext;
    }

    public record Filter(LocalDate from, LocalDate to, UUID customerId, UUID productId, UUID supplierId, UUID categoryId) {
        public Filter {
            if (from != null && to != null && from.isAfter(to)) {
                throw BusinessException.validation("from", "'from' must be on or before 'to'");
            }
            if (from != null && to != null && ChronoUnit.DAYS.between(from, to) > 366 * 3) {
                throw BusinessException.validation("to", "Date range cannot exceed 3 years");
            }
        }
    }

    public ReportResult run(String name, Filter f) {
        LocalDate to = f.to() != null ? f.to() : businessContext.today();
        LocalDate from = f.from() != null ? f.from() : to.withDayOfMonth(1);
        Filter filter = new Filter(from, to, f.customerId(), f.productId(), f.supplierId(), f.categoryId());
        return switch (name) {
            case "sales" -> sales(filter);
            case "purchases" -> purchases(filter);
            case "stock" -> stock(filter);
            case "profit" -> profit(filter);
            case "tax" -> tax(filter);
            case "customers" -> customers(filter);
            case "outstanding" -> outstanding(filter);
            case "payments" -> payments(filter);
            default -> throw BusinessException.notFound(com.shopflow.common.error.ErrorCode.RESOURCE_NOT_FOUND, "Report " + name);
        };
    }

    public static boolean isFinancial(String name) {
        return "profit".equals(name) || "tax".equals(name);
    }

    private MapSqlParameterSource params(Filter f) {
        return new MapSqlParameterSource()
                .addValue("businessId", businessContext.businessId())
                .addValue("from", Date.valueOf(f.from()))
                .addValue("to", Date.valueOf(f.to()))
                .addValue("customerId", f.customerId())
                .addValue("productId", f.productId())
                .addValue("supplierId", f.supplierId())
                .addValue("categoryId", f.categoryId())
                .addValue("tz", businessContext.zone().getId())
                .addValue("limit", MAX_ROWS);
    }

    ReportResult sales(Filter f) {
        List<Column> cols = List.of(date("date", "Date"), text("invoice", "Invoice"), text("customer", "Customer"),
                text("product", "Product"), qty("quantity", "Quantity"), money("revenue", "Revenue"),
                money("discount", "Discount"), money("taxable", "Taxable"), money("tax", "Tax"), money("total", "Total"));
        List<Map<String, Object>> rows = query("""
                SELECT i.invoice_date AS date, i.invoice_number AS invoice, i.buyer_name AS customer, ii.product_name AS product,
                       ii.quantity, ii.gross_amount AS revenue, ii.discount_amount AS discount, ii.taxable_amount AS taxable,
                       ii.cgst_amount + ii.sgst_amount + ii.igst_amount AS tax, ii.line_total AS total
                FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
                WHERE i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED')
                  AND i.invoice_date BETWEEN :from AND :to
                  AND (CAST(:customerId AS uuid) IS NULL OR i.customer_id = :customerId)
                  AND (CAST(:productId AS uuid) IS NULL OR ii.product_id = :productId)
                ORDER BY i.invoice_date, i.invoice_number, ii.line_number LIMIT :limit
                """, params(f));
        return result("sales", "Sales Report", f, cols, rows);
    }

    ReportResult purchases(Filter f) {
        List<Column> cols = List.of(date("date", "Date"), text("purchase", "Purchase"), text("supplierInvoice", "Supplier Invoice"),
                text("supplier", "Supplier"), text("product", "Product"), qty("quantity", "Quantity"), money("cost", "Cost (Taxable)"),
                money("tax", "Tax"), money("total", "Total"));
        List<Map<String, Object>> rows = query("""
                SELECT p.purchase_date AS date, p.purchase_number AS purchase, p.supplier_invoice_number AS "supplierInvoice",
                       s.name AS supplier, pi.product_name AS product, pi.quantity, pi.taxable_amount AS cost,
                       pi.cgst_amount + pi.sgst_amount + pi.igst_amount AS tax, pi.line_total AS total
                FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id JOIN suppliers s ON s.id = p.supplier_id
                WHERE p.business_id = :businessId AND p.status = 'POSTED' AND p.purchase_date BETWEEN :from AND :to
                  AND (CAST(:supplierId AS uuid) IS NULL OR p.supplier_id = :supplierId)
                  AND (CAST(:productId AS uuid) IS NULL OR pi.product_id = :productId)
                ORDER BY p.purchase_date, p.purchase_number, pi.line_number LIMIT :limit
                """, params(f));
        return result("purchases", "Purchase Report", f, cols, rows);
    }

    ReportResult stock(Filter f) {
        List<Column> cols = List.of(text("sku", "SKU"), text("product", "Product"), text("category", "Category"),
                qty("opening", "Opening"), qty("in", "Purchase In"), qty("out", "Sales Out"), qty("salesReturn", "Sales Return In"),
                qty("purchaseReturn", "Purchase Return Out"), qty("adjustment", "Adjustments (net)"), qty("closing", "Closing"),
                money("value", "Closing Value"));
        List<Map<String, Object>> rows = query("""
                WITH bounds AS (
                    SELECT (CAST(:from AS date)::timestamp AT TIME ZONE :tz) AS start_ts,
                           ((CAST(:to AS date) + 1)::timestamp AT TIME ZONE :tz) AS end_ts
                )
                SELECT p.sku, p.name AS product, c.name AS category,
                  COALESCE(SUM(CASE WHEN m.created_at < b.start_ts THEN CASE WHEN m.direction = 'IN' THEN m.quantity ELSE -m.quantity END END), 0) AS opening,
                  COALESCE(SUM(CASE WHEN m.created_at >= b.start_ts AND m.created_at < b.end_ts AND m.movement_type IN ('PURCHASE_IN','OPENING') THEN m.quantity END), 0) AS "in",
                  COALESCE(SUM(CASE WHEN m.created_at >= b.start_ts AND m.created_at < b.end_ts AND m.movement_type = 'SALE_OUT' THEN m.quantity END), 0) AS "out",
                  COALESCE(SUM(CASE WHEN m.created_at >= b.start_ts AND m.created_at < b.end_ts AND m.movement_type = 'SALES_RETURN_IN' THEN m.quantity END), 0) AS "salesReturn",
                  COALESCE(SUM(CASE WHEN m.created_at >= b.start_ts AND m.created_at < b.end_ts AND m.movement_type = 'PURCHASE_RETURN_OUT' THEN m.quantity END), 0) AS "purchaseReturn",
                  COALESCE(SUM(CASE WHEN m.created_at >= b.start_ts AND m.created_at < b.end_ts AND m.movement_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','DAMAGE_OUT','LOSS_OUT')
                       THEN CASE WHEN m.direction = 'IN' THEN m.quantity ELSE -m.quantity END END), 0) AS adjustment,
                  COALESCE(SUM(CASE WHEN m.created_at < b.end_ts THEN CASE WHEN m.direction = 'IN' THEN m.quantity ELSE -m.quantity END END), 0) AS closing,
                  ROUND(COALESCE(SUM(CASE WHEN m.created_at < b.end_ts THEN CASE WHEN m.direction = 'IN' THEN m.quantity ELSE -m.quantity END END), 0) * p.purchase_price, 2) AS value
                FROM products p JOIN categories c ON c.id = p.category_id CROSS JOIN bounds b
                LEFT JOIN stock_movements m ON m.product_id = p.id
                WHERE p.business_id = :businessId
                  AND (CAST(:productId AS uuid) IS NULL OR p.id = :productId)
                  AND (CAST(:categoryId AS uuid) IS NULL OR p.category_id = :categoryId)
                GROUP BY p.id, p.sku, p.name, c.name, p.purchase_price
                ORDER BY p.name LIMIT :limit
                """, params(f));
        return result("stock", "Stock Report", f, cols, rows);
    }

    ReportResult profit(Filter f) {
        List<Column> cols = List.of(text("sku", "SKU"), text("product", "Product"), qty("quantity", "Qty Sold"),
                money("revenue", "Revenue"), money("discount", "Discounts"), money("netSales", "Net Sales"),
                money("cogs", "Cost of Goods Sold"), money("returns", "Returns (net of cost)"), money("grossProfit", "Gross Profit"),
                number("marginPercent", "Margin %"));
        List<Map<String, Object>> rows = query("""
                WITH sold AS (
                    SELECT ii.product_id, SUM(ii.quantity) AS qty, SUM(ii.gross_amount) AS revenue, SUM(ii.discount_amount) AS discount,
                           SUM(ii.taxable_amount) AS net_sales, SUM(ROUND(ii.quantity * ii.unit_cost, 2)) AS cogs
                    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
                    WHERE i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED') AND i.invoice_date BETWEEN :from AND :to
                    GROUP BY ii.product_id
                ), returned AS (
                    SELECT cni.product_id, SUM(cni.taxable_amount - ROUND(cni.quantity * ii.unit_cost, 2)) AS net
                    FROM credit_note_items cni JOIN credit_notes cn ON cn.id = cni.credit_note_id
                    JOIN invoice_items ii ON ii.id = cni.invoice_item_id
                    WHERE cn.business_id = :businessId AND cn.note_date BETWEEN :from AND :to
                    GROUP BY cni.product_id
                )
                SELECT p.sku, p.name AS product, COALESCE(s.qty, 0) AS quantity, COALESCE(s.revenue, 0) AS revenue,
                       COALESCE(s.discount, 0) AS discount, COALESCE(s.net_sales, 0) AS "netSales", COALESCE(s.cogs, 0) AS cogs,
                       COALESCE(r.net, 0) AS returns,
                       COALESCE(s.net_sales, 0) - COALESCE(s.cogs, 0) - COALESCE(r.net, 0) AS "grossProfit",
                       CASE WHEN COALESCE(s.net_sales, 0) - COALESCE(r.net, 0) > 0
                            THEN ROUND((COALESCE(s.net_sales, 0) - COALESCE(s.cogs, 0) - COALESCE(r.net, 0)) * 100 / (COALESCE(s.net_sales, 0)), 2) END AS "marginPercent"
                FROM products p LEFT JOIN sold s ON s.product_id = p.id LEFT JOIN returned r ON r.product_id = p.id
                WHERE p.business_id = :businessId AND (s.product_id IS NOT NULL OR r.product_id IS NOT NULL)
                  AND (CAST(:productId AS uuid) IS NULL OR p.id = :productId)
                ORDER BY "grossProfit" DESC LIMIT :limit
                """, params(f));
        ReportResult r = result("profit", "Profit Report", f, cols, rows);
        BigDecimal net = (BigDecimal) r.totals().get("netSales");
        BigDecimal gp = (BigDecimal) r.totals().get("grossProfit");
        if (net != null && net.signum() > 0) {
            r.totals().put("marginPercent", gp.multiply(BigDecimal.valueOf(100)).divide(net, 2, java.math.RoundingMode.HALF_UP));
        }
        return r;
    }

    ReportResult tax(Filter f) {
        List<Column> cols = List.of(date("date", "Date"), text("document", "Document"), text("type", "Type"),
                text("customer", "Customer"), text("gstin", "GSTIN"), text("placeOfSupply", "Place of Supply"),
                money("taxable", "Taxable Value"), money("cgst", "CGST"), money("sgst", "SGST/UTGST"), money("igst", "IGST"),
                money("totalTax", "Total Tax"), money("total", "Document Total"));
        List<Map<String, Object>> rows = query("""
                SELECT * FROM (
                  SELECT i.invoice_date AS date, i.invoice_number AS document, 'INVOICE' AS type, i.buyer_name AS customer,
                         i.buyer_gstin AS gstin, i.buyer_state_code AS "placeOfSupply", i.taxable_total AS taxable, i.cgst_total AS cgst,
                         i.sgst_total AS sgst, i.igst_total AS igst, i.cgst_total + i.sgst_total + i.igst_total AS "totalTax", i.grand_total AS total
                  FROM invoices i WHERE i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED') AND i.invoice_date BETWEEN :from AND :to
                    AND (CAST(:customerId AS uuid) IS NULL OR i.customer_id = :customerId)
                  UNION ALL
                  SELECT cn.note_date, cn.credit_note_number, 'CREDIT_NOTE', i.buyer_name, i.buyer_gstin, i.buyer_state_code,
                         -cn.taxable_total, -cn.cgst_total, -cn.sgst_total, -cn.igst_total, -(cn.cgst_total + cn.sgst_total + cn.igst_total), -cn.grand_total
                  FROM credit_notes cn JOIN invoices i ON i.id = cn.invoice_id
                  WHERE cn.business_id = :businessId AND cn.note_date BETWEEN :from AND :to
                    AND (CAST(:customerId AS uuid) IS NULL OR cn.customer_id = :customerId)
                ) t ORDER BY date, document LIMIT :limit
                """, params(f));
        return result("tax", "GST / Tax Report", f, cols, rows);
    }

    ReportResult customers(Filter f) {
        List<Column> cols = List.of(text("code", "Code"), text("customer", "Customer"), text("status", "Status"),
                number("transactions", "Invoices"), money("totalSales", "Total Sales"), money("totalPaid", "Total Paid"),
                money("credits", "Credit Notes"), money("outstanding", "Outstanding"), money("overdue", "Overdue"));
        List<Map<String, Object>> rows = query("""
                SELECT c.customer_code AS code, c.shop_name AS customer, c.status,
                  (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('DRAFT','CANCELLED') AND i.invoice_date BETWEEN :from AND :to) AS transactions,
                  COALESCE((SELECT SUM(i.grand_total) FROM invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('DRAFT','CANCELLED') AND i.invoice_date BETWEEN :from AND :to), 0) AS "totalSales",
                  COALESCE((SELECT SUM(p.amount - p.refunded_amount) FROM payments p WHERE p.customer_id = c.id AND p.status IN ('CAPTURED','PARTIALLY_PAID','REFUNDED')
                            AND (p.paid_at AT TIME ZONE :tz)::date BETWEEN :from AND :to), 0) AS "totalPaid",
                  COALESCE((SELECT SUM(cn.grand_total) FROM credit_notes cn WHERE cn.customer_id = c.id AND cn.note_date BETWEEN :from AND :to), 0) AS credits,
                  COALESCE((SELECT SUM(l.debit) - SUM(l.credit) FROM customer_ledger_entries l WHERE l.customer_id = c.id), 0) AS outstanding,
                  COALESCE((SELECT SUM(i.grand_total - i.paid_amount - i.credited_amount) FROM invoices i WHERE i.customer_id = c.id
                            AND i.status NOT IN ('DRAFT','CANCELLED') AND i.due_date < CAST(:to AS date)), 0) AS overdue
                FROM customers c WHERE c.business_id = :businessId AND (CAST(:customerId AS uuid) IS NULL OR c.id = :customerId)
                ORDER BY "totalSales" DESC, c.shop_name LIMIT :limit
                """, params(f));
        return result("customers", "Customer Report", f, cols, rows);
    }

    ReportResult outstanding(Filter f) {
        List<Column> cols = List.of(text("customer", "Customer"), text("invoice", "Invoice"), date("invoiceDate", "Invoice Date"),
                date("dueDate", "Due Date"), money("total", "Total"), money("paid", "Paid"), money("credited", "Credited"),
                money("outstanding", "Outstanding"), number("daysOverdue", "Days Overdue"));
        MapSqlParameterSource p = params(f).addValue("asOf", Date.valueOf(f.to()));
        List<Map<String, Object>> rows = query("""
                SELECT i.buyer_name AS customer, i.invoice_number AS invoice, i.invoice_date AS "invoiceDate", i.due_date AS "dueDate",
                       i.grand_total AS total, i.paid_amount AS paid, i.credited_amount AS credited,
                       i.grand_total - i.paid_amount - i.credited_amount AS outstanding,
                       GREATEST(0, CAST(:asOf AS date) - i.due_date) AS "daysOverdue"
                FROM invoices i
                WHERE i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED','PAID')
                  AND i.grand_total - i.paid_amount - i.credited_amount > 0
                  AND (CAST(:customerId AS uuid) IS NULL OR i.customer_id = :customerId)
                ORDER BY "daysOverdue" DESC, i.invoice_date LIMIT :limit
                """, p);
        ReportResult r = result("outstanding", "Outstanding Report", f, cols, rows);
        r.totals().remove("daysOverdue");
        return r;
    }

    ReportResult payments(Filter f) {
        List<Column> cols = List.of(date("date", "Date"), text("payment", "Payment"), text("customer", "Customer"),
                text("invoice", "Invoice"), money("amount", "Amount"), money("refunded", "Refunded"), text("method", "Method"),
                text("reference", "Reference"), text("status", "Status"), text("collector", "Collected By"));
        List<Map<String, Object>> rows = query("""
                SELECT (COALESCE(p.paid_at, p.created_at) AT TIME ZONE :tz)::date AS date, p.payment_number AS payment,
                       c.shop_name AS customer, i.invoice_number AS invoice, p.amount, p.refunded_amount AS refunded,
                       p.method, p.reference_number AS reference, p.status, u.full_name AS collector
                FROM payments p JOIN customers c ON c.id = p.customer_id
                LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN users u ON u.id = p.collected_by
                WHERE p.business_id = :businessId AND p.status IN ('CAPTURED','PARTIALLY_PAID','REFUNDED','CANCELLED')
                  AND (COALESCE(p.paid_at, p.created_at) AT TIME ZONE :tz)::date BETWEEN :from AND :to
                  AND (CAST(:customerId AS uuid) IS NULL OR p.customer_id = :customerId)
                ORDER BY date, p.payment_number LIMIT :limit
                """, params(f));
        ReportResult r = result("payments", "Payment Report", f, cols, rows);
        BigDecimal cancelled = rows.stream().filter(row -> "CANCELLED".equals(row.get("status")))
                .map(row -> (BigDecimal) row.get("amount")).reduce(BigDecimal.ZERO, BigDecimal::add);
        r.totals().put("amount", ((BigDecimal) r.totals().getOrDefault("amount", BigDecimal.ZERO)).subtract(cancelled));
        return r;
    }

    private List<Map<String, Object>> query(String sql, MapSqlParameterSource params) {
        return jdbc.query(sql, params, (ResultSet rs, int i) -> {
            ResultSetMetaData md = rs.getMetaData();
            Map<String, Object> row = new LinkedHashMap<>();
            for (int c = 1; c <= md.getColumnCount(); c++) {
                row.put(md.getColumnLabel(c), convert(rs.getObject(c)));
            }
            return row;
        });
    }

    private static Object convert(Object v) throws SQLException {
        if (v instanceof Date d) {
            return d.toLocalDate();
        }
        if (v instanceof Long || v instanceof Integer) {
            return ((Number) v).longValue();
        }
        return v;
    }

    private static ReportResult result(String name, String title, Filter f, List<Column> cols, List<Map<String, Object>> rows) {
        Map<String, Object> totals = new LinkedHashMap<>();
        for (Column c : cols) {
            if (c.type() == ReportResult.Type.MONEY || c.type() == ReportResult.Type.QUANTITY) {
                BigDecimal sum = BigDecimal.ZERO;
                for (Map<String, Object> row : rows) {
                    if (row.get(c.key()) instanceof BigDecimal b) {
                        sum = sum.add(b);
                    }
                }
                totals.put(c.key(), sum);
            }
        }
        return new ReportResult(name, title, f.from(), f.to(), cols, new ArrayList<>(rows), totals);
    }
}
