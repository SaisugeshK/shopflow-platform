package com.shopflow.dashboard;

import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.util.FinancialYear;
import com.shopflow.common.util.Money;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Dashboard aggregates (§33, §34, §35). Computed from the database on each request; nothing here is cached as a
 * source of truth (§72).
 */
@Service
@Transactional(readOnly = true)
public class DashboardService {

    private final NamedParameterJdbcTemplate jdbc;
    private final BusinessContext businessContext;

    public DashboardService(NamedParameterJdbcTemplate jdbc, BusinessContext businessContext) {
        this.jdbc = jdbc;
        this.businessContext = businessContext;
    }

    public enum Range { TODAY, YESTERDAY, THIS_WEEK, THIS_MONTH, THIS_FINANCIAL_YEAR, CUSTOM }

    public record Period(Range range, LocalDate from, LocalDate to) {
    }

    public Period period(Range range, LocalDate from, LocalDate to) {
        LocalDate today = businessContext.today();
        Range r = range == null ? Range.THIS_MONTH : range;
        return switch (r) {
            case TODAY -> new Period(r, today, today);
            case YESTERDAY -> new Period(r, today.minusDays(1), today.minusDays(1));
            case THIS_WEEK -> new Period(r, today.with(DayOfWeek.MONDAY), today);
            case THIS_MONTH -> new Period(r, today.withDayOfMonth(1), today);
            case THIS_FINANCIAL_YEAR -> new Period(r, FinancialYear.start(today, businessContext.financialYearStartMonth()), today);
            case CUSTOM -> {
                if (from == null || to == null || from.isAfter(to)) {
                    throw BusinessException.validation("from", "CUSTOM range needs from <= to");
                }
                yield new Period(r, from, to);
            }
        };
    }

    private MapSqlParameterSource params(Period p) {
        return new MapSqlParameterSource()
                .addValue("businessId", businessContext.businessId())
                .addValue("from", Date.valueOf(p.from()))
                .addValue("to", Date.valueOf(p.to()))
                .addValue("today", Date.valueOf(businessContext.today()))
                .addValue("tz", businessContext.zone().getId());
    }

