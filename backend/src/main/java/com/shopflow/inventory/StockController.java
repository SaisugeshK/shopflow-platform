package com.shopflow.inventory;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.inventory.StockMovement.MovementType;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/stock")
@Tag(name = "Stock", description = "Stock balances, movements, adjustments and low-stock")
@SecurityRequirement(name = "bearerAuth")
public class StockController {

    private final InventoryService inventory;
    private final NamedParameterJdbcTemplate jdbc;
    private final com.shopflow.business.BusinessContext businessContext;

    public StockController(InventoryService inventory, NamedParameterJdbcTemplate jdbc,
                           com.shopflow.business.BusinessContext businessContext) {
        this.inventory = inventory;
        this.jdbc = jdbc;
        this.businessContext = businessContext;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "List stock", description = "status: IN_STOCK, LOW_STOCK or OUT_OF_STOCK. Available = on hand - reserved for open orders.")
    public ApiResponse<List<StockRow>> list(@RequestParam(required = false) String q,
                                            @RequestParam(required = false) UUID categoryId,
                                            @RequestParam(required = false) StockStatus status,
                                            @RequestParam(required = false) Integer page,
                                            @RequestParam(required = false) Integer pageSize) {
        return ApiResponse.page(query(q, categoryId, status, PageQuery.of(page, pageSize)));
    }

