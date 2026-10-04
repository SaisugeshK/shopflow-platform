package com.shopflow.branches;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.inventory.InventoryService;
import com.shopflow.inventory.StockMovement.MovementType;
import com.shopflow.inventory.StockTrace;
import com.shopflow.products.Product;
import com.shopflow.products.ProductService;
import com.shopflow.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
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
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Branches / warehouses (§0B.14, BRANCHES module): the list (the default "main" branch is created on first use), stock
 * per branch, and transfers between branches. Serial-tracked products are not transferred (serials have no branch).
 */
@Service
public class BranchService {

    public record BranchRequest(@NotBlank @Size(max = 20) @Pattern(regexp = "^[A-Za-z0-9-]+$", message = "Letters, digits and hyphens") String code,
                                @NotBlank @Size(max = 200) String name,
                                @Pattern(regexp = "BRANCH|WAREHOUSE") String kind,
                                @Size(max = 300) String addressLine1,
                                @Size(max = 100) String city,
                                @Size(max = 100) String state,
                                @Pattern(regexp = "^$|^[0-9]{2}$") String stateCode,
                                @Size(max = 20) String phone,
                                Boolean active) {
    }

    public record BranchResponse(UUID id, String code, String name, String kind, String addressLine1, String city, String state,
                                 String stateCode, String phone, boolean isDefault, boolean active, long productsInStock) {
    }

    public record BranchStockRow(UUID productId, String productName, String sku, String unit, BigDecimal onHand, BigDecimal totalOnHand) {
    }

    public record TransferLine(@NotNull UUID productId, @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity) {
    }

    public record TransferRequest(@NotNull UUID fromBranchId, @NotNull UUID toBranchId, LocalDate transferDate,
                                  @Size(max = 1000) String notes, @NotEmpty @Size(max = 200) List<@Valid TransferLine> items) {
    }

    public record TransferItemResponse(UUID productId, String productName, String unit, BigDecimal quantity, String batchDetails) {
    }

    public record TransferResponse(UUID id, String transferNumber, UUID fromBranchId, String fromBranchName, UUID toBranchId,
                                   String toBranchName, LocalDate transferDate, String notes, Instant createdAt,
                                   List<TransferItemResponse> items) {
    }

    private final JdbcTemplate jdbc;
    private final InventoryService inventory;
    private final ProductService products;
    private final DocumentSequenceService sequences;
    private final BusinessContext businessContext;
    private final AuditService audit;