    public Map<String, Object> owner(Period p) {
        MapSqlParameterSource params = params(p);
        Map<String, Object> kpis = new LinkedHashMap<>();
        Map<String, Object> todays = jdbc.queryForMap("""
                SELECT COALESCE(SUM(i.grand_total), 0) AS sales,
                       COALESCE((SELECT SUM(ii.taxable_amount - ROUND(ii.quantity * ii.unit_cost, 2)) FROM invoice_items ii JOIN invoices x ON x.id = ii.invoice_id
                                 WHERE x.business_id = :businessId AND x.status NOT IN ('DRAFT','CANCELLED') AND x.invoice_date = :today), 0) AS profit
                FROM invoices i WHERE i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED') AND i.invoice_date = :today
                """, params);
        kpis.put("todaySales", money(todays.get("sales")));
        kpis.put("todayProfit", money(todays.get("profit")));
        Map<String, Object> period = jdbc.queryForMap("""
                SELECT COALESCE(SUM(i.grand_total), 0) AS sales, COUNT(*) AS invoices,
                       COALESCE((SELECT SUM(ii.taxable_amount - ROUND(ii.quantity * ii.unit_cost, 2)) FROM invoice_items ii JOIN invoices x ON x.id = ii.invoice_id
                                 WHERE x.business_id = :businessId AND x.status NOT IN ('DRAFT','CANCELLED') AND x.invoice_date BETWEEN :from AND :to), 0) AS profit
                FROM invoices i WHERE i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED') AND i.invoice_date BETWEEN :from AND :to
                """, params);
        kpis.put("periodSales", money(period.get("sales")));
        kpis.put("periodProfit", money(period.get("profit")));
        kpis.put("periodInvoices", ((Number) period.get("invoices")).longValue());
        kpis.put("totalCustomers", count("SELECT COUNT(*) FROM customers WHERE business_id = :businessId AND status = 'APPROVED'", params));
        kpis.put("pendingApprovals", count("SELECT COUNT(*) FROM customers WHERE business_id = :businessId AND status = 'PENDING_APPROVAL'", params));
        kpis.put("stockValue", money(jdbc.queryForObject("""
                SELECT COALESCE(SUM(b.on_hand * p.purchase_price), 0) FROM stock_balances b JOIN products p ON p.id = b.product_id
                WHERE p.business_id = :businessId""", params, BigDecimal.class)));
        kpis.put("outstanding", money(jdbc.queryForObject("""
                SELECT COALESCE(SUM(GREATEST(bal, 0)), 0) FROM (SELECT SUM(l.debit) - SUM(l.credit) AS bal
                FROM customer_ledger_entries l JOIN customers c ON c.id = l.customer_id WHERE c.business_id = :businessId GROUP BY l.customer_id) t
                """, params, BigDecimal.class)));
        kpis.put("overdue", money(jdbc.queryForObject("""
                SELECT COALESCE(SUM(grand_total - paid_amount - credited_amount), 0) FROM invoices
                WHERE business_id = :businessId AND status NOT IN ('DRAFT','CANCELLED','PAID') AND due_date < :today""", params, BigDecimal.class)));
        kpis.put("pendingOrders", count("SELECT COUNT(*) FROM orders WHERE business_id = :businessId AND status IN ('PLACED','ACCEPTED','PACKING','READY_FOR_DELIVERY','OUT_FOR_DELIVERY')", params));
        kpis.put("pendingPayments", money(jdbc.queryForObject("""
                SELECT COALESCE(SUM(grand_total - paid_amount - credited_amount), 0) FROM invoices
                WHERE business_id = :businessId AND status NOT IN ('DRAFT','CANCELLED','PAID')""", params, BigDecimal.class)));
        kpis.put("lowStockProducts", lowStockCount(params));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period", p);
        result.put("kpis", kpis);
        result.put("salesTrend", jdbc.queryForList("""
                SELECT d::date AS date, COALESCE(SUM(i.grand_total), 0) AS sales
                FROM generate_series(CAST(:from AS date), CAST(:to AS date), interval '1 day') d
                LEFT JOIN invoices i ON i.invoice_date = d::date AND i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED')
                GROUP BY d ORDER BY d""", params));
        result.put("purchaseTrend", jdbc.queryForList("""
                SELECT d::date AS date, COALESCE(SUM(p.grand_total), 0) AS purchases
                FROM generate_series(CAST(:from AS date), CAST(:to AS date), interval '1 day') d
                LEFT JOIN purchases p ON p.purchase_date = d::date AND p.business_id = :businessId AND p.status = 'POSTED'
                GROUP BY d ORDER BY d""", params));
        result.put("paymentTrend", jdbc.queryForList("""
                SELECT d::date AS date, COALESCE(SUM(p.amount - p.refunded_amount), 0) AS collected
                FROM generate_series(CAST(:from AS date), CAST(:to AS date), interval '1 day') d
                LEFT JOIN payments p ON (p.paid_at AT TIME ZONE :tz)::date = d::date AND p.business_id = :businessId
                     AND p.status IN ('CAPTURED','PARTIALLY_PAID','REFUNDED')
                GROUP BY d ORDER BY d""", params));
        result.put("salesByCategory", jdbc.queryForList("""
                SELECT c.name AS category, COALESCE(SUM(ii.line_total), 0) AS sales
                FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id JOIN products p ON p.id = ii.product_id JOIN categories c ON c.id = p.category_id
                WHERE i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED') AND i.invoice_date BETWEEN :from AND :to
                GROUP BY c.name ORDER BY sales DESC""", params));
        result.put("topProducts", jdbc.queryForList("""
                SELECT ii.product_id AS "productId", ii.product_name AS product, SUM(ii.quantity) AS quantity, SUM(ii.line_total) AS sales
                FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
                WHERE i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED') AND i.invoice_date BETWEEN :from AND :to
                GROUP BY ii.product_id, ii.product_name ORDER BY sales DESC LIMIT 10""", params));
        result.put("topCustomers", jdbc.queryForList("""
                SELECT i.customer_id AS "customerId", MAX(i.buyer_name) AS customer, COUNT(*) AS invoices, SUM(i.grand_total) AS sales
                FROM invoices i WHERE i.business_id = :businessId AND i.status NOT IN ('DRAFT','CANCELLED') AND i.invoice_date BETWEEN :from AND :to
                GROUP BY i.customer_id ORDER BY sales DESC LIMIT 10""", params));
        result.put("outstandingCustomers", jdbc.queryForList("""
                SELECT c.id AS "customerId", c.shop_name AS customer, SUM(l.debit) - SUM(l.credit) AS outstanding
                FROM customer_ledger_entries l JOIN customers c ON c.id = l.customer_id WHERE c.business_id = :businessId
                GROUP BY c.id, c.shop_name HAVING SUM(l.debit) - SUM(l.credit) > 0 ORDER BY outstanding DESC LIMIT 10""", params));
        result.put("outstandingTrend", jdbc.queryForList("""
                SELECT d::date AS date,
                       COALESCE((SELECT SUM(l.debit) - SUM(l.credit) FROM customer_ledger_entries l JOIN customers c ON c.id = l.customer_id
                                 WHERE c.business_id = :businessId AND l.entry_date <= d::date), 0) AS outstanding
                FROM generate_series(CAST(:from AS date), CAST(:to AS date), interval '1 day') d ORDER BY d""", params));
        result.put("recentOrders", recentOrders(params));
        result.put("lowStock", lowStock(params));
        result.put("recentPayments", jdbc.queryForList("""
                SELECT p.id, p.payment_number AS "paymentNumber", c.shop_name AS customer, p.amount, p.method, p.status, p.paid_at AS "paidAt"
                FROM payments p JOIN customers c ON c.id = p.customer_id
                WHERE p.business_id = :businessId AND p.status IN ('CAPTURED','PARTIALLY_PAID','REFUNDED')
                ORDER BY p.paid_at DESC NULLS LAST LIMIT 10""", params));
        return result;
    }

