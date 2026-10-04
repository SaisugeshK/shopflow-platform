package com.shopflow.inventory;

import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettingsService;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Batch (expiry) and serial-number lookups for staff screens and reports (§0B.7). */
@Service
public class TrackingQueries {

    public record BatchRow(UUID id, UUID productId, String productName, String sku, String unit, String batchNumber,
                           LocalDate mfgDate, LocalDate expiryDate, BigDecimal onHand, Long daysToExpiry, String status) {
    }

    public record SerialRow(UUID id, UUID productId, String productName, String serialNumber, String status,
                            UUID purchaseId, String purchaseNumber, UUID invoiceId, String invoiceNumber, UUID orderId,
                            String orderNumber, UUID customerId, String customerName, Instant soldAt, LocalDate warrantyUntil,
                            boolean underWarranty) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final BusinessContext businessContext;
    private final BusinessSettingsService settings;

    public TrackingQueries(NamedParameterJdbcTemplate jdbc, BusinessContext businessContext, BusinessSettingsService settings) {
        this.jdbc = jdbc;
        this.businessContext = businessContext;
        this.settings = settings;
    }

    /** {@code status}: ALL (with stock), NEAR_EXPIRY, EXPIRED or EMPTY (sold out). */
    public List<BatchRow> batches(UUID productId, String status, String q) {
        LocalDate today = businessContext.today();
        int nearDays = settings.settings().getNearExpiryDays();
        StringBuilder sql = new StringBuilder("""
                SELECT b.id, b.product_id, p.name, p.sku, p.unit, b.batch_number, b.mfg_date, b.expiry_date, b.on_hand
                FROM stock_batches b JOIN products p ON p.id = b.product_id WHERE 1 = 1
                """);
        MapSqlParameterSource params = new MapSqlParameterSource("today", Date.valueOf(today))
                .addValue("near", Date.valueOf(today.plusDays(nearDays)));
        if (productId != null) {
            sql.append(" AND b.product_id = :productId");
            params.addValue("productId", productId);
        }
        String s = status == null ? "ALL" : status.toUpperCase(Locale.ROOT);
        switch (s) {
            case "EXPIRED" -> sql.append(" AND b.on_hand > 0 AND b.expiry_date < :today");
            case "NEAR_EXPIRY" -> sql.append(" AND b.on_hand > 0 AND b.expiry_date >= :today AND b.expiry_date <= :near");
            case "EMPTY" -> sql.append(" AND b.on_hand = 0");
            default -> sql.append(productId == null ? " AND b.on_hand > 0" : "");
        }
        if (q != null && !q.isBlank()) {
            sql.append(" AND (lower(p.name) LIKE :q OR lower(b.batch_number) LIKE :q OR lower(p.sku) LIKE :q)");
            params.addValue("q", "%" + q.trim().toLowerCase(Locale.ROOT) + "%");
        }
        sql.append(" ORDER BY b.expiry_date NULLS LAST, p.name, b.batch_number LIMIT 500");
        return jdbc.query(sql.toString(), params, (rs, i) -> {
            LocalDate expiry = rs.getDate("expiry_date") == null ? null : rs.getDate("expiry_date").toLocalDate();
            Long days = expiry == null ? null : ChronoUnit.DAYS.between(today, expiry);
            BigDecimal onHand = rs.getBigDecimal("on_hand");
            String state = onHand.signum() == 0 ? "EMPTY" : days == null ? "OK" : days < 0 ? "EXPIRED" : days <= nearDays ? "NEAR_EXPIRY" : "OK";
            return new BatchRow(rs.getObject("id", UUID.class), rs.getObject("product_id", UUID.class), rs.getString("name"),
                    rs.getString("sku"), rs.getString("unit"), rs.getString("batch_number"),
                    rs.getDate("mfg_date") == null ? null : rs.getDate("mfg_date").toLocalDate(), expiry, onHand, days, state);
        });
    }

    public List<SerialRow> serials(String q, UUID productId, String status) {
        LocalDate today = businessContext.today();
        StringBuilder sql = new StringBuilder("""
                SELECT s.id, s.product_id, p.name AS product_name, s.serial_number, s.status, s.purchase_id, pu.purchase_number,
                       s.invoice_id, i.invoice_number, s.order_id, o.order_number, s.customer_id, c.shop_name, s.sold_at, s.warranty_until
                FROM product_serials s JOIN products p ON p.id = s.product_id
                LEFT JOIN purchases pu ON pu.id = s.purchase_id
                LEFT JOIN invoices i ON i.id = s.invoice_id
                LEFT JOIN orders o ON o.id = s.order_id
                LEFT JOIN customers c ON c.id = s.customer_id
                WHERE 1 = 1
                """);
        MapSqlParameterSource params = new MapSqlParameterSource();
        if (q != null && !q.isBlank()) {
            sql.append(" AND (s.serial_number LIKE :q OR lower(p.name) LIKE :ql OR i.invoice_number LIKE :q)");
            params.addValue("q", "%" + q.trim().toUpperCase(Locale.ROOT) + "%").addValue("ql", "%" + q.trim().toLowerCase(Locale.ROOT) + "%");
        }
        if (productId != null) {
            sql.append(" AND s.product_id = :productId");
            params.addValue("productId", productId);
        }
        if (status != null && !status.isBlank()) {
            sql.append(" AND s.status = :status");
            params.addValue("status", status.trim().toUpperCase(Locale.ROOT));
        }
        sql.append(" ORDER BY s.updated_at DESC LIMIT 500");
        return jdbc.query(sql.toString(), params, (rs, i) -> {
            LocalDate warranty = rs.getDate("warranty_until") == null ? null : rs.getDate("warranty_until").toLocalDate();
            return new SerialRow(rs.getObject("id", UUID.class), rs.getObject("product_id", UUID.class), rs.getString("product_name"),
                    rs.getString("serial_number"), rs.getString("status"), rs.getObject("purchase_id", UUID.class),
                    rs.getString("purchase_number"), rs.getObject("invoice_id", UUID.class), rs.getString("invoice_number"),
                    rs.getObject("order_id", UUID.class), rs.getString("order_number"), rs.getObject("customer_id", UUID.class),
                    rs.getString("shop_name"), rs.getTimestamp("sold_at") == null ? null : rs.getTimestamp("sold_at").toInstant(),
                    warranty, warranty != null && !warranty.isBefore(today));
        });
    }

    /** In-stock serial numbers of a product (for choosing them on a counter invoice). */
    public List<String> inStockSerials(UUID productId) {
        return jdbc.queryForList("SELECT serial_number FROM product_serials WHERE product_id = :p AND status = 'IN_STOCK' ORDER BY created_at",
                new MapSqlParameterSource("p", productId), String.class);
    }
}