    @GetMapping("/low-stock")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "Products at or below their minimum stock (including out of stock)")
    public ApiResponse<List<StockRow>> lowStock(@RequestParam(required = false) Integer page,
                                                @RequestParam(required = false) Integer pageSize) {
        return ApiResponse.page(query(null, null, StockStatus.LOW_STOCK, PageQuery.of(page, pageSize)));
    }

    @GetMapping("/{productId}")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "Stock for one product")
    public ApiResponse<StockRow> get(@PathVariable UUID productId) {
        List<StockRow> rows = rows("AND p.id = :productId", new MapSqlParameterSource("productId", productId), null);
        if (rows.isEmpty()) {
            throw BusinessException.notFound(ErrorCode.PRODUCT_NOT_FOUND, "Product");
        }
        return ApiResponse.ok(rows.getFirst());
    }

    @GetMapping("/movements")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "Stock movement history", description = "Filter by product, movement type and date range (business timezone), newest first.")
    public ApiResponse<List<MovementRow>> movements(@RequestParam(required = false) UUID productId,
                                                    @RequestParam(required = false) MovementType type,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                    @RequestParam(required = false) Integer page,
                                                    @RequestParam(required = false) Integer pageSize) {
        Pageable pageable = PageQuery.of(page, pageSize);
        StringBuilder where = new StringBuilder(" WHERE p.business_id = :businessId");
        MapSqlParameterSource params = new MapSqlParameterSource("businessId", businessContext.businessId());
        if (productId != null) {
            where.append(" AND m.product_id = :productId");
            params.addValue("productId", productId);
        }
        if (type != null) {
            where.append(" AND m.movement_type = :type");
            params.addValue("type", type.name());
        }
        ZoneId zone = businessContext.zone();
        if (from != null) {
            where.append(" AND m.created_at >= :from");
            params.addValue("from", Timestamp.from(from.atStartOfDay(zone).toInstant()));
        }
        if (to != null) {
            where.append(" AND m.created_at < :to");
            params.addValue("to", Timestamp.from(to.plusDays(1).atStartOfDay(zone).toInstant()));
        }
        String base = " FROM stock_movements m JOIN products p ON p.id = m.product_id" + where;
        Long total = jdbc.queryForObject("SELECT count(*)" + base, params, Long.class);
        params.addValue("limit", pageable.getPageSize()).addValue("offset", pageable.getOffset());
        List<MovementRow> rows = jdbc.query("""
                SELECT m.id, m.product_id, p.sku, p.name, m.movement_type, m.direction, m.quantity, m.balance_after,
                       m.reference_type, m.reference_id, m.reference_number, m.reason, m.created_at
                """ + base + " ORDER BY m.created_at DESC, m.id DESC LIMIT :limit OFFSET :offset", params,
                (rs, i) -> new MovementRow(rs.getObject("id", UUID.class), rs.getObject("product_id", UUID.class),
                        rs.getString("sku"), rs.getString("name"), rs.getString("movement_type"), rs.getString("direction"),
                        rs.getBigDecimal("quantity"), rs.getBigDecimal("balance_after"), rs.getString("reference_type"),
                        rs.getObject("reference_id", UUID.class), rs.getString("reference_number"), rs.getString("reason"),
                        rs.getTimestamp("created_at").toInstant()));
        return ApiResponse.page(new PageImpl<>(rows, pageable, total == null ? 0 : total));
    }

    @PostMapping("/adjustments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('STOCK_WRITE')")
    @Operation(summary = "Adjust stock", description = "Records ADJUSTMENT_IN, ADJUSTMENT_OUT, DAMAGE_OUT or LOSS_OUT with a mandatory reason. Errors: INSUFFICIENT_STOCK.")
    public ApiResponse<AdjustmentResponse> adjust(@Valid @RequestBody AdjustmentRequest request) {
        StockAdjustment a = inventory.adjust(request.productId(), request.type(), request.quantity(), request.reason());
        StockBalance b = inventory.balance(a.getProductId());
        return ApiResponse.ok(new AdjustmentResponse(a.getId(), a.getAdjustmentNumber(), a.getProductId(),
                a.getAdjustmentType().name(), a.getQuantity(), b.getOnHand(), a.getReason(), a.getCreatedAt()), "Stock adjusted");
    }

    private Page<StockRow> query(String q, UUID categoryId, StockStatus status, Pageable pageable) {
        StringBuilder filter = new StringBuilder();
        MapSqlParameterSource params = new MapSqlParameterSource();
        if (q != null && !q.isBlank()) {
            filter.append(" AND (lower(p.name) LIKE :q OR lower(p.sku) LIKE :q)");
            params.addValue("q", "%" + q.trim().toLowerCase() + "%");
        }
        if (categoryId != null) {
            filter.append(" AND p.category_id = :categoryId");
            params.addValue("categoryId", categoryId);
        }
        if (status != null) {
            filter.append(switch (status) {
                case OUT_OF_STOCK -> " AND (b.on_hand - b.reserved) <= 0";
                case LOW_STOCK -> " AND (b.on_hand - b.reserved) <= p.minimum_stock";
                case IN_STOCK -> " AND (b.on_hand - b.reserved) > p.minimum_stock";
            });
        }
        params.addValue("businessId", businessContext.businessId());
        Long total = jdbc.queryForObject("SELECT count(*) FROM products p JOIN stock_balances b ON b.product_id = p.id WHERE p.business_id = :businessId" + filter, params, Long.class);
        return new PageImpl<>(rows(filter.toString(), params, pageable), pageable, total == null ? 0 : total);
    }

    private List<StockRow> rows(String filter, MapSqlParameterSource params, Pageable pageable) {
        params.addValue("businessId", businessContext.businessId());
        String paging = "";
        if (pageable != null) {
            paging = " LIMIT :limit OFFSET :offset";
            params.addValue("limit", pageable.getPageSize()).addValue("offset", pageable.getOffset());
        }
        return jdbc.query("""
                SELECT p.id, p.sku, p.name, p.unit, p.active, p.minimum_stock, p.purchase_price, c.name AS category,
                       b.on_hand, b.reserved, b.updated_at
                FROM products p JOIN stock_balances b ON b.product_id = p.id JOIN categories c ON c.id = p.category_id
                WHERE p.business_id = :businessId
                """ + filter + " ORDER BY p.name" + paging, params, (rs, i) -> {
            BigDecimal onHand = rs.getBigDecimal("on_hand");
            BigDecimal reserved = rs.getBigDecimal("reserved");
            BigDecimal available = onHand.subtract(reserved);
            BigDecimal min = rs.getBigDecimal("minimum_stock");
            StockStatus st = available.signum() <= 0 ? StockStatus.OUT_OF_STOCK
                    : available.compareTo(min) <= 0 ? StockStatus.LOW_STOCK : StockStatus.IN_STOCK;
            return new StockRow(rs.getObject("id", UUID.class), rs.getString("sku"), rs.getString("name"),
                    rs.getString("category"), rs.getString("unit"), rs.getBoolean("active"), onHand, reserved,
                    available, min, onHand.multiply(rs.getBigDecimal("purchase_price")).setScale(2, java.math.RoundingMode.HALF_UP),
                    st.name(), rs.getTimestamp("updated_at").toInstant());
        });
    }

    public enum StockStatus { IN_STOCK, LOW_STOCK, OUT_OF_STOCK }

    public record StockRow(UUID productId, String sku, String productName, String category, String unit, boolean active,
                           BigDecimal onHand, BigDecimal reserved, BigDecimal available, BigDecimal minimumStock,
                           BigDecimal stockValue, String status, Instant updatedAt) {
    }

    public record MovementRow(UUID id, UUID productId, String sku, String productName, String movementType,
                              String direction, BigDecimal quantity, BigDecimal balanceAfter, String referenceType,
                              UUID referenceId, String referenceNumber, String reason, Instant createdAt) {
    }

    public record AdjustmentRequest(@NotNull UUID productId, @NotNull MovementType type,
                                    @NotNull @DecimalMin(value = "0.001") BigDecimal quantity,
                                    @NotBlank @Size(max = 300) String reason) {
    }

    public record AdjustmentResponse(UUID id, String adjustmentNumber, UUID productId, String type, BigDecimal quantity,
                                     BigDecimal onHandAfter, String reason, Instant createdAt) {
    }
}