    public BranchService(JdbcTemplate jdbc, InventoryService inventory, ProductService products, DocumentSequenceService sequences,
                         BusinessContext businessContext, AuditService audit) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.products = products;
        this.sequences = sequences;
        this.businessContext = businessContext;
        this.audit = audit;
    }

    @Transactional
    public List<BranchResponse> list() {
        ensureDefault();
        return jdbc.queryForList("""
                SELECT b.*, CASE WHEN b.is_default THEN (SELECT count(*) FROM stock_balances sb WHERE sb.on_hand >
                         COALESCE((SELECT SUM(x.on_hand) FROM branch_stock x WHERE x.product_id = sb.product_id), 0))
                       ELSE (SELECT count(*) FROM branch_stock s WHERE s.branch_id = b.id AND s.on_hand > 0) END AS in_stock
                FROM branches b ORDER BY b.is_default DESC, b.active DESC, b.name
                """).stream().map(BranchService::map).toList();
    }

    @Transactional
    public BranchResponse create(BranchRequest r) {
        ensureDefault();
        UUID id = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now());
        String code = r.code().trim().toUpperCase(Locale.ROOT);
        if (exists(code, null)) {
            throw BusinessException.validation("code", "Another branch already uses this code");
        }
        jdbc.update("""
                INSERT INTO branches (id, code, name, kind, address_line1, city, state, state_code, phone, is_default, active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, TRUE, ?, ?)
                """, id, code, r.name().trim(), r.kind() == null ? "BRANCH" : r.kind(), Validation.trim(r.addressLine1()), Validation.trim(r.city()),
                Validation.trim(r.state()), blank(r.stateCode()), Validation.trim(r.phone()), now, now);
        audit.record(AuditAction.BRANCH_SAVED, "BRANCH", id, null, Map.of("code", code, "name", r.name().trim()));
        return get(id);
    }

    @Transactional
    public BranchResponse update(UUID id, BranchRequest r) {
        BranchResponse before = get(id);
        String code = r.code().trim().toUpperCase(Locale.ROOT);
        if (exists(code, id)) {
            throw BusinessException.validation("code", "Another branch already uses this code");
        }
        boolean active = r.active() == null ? before.active() : r.active();
        if (!active && before.isDefault()) {
            throw BusinessException.validation("active", "The main branch cannot be closed");
        }
        if (!active && before.active()) {
            BigDecimal held = jdbc.queryForObject("SELECT COALESCE(SUM(on_hand), 0) FROM branch_stock WHERE branch_id = ?", BigDecimal.class, id);
            if (held.signum() > 0) {
                throw new BusinessException(ErrorCode.CONFLICT, "Move this branch's stock to another branch before closing it");
            }
        }
        jdbc.update("""
                UPDATE branches SET code = ?, name = ?, kind = ?, address_line1 = ?, city = ?, state = ?, state_code = ?, phone = ?, active = ?,
                       updated_at = now(), version = version + 1 WHERE id = ?
                """, code, r.name().trim(), r.kind() == null ? before.kind() : r.kind(), Validation.trim(r.addressLine1()), Validation.trim(r.city()),
                Validation.trim(r.state()), blank(r.stateCode()), Validation.trim(r.phone()), active, id);
        audit.record(AuditAction.BRANCH_SAVED, "BRANCH", id, Map.of("name", before.name(), "active", before.active()),
                Map.of("name", r.name().trim(), "active", active));
        return get(id);
    }

    @Transactional(readOnly = true)
    public BranchResponse get(UUID id) {
        return jdbc.queryForList("SELECT b.*, 0 AS in_stock FROM branches b WHERE b.id = ?", id).stream().findFirst().map(BranchService::map)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Branch"));
    }

    /** Products with stock at the branch (the main branch holds what no other branch holds). */
    @Transactional(readOnly = true)
    public List<BranchStockRow> stock(UUID id, String q) {
        BranchResponse b = get(id);
        String search = q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
        String atBranch = b.isDefault()
                ? "sb.on_hand - COALESCE((SELECT SUM(x.on_hand) FROM branch_stock x WHERE x.product_id = p.id), 0)"
                : "COALESCE((SELECT x.on_hand FROM branch_stock x WHERE x.product_id = p.id AND x.branch_id = ?), 0)";
        String sql = "SELECT p.id, p.name, p.sku, p.unit, sb.on_hand AS total, " + atBranch + " AS here FROM products p JOIN stock_balances sb ON sb.product_id = p.id"
                + " WHERE p.active" + (search == null ? "" : " AND (lower(p.name) LIKE ? OR lower(p.sku) LIKE ?)") + " ORDER BY p.name LIMIT 500";
        List<Object> args = new ArrayList<>();
        if (!b.isDefault()) {
            args.add(id);
        }
        if (search != null) {
            args.add(search);
            args.add(search);
        }
        return jdbc.queryForList(sql, args.toArray()).stream()
                .filter(r -> ((BigDecimal) r.get("here")).signum() > 0 || search != null)
                .map(r -> new BranchStockRow((UUID) r.get("id"), (String) r.get("name"), (String) r.get("sku"), (String) r.get("unit"),
                        (BigDecimal) r.get("here"), (BigDecimal) r.get("total"))).toList();
    }

    @Transactional
    public TransferResponse transfer(TransferRequest r) {
        BranchResponse from = get(r.fromBranchId());
        BranchResponse to = get(r.toBranchId());
        if (from.id().equals(to.id())) {
            throw BusinessException.validation("toBranchId", "Choose two different branches");
        }
        if (!from.active() || !to.active()) {
            throw BusinessException.validation("toBranchId", "Both branches must be active");
        }
        LocalDate date = r.transferDate() != null ? r.transferDate() : businessContext.today();
        UUID id = UUID.randomUUID();
        String number = sequences.next(DocumentType.STOCK_TRANSFER, date);
        jdbc.update("""
                INSERT INTO stock_transfers (id, transfer_number, from_branch_id, to_branch_id, transfer_date, notes, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, id, number, from.id(), to.id(), java.sql.Date.valueOf(date), Validation.trim(r.notes()), CurrentUser.id(), Timestamp.from(Instant.now()));
        List<TransferLine> lines = new ArrayList<>(r.items());
        lines.sort(Comparator.comparing(TransferLine::productId));
        for (TransferLine l : lines) {
            Product p = products.get(l.productId());
            if (p.isTrackSerials()) {
                throw BusinessException.validation("items", p.getName() + " tracks serial numbers and cannot be transferred between branches");
            }
            BigDecimal qty = Money.qty(l.quantity());
            BigDecimal cost = Money.of(p.getPurchasePrice());
            InventoryService.TracedMovement out = BranchContext.callAt(from.id(), () -> inventory.postTraced(p.getId(), MovementType.TRANSFER_OUT, qty,
                    cost, "STOCK_TRANSFER", id, number, "To " + to.name(), null, null));
            BranchContext.callAt(to.id(), () -> inventory.postTraced(p.getId(), MovementType.TRANSFER_IN, qty, cost, "STOCK_TRANSFER", id, number,
                    "From " + from.name(), null, p.isTrackBatches() ? StockTrace.reversing("STOCK_TRANSFER", id) : null));
            jdbc.update("""
                    INSERT INTO stock_transfer_items (id, transfer_id, product_id, product_name, unit, quantity, batch_details)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, UUID.randomUUID(), id, p.getId(), p.getName(), p.getUnit().name(), qty, out.trace().batchDetails());
        }
        audit.record(AuditAction.STOCK_TRANSFERRED, "STOCK_TRANSFER", id, null, Map.of("number", number, "from", from.code(), "to", to.code(), "lines", lines.size()));
        return transfer(id);
    }

    @Transactional(readOnly = true)
    public List<TransferResponse> transfers() {
        return jdbc.queryForList(TRANSFER_SQL + " ORDER BY t.created_at DESC LIMIT 200").stream().map(r -> mapTransfer(r, null)).toList();
    }

    @Transactional(readOnly = true)
    public TransferResponse transfer(UUID id) {
        Map<String, Object> row = jdbc.queryForList(TRANSFER_SQL + " WHERE t.id = ?", id).stream().findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Stock transfer"));
        List<TransferItemResponse> items = jdbc.queryForList("SELECT * FROM stock_transfer_items WHERE transfer_id = ? ORDER BY product_name", id).stream()
                .map(r -> new TransferItemResponse((UUID) r.get("product_id"), (String) r.get("product_name"), (String) r.get("unit"),
                        (BigDecimal) r.get("quantity"), (String) r.get("batch_details"))).toList();
        return mapTransfer(row, items);
    }

    private static final String TRANSFER_SQL = """
            SELECT t.*, f.name AS from_name, d.name AS to_name FROM stock_transfers t
            JOIN branches f ON f.id = t.from_branch_id JOIN branches d ON d.id = t.to_branch_id
            """;

    /** The default (main) branch exists from the first time branches are used. */
    private void ensureDefault() {
        Long n = jdbc.queryForObject("SELECT count(*) FROM branches WHERE is_default", Long.class);
        if (n != null && n > 0) {
            return;
        }
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO branches (id, business_id, code, name, kind, city, state, state_code, is_default, active, created_at, updated_at)
                SELECT ?, b.id, 'MAIN', 'Main branch', 'BRANCH', b.city, b.state, b.state_code, TRUE, TRUE, ?, ? FROM businesses b WHERE b.id = ?
                ON CONFLICT DO NOTHING
                """, UUID.randomUUID(), now, now, com.shopflow.tenancy.TenantContext.requireTenantId());
    }

    private boolean exists(String code, UUID except) {
        Long n = except == null
                ? jdbc.queryForObject("SELECT count(*) FROM branches WHERE code = ?", Long.class, code)
                : jdbc.queryForObject("SELECT count(*) FROM branches WHERE code = ? AND id <> ?", Long.class, code, except);
        return n != null && n > 0;
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static BranchResponse map(Map<String, Object> r) {
        return new BranchResponse((UUID) r.get("id"), (String) r.get("code"), (String) r.get("name"), (String) r.get("kind"),
                (String) r.get("address_line1"), (String) r.get("city"), (String) r.get("state"), (String) r.get("state_code"),
                (String) r.get("phone"), (Boolean) r.get("is_default"), (Boolean) r.get("active"), ((Number) r.get("in_stock")).longValue());
    }

    private static TransferResponse mapTransfer(Map<String, Object> r, List<TransferItemResponse> items) {
        return new TransferResponse((UUID) r.get("id"), (String) r.get("transfer_number"), (UUID) r.get("from_branch_id"),
                (String) r.get("from_name"), (UUID) r.get("to_branch_id"), (String) r.get("to_name"),
                ((java.sql.Date) r.get("transfer_date")).toLocalDate(), (String) r.get("notes"),
                ((Timestamp) r.get("created_at")).toInstant(), items);
    }
}
