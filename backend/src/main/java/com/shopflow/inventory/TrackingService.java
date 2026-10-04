package com.shopflow.inventory;

import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Money;
import com.shopflow.products.Product;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Batch + expiry (first-expiry-first-out) and serial / IMEI tracking (§0B.7). Called by {@link InventoryService} for
 * every movement of a tracked product, inside the same transaction, after the stock balance is updated; the sum of a
 * product's batches always equals its on-hand stock.
 */
@Service
public class TrackingService {

    static final String UNBATCHED = "UNBATCHED";

    private final JdbcTemplate jdbc;
    private final BusinessContext businessContext;
    private final BusinessSettingsService settings;

    public TrackingService(JdbcTemplate jdbc, BusinessContext businessContext, BusinessSettingsService settings) {
        this.jdbc = jdbc;
        this.businessContext = businessContext;
        this.settings = settings;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public StockTrace.Result apply(Product product, StockMovement movement, StockTrace trace) {
        StockTrace t = trace == null ? StockTrace.NONE : trace;
        if (product.isTrackBatches()) {
            return movement.getMovementType().inbound() ? batchIn(product, movement, t) : batchOut(product, movement, t);
        }
        if (product.isTrackSerials()) {
            return movement.getMovementType().inbound() ? serialIn(product, movement, t) : serialOut(product, movement, t);
        }
        return StockTrace.Result.NONE;
    }

    // ---------------------------------------------------------------- batches

    private StockTrace.Result batchIn(Product product, StockMovement m, StockTrace t) {
        BigDecimal remaining = m.getQuantity();
        List<String> parts = new ArrayList<>();
        if (t.reverseType() != null && t.batchNumber() == null) {
            // Return the stock to the batches it left from under the reversed reference.
            List<Map<String, Object>> out = jdbc.queryForList("""
                    SELECT bm.batch_id, b.batch_number, sum(bm.quantity) AS qty FROM batch_movements bm
                    JOIN stock_batches b ON b.id = bm.batch_id
                    WHERE bm.reference_type = ? AND bm.reference_id = ? AND bm.direction = 'OUT' AND b.product_id = ?
                    GROUP BY bm.batch_id, b.batch_number, b.expiry_date ORDER BY b.expiry_date NULLS LAST
                    """, t.reverseType(), t.reverseId(), product.getId());
            for (Map<String, Object> row : out) {
                if (remaining.signum() <= 0) {
                    break;
                }
                BigDecimal take = Money.min(remaining, (BigDecimal) row.get("qty"));
                move((UUID) row.get("batch_id"), take, "IN", m);
                parts.add(row.get("batch_number") + " × " + plain(take));
                remaining = remaining.subtract(take);
            }
        }
        if (remaining.signum() > 0) {
            String number = t.batchNumber() == null || t.batchNumber().isBlank() ? UNBATCHED : t.batchNumber().trim().toUpperCase(Locale.ROOT);
            if (t.expiryDate() != null && t.mfgDate() != null && t.expiryDate().isBefore(t.mfgDate())) {
                throw BusinessException.validation("expiryDate", "Expiry date is before the manufacturing date for batch " + number);
            }
            UUID batchId = upsertBatch(product.getId(), number, t.mfgDate(), t.expiryDate(), m.getUnitCost(),
                    "PURCHASE".equals(m.getReferenceType()) ? m.getReferenceId() : null);
            move(batchId, remaining, "IN", m);
            parts.add(number + " × " + plain(remaining));
        }
        return new StockTrace.Result(String.join(", ", parts), List.of());
    }

    private StockTrace.Result batchOut(Product product, StockMovement m, StockTrace t) {
        BigDecimal remaining = m.getQuantity();
        List<String> parts = new ArrayList<>();
        LocalDate today = businessContext.today();
        boolean sale = m.getMovementType() == StockMovement.MovementType.SALE_OUT || m.getMovementType() == StockMovement.MovementType.CHALLAN_OUT;
        boolean saleBlocksExpired = sale && settings.settings().isBlockExpiredSales();
        List<Map<String, Object>> batches;
        if (t.batchNumber() != null && !t.batchNumber().isBlank()) {
            batches = jdbc.queryForList("SELECT id, batch_number, on_hand, expiry_date FROM stock_batches WHERE product_id = ? AND batch_number = ? FOR UPDATE",
                    product.getId(), t.batchNumber().trim().toUpperCase(Locale.ROOT));
            if (batches.isEmpty()) {
                throw BusinessException.validation("batchNumber", "Batch " + t.batchNumber() + " of " + product.getName() + " not found");
            }
        } else {
            batches = jdbc.queryForList("""
                    SELECT id, batch_number, on_hand, expiry_date FROM stock_batches
                    WHERE product_id = ? AND on_hand > 0 ORDER BY expiry_date NULLS LAST, created_at FOR UPDATE
                    """, product.getId());
        }
        BigDecimal expiredSkipped = BigDecimal.ZERO;
        for (Map<String, Object> b : batches) {
            if (remaining.signum() <= 0) {
                break;
            }
            Date expiry = (Date) b.get("expiry_date");
            if (saleBlocksExpired && expiry != null && expiry.toLocalDate().isBefore(today)) {
                expiredSkipped = expiredSkipped.add((BigDecimal) b.get("on_hand"));
                continue;
            }
            BigDecimal take = Money.min(remaining, (BigDecimal) b.get("on_hand"));
            if (take.signum() <= 0) {
                continue;
            }
            move((UUID) b.get("id"), take, "OUT", m);
            parts.add(b.get("batch_number") + (expiry != null ? " (exp " + expiry.toLocalDate() + ")" : "") + " × " + plain(take));
            remaining = remaining.subtract(take);
        }
        if (remaining.signum() > 0) {
            String detail = expiredSkipped.signum() > 0
                    ? " (" + plain(expiredSkipped) + " more is in expired batches, which cannot be sold)"
                    : "";
            throw new BusinessException(ErrorCode.INSUFFICIENT_STOCK, "Not enough stock of " + product.getName()
                    + (t.batchNumber() != null ? " in batch " + t.batchNumber() : " in its batches") + detail);
        }
        return new StockTrace.Result(String.join(", ", parts), List.of());
    }

    private UUID upsertBatch(UUID productId, String number, LocalDate mfg, LocalDate expiry, BigDecimal unitCost, UUID purchaseId) {
        List<Map<String, Object>> existing = jdbc.queryForList(
                "SELECT id, expiry_date FROM stock_batches WHERE product_id = ? AND batch_number = ? FOR UPDATE", productId, number);
        if (!existing.isEmpty()) {
            Date known = (Date) existing.getFirst().get("expiry_date");
            if (expiry != null && known != null && !known.toLocalDate().equals(expiry)) {
                throw BusinessException.validation("expiryDate", "Batch " + number + " already exists with expiry " + known.toLocalDate());
            }
            if (expiry != null && known == null) {
                jdbc.update("UPDATE stock_batches SET expiry_date = ?, mfg_date = coalesce(mfg_date, ?) WHERE id = ?",
                        Date.valueOf(expiry), mfg == null ? null : Date.valueOf(mfg), existing.getFirst().get("id"));
            }
            return (UUID) existing.getFirst().get("id");
        }
        UUID id = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO stock_batches (id, product_id, batch_number, mfg_date, expiry_date, on_hand, unit_cost, purchase_id, created_at, updated_at)
                VALUES (?,?,?,?,?,0,?,?,?,?)
                """, id, productId, number, mfg == null ? null : Date.valueOf(mfg), expiry == null ? null : Date.valueOf(expiry),
                unitCost, purchaseId, now, now);
        return id;
    }

    private void move(UUID batchId, BigDecimal quantity, String direction, StockMovement m) {
        int updated = jdbc.update("UPDATE stock_batches SET on_hand = on_hand " + ("IN".equals(direction) ? "+" : "-")
                + " ?, updated_at = ? WHERE id = ?" + ("OUT".equals(direction) ? " AND on_hand >= ?" : ""),
                "OUT".equals(direction)
                        ? new Object[]{quantity, Timestamp.from(Instant.now()), batchId, quantity}
                        : new Object[]{quantity, Timestamp.from(Instant.now()), batchId});
        if (updated == 0) {
            throw new BusinessException(ErrorCode.INSUFFICIENT_STOCK, "Batch stock changed; please try again");
        }
        jdbc.update("""
                INSERT INTO batch_movements (id, batch_id, stock_movement_id, direction, quantity, reference_type, reference_id, created_at)
                VALUES (?,?,?,?,?,?,?,?)
                """, UUID.randomUUID(), batchId, m.getId(), direction, quantity, m.getReferenceType(), m.getReferenceId(),
                Timestamp.from(Instant.now()));
    }

    /** Stock that existed before batch tracking was switched on becomes one UNBATCHED batch. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void openUnbatched(UUID productId, BigDecimal onHand) {
        BigDecimal inBatches = jdbc.queryForObject("SELECT coalesce(sum(on_hand), 0) FROM stock_batches WHERE product_id = ?",
                BigDecimal.class, productId);
        BigDecimal gap = Money.qty(onHand.subtract(inBatches));
        if (gap.signum() > 0) {
            UUID batchId = upsertBatch(productId, UNBATCHED, null, null, null, null);
            jdbc.update("UPDATE stock_batches SET on_hand = on_hand + ?, updated_at = ? WHERE id = ?", gap, Timestamp.from(Instant.now()), batchId);
        }
    }

    // ---------------------------------------------------------------- serials

    private StockTrace.Result serialIn(Product product, StockMovement m, StockTrace t) {
        int count = wholeUnits(product, m.getQuantity());
        List<String> serials = new ArrayList<>();
        if (t.hasSerials()) {
            List<String> given = normalise(t.serialNumbers(), count, product);
            Timestamp now = Timestamp.from(Instant.now());
            for (String s : given) {
                List<Map<String, Object>> existing = jdbc.queryForList(
                        "SELECT id, status FROM product_serials WHERE product_id = ? AND serial_number = ? FOR UPDATE", product.getId(), s);
                if (existing.isEmpty()) {
                    jdbc.update("""
                            INSERT INTO product_serials (id, product_id, serial_number, status, purchase_id, created_at, updated_at)
                            VALUES (?,?,?,'IN_STOCK',?,?,?)
                            """, UUID.randomUUID(), product.getId(), s, "PURCHASE".equals(m.getReferenceType()) ? m.getReferenceId() : null, now, now);
                } else if ("IN_STOCK".equals(existing.getFirst().get("status"))) {
                    throw BusinessException.validation("serialNumbers", "Serial " + s + " is already in stock");
                } else {
                    restock((UUID) existing.getFirst().get("id"));
                }
                serials.add(s);
            }
        } else if (t.reverseType() != null) {
            List<Map<String, Object>> sold = "INVOICE".equals(t.reverseType()) || "ORDER".equals(t.reverseType())
                    ? jdbc.queryForList("SELECT id, serial_number FROM product_serials WHERE product_id = ? AND "
                    + referenceColumn(t.reverseType()) + " = ? AND status IN ('SOLD','REMOVED') ORDER BY sold_at DESC NULLS LAST LIMIT ? FOR UPDATE",
                    product.getId(), t.reverseId(), count)
                    : jdbc.queryForList("SELECT id, serial_number FROM product_serials WHERE product_id = ? AND customer_id = ? AND status = 'SOLD' "
                    + "AND invoice_id IS NULL AND order_id IS NULL ORDER BY sold_at DESC NULLS LAST LIMIT ? FOR UPDATE",
                    product.getId(), t.customerId(), count);
            if (sold.size() < count) {
                throw BusinessException.validation("serialNumbers", "Enter the serial numbers of the " + product.getName() + " units coming back");
            }
            sold.forEach(r -> {
                restock((UUID) r.get("id"));
                serials.add((String) r.get("serial_number"));
            });
        } else {
            throw BusinessException.validation("serialNumbers", "Enter " + count + " serial number(s) for " + product.getName());
        }
        return new StockTrace.Result(null, serials);
    }

    private StockTrace.Result serialOut(Product product, StockMovement m, StockTrace t) {
        int count = wholeUnits(product, m.getQuantity());
        StockMovement.MovementType type = m.getMovementType();
        String status = switch (type) {
            case SALE_OUT, CHALLAN_OUT -> "SOLD";
            case PURCHASE_RETURN_OUT -> "RETURNED_TO_SUPPLIER";
            default -> "REMOVED";
        };
        List<Map<String, Object>> rows;
        if (t.hasSerials()) {
            List<String> given = normalise(t.serialNumbers(), count, product);
            rows = new ArrayList<>();
            for (String s : given) {
                List<Map<String, Object>> r = jdbc.queryForList(
                        "SELECT id, serial_number, status FROM product_serials WHERE product_id = ? AND serial_number = ? FOR UPDATE", product.getId(), s);
                if (r.isEmpty() || !"IN_STOCK".equals(r.getFirst().get("status"))) {
                    throw BusinessException.validation("serialNumbers", "Serial " + s + " of " + product.getName() + " is not in stock");
                }
                rows.add(r.getFirst());
            }
        } else {
            // Oldest units first (for a purchase return: units of that purchase first).
            String preferPurchase = type == StockMovement.MovementType.PURCHASE_RETURN_OUT && t.reverseId() != null
                    ? "(purchase_id = '" + t.reverseId() + "') DESC, " : "";
            rows = jdbc.queryForList("SELECT id, serial_number, status FROM product_serials WHERE product_id = ? AND status = 'IN_STOCK' ORDER BY "
                    + preferPurchase + "created_at LIMIT ? FOR UPDATE", product.getId(), count);
            if (rows.size() < count) {
                throw new BusinessException(ErrorCode.INSUFFICIENT_STOCK, "Only " + rows.size() + " serial-numbered unit(s) of " + product.getName() + " are in stock");
            }
        }
        LocalDate today = businessContext.today();
        LocalDate warranty = "SOLD".equals(status) && product.getWarrantyMonths() != null && product.getWarrantyMonths() > 0
                ? today.plusMonths(product.getWarrantyMonths()) : null;
        String column = "SOLD".equals(status) && ("INVOICE".equals(m.getReferenceType()) || "ORDER".equals(m.getReferenceType()))
                ? referenceColumn(m.getReferenceType()) : null;
        List<String> serials = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            if (column == null && "SOLD".equals(status)) {
                // e.g. a delivery challan: sold to the customer, invoiced later.
                jdbc.update("UPDATE product_serials SET status = 'SOLD', customer_id = ?, sold_at = ?, warranty_until = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                        t.customerId(), Timestamp.from(Instant.now()), warranty == null ? null : Date.valueOf(warranty), Timestamp.from(Instant.now()), r.get("id"));
            } else if (column != null) {
                jdbc.update("UPDATE product_serials SET status = ?, " + column + " = ?, customer_id = ?, sold_at = ?, warranty_until = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                        status, m.getReferenceId(), t.customerId(), Timestamp.from(Instant.now()), warranty == null ? null : Date.valueOf(warranty),
                        Timestamp.from(Instant.now()), r.get("id"));
            } else {
                jdbc.update("UPDATE product_serials SET status = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                        status, Timestamp.from(Instant.now()), r.get("id"));
            }
            serials.add((String) r.get("serial_number"));
        }
        return new StockTrace.Result(null, serials);
    }

    private void restock(UUID serialId) {
        jdbc.update("""
                UPDATE product_serials SET status = 'IN_STOCK', invoice_id = NULL, order_id = NULL, customer_id = NULL, sold_at = NULL,
                    warranty_until = NULL, updated_at = ?, version = version + 1 WHERE id = ?
                """, Timestamp.from(Instant.now()), serialId);
    }

    /** Links serials sold on an order to the invoice that bills them (warranty lookup by invoice). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void linkOrderSerialsToInvoice(UUID orderId, UUID invoiceId) {
        jdbc.update("UPDATE product_serials SET invoice_id = ? WHERE order_id = ? AND invoice_id IS NULL AND status = 'SOLD'", invoiceId, orderId);
    }

    /** Batch and serial details for a document line, from what actually moved under that reference. */
    public StockTrace.Result describe(String referenceType, UUID referenceId, UUID productId) {
        List<String> batches = jdbc.query("""
                SELECT b.batch_number, b.expiry_date, sum(bm.quantity) AS qty FROM batch_movements bm JOIN stock_batches b ON b.id = bm.batch_id
                WHERE bm.reference_type = ? AND bm.reference_id = ? AND b.product_id = ? AND bm.direction = 'OUT'
                GROUP BY b.batch_number, b.expiry_date ORDER BY b.expiry_date NULLS LAST
                """, (rs, i) -> rs.getString(1) + (rs.getDate(2) != null ? " (exp " + rs.getDate(2).toLocalDate() + ")" : "")
                + " × " + plain(rs.getBigDecimal(3)), referenceType, referenceId, productId);
        List<String> serials = "INVOICE".equals(referenceType) || "ORDER".equals(referenceType)
                ? jdbc.queryForList("SELECT serial_number FROM product_serials WHERE product_id = ? AND " + referenceColumn(referenceType)
                + " = ? ORDER BY serial_number", String.class, productId, referenceId)
                : List.of();
        return new StockTrace.Result(batches.isEmpty() ? null : String.join(", ", batches), serials);
    }

    private static String referenceColumn(String referenceType) {
        return switch (referenceType) {
            case "INVOICE" -> "invoice_id";
            case "ORDER" -> "order_id";
            case "PURCHASE" -> "purchase_id";
            default -> throw new IllegalArgumentException("No serial link for " + referenceType);
        };
    }

    private static int wholeUnits(Product product, BigDecimal quantity) {
        if (quantity.stripTrailingZeros().scale() > 0) {
            throw BusinessException.validation("quantity", product.getName() + " has serial numbers; enter a whole number");
        }
        return quantity.intValueExact();
    }

    private static List<String> normalise(List<String> raw, int count, Product product) {
        Set<String> unique = new LinkedHashSet<>();
        for (String s : raw) {
            if (s != null && !s.isBlank()) {
                String v = s.trim().toUpperCase(Locale.ROOT);
                if (v.length() > 80) {
                    throw BusinessException.validation("serialNumbers", "Serial numbers can be at most 80 characters");
                }
                if (!unique.add(v)) {
                    throw BusinessException.validation("serialNumbers", "Serial " + v + " is entered twice");
                }
            }
        }
        if (unique.size() != count) {
            throw BusinessException.validation("serialNumbers", "Enter exactly " + count + " serial number(s) for " + product.getName()
                    + " (got " + unique.size() + ")");
        }
        return new ArrayList<>(unique);
    }

    private static String plain(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString();
    }
}