    public Map<String, Object> admin(Period p) {
        MapSqlParameterSource params = params(p);
        Map<String, Object> kpis = new LinkedHashMap<>();
        kpis.put("todayOrders", count("SELECT COUNT(*) FROM orders WHERE business_id = :businessId AND (placed_at AT TIME ZONE :tz)::date = :today", params));
        for (String status : List.of("PLACED", "ACCEPTED", "PACKING", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY")) {
            kpis.put(camel(status), count("SELECT COUNT(*) FROM orders WHERE business_id = :businessId AND status = '" + status + "'", params));
        }
        kpis.put("creditApprovals", count("SELECT COUNT(*) FROM orders WHERE business_id = :businessId AND credit_approval_status = 'PENDING' AND status = 'PLACED'", params));
        kpis.put("todaySales", money(jdbc.queryForObject("""
                SELECT COALESCE(SUM(grand_total), 0) FROM invoices WHERE business_id = :businessId AND status NOT IN ('DRAFT','CANCELLED') AND invoice_date = :today""",
                params, BigDecimal.class)));
        kpis.put("pendingPayments", money(jdbc.queryForObject("""
                SELECT COALESCE(SUM(grand_total - paid_amount - credited_amount), 0) FROM invoices
                WHERE business_id = :businessId AND status NOT IN ('DRAFT','CANCELLED','PAID')""", params, BigDecimal.class)));
        kpis.put("lowStockProducts", lowStockCount(params));
        kpis.put("pendingApprovals", count("SELECT COUNT(*) FROM customers WHERE business_id = :businessId AND status = 'PENDING_APPROVAL'", params));
        kpis.put("pendingReturns", count("SELECT COUNT(*) FROM sales_returns WHERE business_id = :businessId AND status = 'REQUESTED'", params));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period", p);
        result.put("kpis", kpis);
        result.put("recentOrders", recentOrders(params));
        result.put("lowStock", lowStock(params));
        return result;
    }

    public Map<String, Object> customer(UUID customerId) {
        MapSqlParameterSource params = params(period(Range.THIS_MONTH, null, null)).addValue("customerId", customerId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("outstanding", money(jdbc.queryForObject(
                "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM customer_ledger_entries WHERE customer_id = :customerId", params, BigDecimal.class)));
        result.put("openOrders", count("""
                SELECT COUNT(*) FROM orders WHERE customer_id = :customerId
                AND status IN ('PLACED','ACCEPTED','PACKING','READY_FOR_DELIVERY','OUT_FOR_DELIVERY')""", params));
        result.put("recentOrders", jdbc.queryForList("""
                SELECT id, order_number AS "orderNumber", status, payment_status AS "paymentStatus", grand_total AS "grandTotal", placed_at AS "placedAt"
                FROM orders WHERE customer_id = :customerId ORDER BY placed_at DESC LIMIT 5""", params));
        result.put("recentlyOrderedProducts", jdbc.queryForList("""
                SELECT oi.product_id AS "productId", MAX(oi.product_name) AS product, MAX(o.placed_at) AS "lastOrderedAt", SUM(oi.ordered_quantity) AS quantity
                FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
                WHERE o.customer_id = :customerId AND p.active GROUP BY oi.product_id ORDER BY "lastOrderedAt" DESC LIMIT 8""", params));
        result.put("openInvoices", count("""
                SELECT COUNT(*) FROM invoices WHERE customer_id = :customerId AND status NOT IN ('DRAFT','CANCELLED','PAID')""", params));
        return result;
    }

    private List<Map<String, Object>> recentOrders(MapSqlParameterSource params) {
        return jdbc.queryForList("""
                SELECT o.id, o.order_number AS "orderNumber", c.shop_name AS customer, o.status, o.payment_status AS "paymentStatus",
                       o.payment_method AS "paymentMethod", o.grand_total AS "grandTotal", o.placed_at AS "placedAt"
                FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.business_id = :businessId
                ORDER BY o.placed_at DESC LIMIT 10""", params);
    }

    private List<Map<String, Object>> lowStock(MapSqlParameterSource params) {
        return jdbc.queryForList("""
                SELECT p.id AS "productId", p.sku, p.name AS product, b.on_hand - b.reserved AS available, p.minimum_stock AS "minimumStock"
                FROM products p JOIN stock_balances b ON b.product_id = p.id
                WHERE p.business_id = :businessId AND p.active AND b.on_hand - b.reserved <= p.minimum_stock
                ORDER BY b.on_hand - b.reserved ASC LIMIT 10""", params);
    }

    private long lowStockCount(MapSqlParameterSource params) {
        return count("""
                SELECT COUNT(*) FROM products p JOIN stock_balances b ON b.product_id = p.id
                WHERE p.business_id = :businessId AND p.active AND b.on_hand - b.reserved <= p.minimum_stock""", params);
    }

    private long count(String sql, MapSqlParameterSource params) {
        Long v = jdbc.queryForObject(sql, params, Long.class);
        return v == null ? 0 : v;
    }

    private static BigDecimal money(Object v) {
        return Money.of(v == null ? BigDecimal.ZERO : (BigDecimal) v);
    }

    private static String camel(String s) {
        String[] parts = s.toLowerCase().split("_");
        StringBuilder sb = new StringBuilder(parts[0]);
        for (int i = 1; i < parts.length; i++) {
            sb.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
        }
        return sb.append("Orders").toString();
    }
}
