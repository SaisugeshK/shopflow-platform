package com.shopflow.trade;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Validation;
import com.shopflow.customers.CustomerService;
import com.shopflow.security.CurrentUser;
import com.shopflow.trade.TradeDtos.ProjectRequest;
import com.shopflow.trade.TradeDtos.ProjectResponse;
import com.shopflow.trade.TradeDtos.ProjectStatement;
import com.shopflow.trade.TradeDtos.StatementLine;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Project / site accounts of contractor customers (§0B.9, PROJECT_ACCOUNTS module). Orders, quotations, challans and
 * invoices can name a project; the project statement lists them with what is billed and still due.
 */
@Service
public class ProjectService {

    private static final String SELECT = """
            SELECT p.id, p.customer_id, c.shop_name AS customer_name, p.name, p.site_address, p.budget, p.status, p.created_at,
                   COALESCE(SUM(i.grand_total) FILTER (WHERE i.status NOT IN ('DRAFT','CANCELLED')), 0) AS billed,
                   COALESCE(SUM(i.paid_amount + i.credited_amount) FILTER (WHERE i.status NOT IN ('DRAFT','CANCELLED')), 0) AS received,
                   COUNT(i.id) FILTER (WHERE i.status NOT IN ('DRAFT','CANCELLED')) AS invoice_count
            FROM projects p
            JOIN customers c ON c.id = p.customer_id
            LEFT JOIN invoices i ON i.project_id = p.id
            """;
    private static final String GROUP = " GROUP BY p.id, c.shop_name";

    private final JdbcTemplate jdbc;
    private final CustomerService customers;
    private final AuditService audit;

    public ProjectService(JdbcTemplate jdbc, CustomerService customers, AuditService audit) {
        this.jdbc = jdbc;
        this.customers = customers;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<ProjectResponse> list(UUID customerId, String status) {
        StringBuilder sql = new StringBuilder(SELECT).append(" WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (customerId != null) {
            sql.append(" AND p.customer_id = ?");
            args.add(customerId);
        }
        if (status != null && !status.isBlank()) {
            sql.append(" AND p.status = ?");
            args.add(status.trim().toUpperCase());
        }
        sql.append(GROUP).append(" ORDER BY p.status, p.name LIMIT 500");
        return jdbc.queryForList(sql.toString(), args.toArray()).stream().map(ProjectService::map).toList();
    }

    @Transactional(readOnly = true)
    public ProjectResponse get(UUID id) {
        return jdbc.queryForList(SELECT + " WHERE p.id = ?" + GROUP, id).stream().findFirst().map(ProjectService::map)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Project"));
    }

    @Transactional
    public ProjectResponse create(ProjectRequest r) {
        customers.get(r.customerId());
        UUID id = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO projects (id, customer_id, name, site_address, budget, status, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, r.customerId(), r.name().trim(), Validation.trim(r.siteAddress()), r.budget(),
                r.status() == null ? "ACTIVE" : r.status(), CurrentUser.idIfPresent().orElse(null), now, now);
        audit.record(AuditAction.PROJECT_SAVED, "PROJECT", id, null, Map.of("name", r.name().trim(), "customerId", r.customerId()));
        return get(id);
    }

    @Transactional
    public ProjectResponse update(UUID id, ProjectRequest r) {
        ProjectResponse before = get(id);
        if (!before.customerId().equals(r.customerId())) {
            throw BusinessException.validation("customerId", "A project cannot move to another customer");
        }
        jdbc.update("UPDATE projects SET name = ?, site_address = ?, budget = ?, status = ?, updated_at = now(), version = version + 1 WHERE id = ?",
                r.name().trim(), Validation.trim(r.siteAddress()), r.budget(), r.status() == null ? before.status() : r.status(), id);
        audit.record(AuditAction.PROJECT_SAVED, "PROJECT", id, Map.of("name", before.name(), "status", before.status()),
                Map.of("name", r.name().trim(), "status", r.status() == null ? before.status() : r.status()));
        return get(id);
    }

    /** Everything recorded against the project, newest first. */
    @Transactional(readOnly = true)
    public ProjectStatement statement(UUID id) {
        ProjectResponse project = get(id);
        List<StatementLine> lines = new ArrayList<>();
        jdbc.queryForList("""
                SELECT id, invoice_number, invoice_date, status, grand_total, grand_total - paid_amount - credited_amount AS due
                FROM invoices WHERE project_id = ? AND status <> 'DRAFT'
                """, id).forEach(r -> lines.add(new StatementLine("INVOICE", (UUID) r.get("id"), (String) r.get("invoice_number"),
                TradeSupport.localDate(r.get("invoice_date")), (String) r.get("status"), (BigDecimal) r.get("grand_total"),
                "CANCELLED".equals(r.get("status")) ? BigDecimal.ZERO : ((BigDecimal) r.get("due")).max(BigDecimal.ZERO))));
        jdbc.queryForList("SELECT id, order_number, created_at, status, grand_total FROM orders WHERE project_id = ?", id)
                .forEach(r -> lines.add(new StatementLine("ORDER", (UUID) r.get("id"), (String) r.get("order_number"),
                        TradeSupport.instant(r.get("created_at")).atZone(java.time.ZoneId.of("Asia/Kolkata")).toLocalDate(),
                        (String) r.get("status"), (BigDecimal) r.get("grand_total"), null)));
        jdbc.queryForList("SELECT id, challan_number, challan_date, status, total_value FROM delivery_challans WHERE project_id = ?", id)
                .forEach(r -> lines.add(new StatementLine("CHALLAN", (UUID) r.get("id"), (String) r.get("challan_number"),
                        TradeSupport.localDate(r.get("challan_date")), (String) r.get("status"), (BigDecimal) r.get("total_value"), null)));
        jdbc.queryForList("SELECT id, quotation_number, quote_date, status, grand_total FROM quotations WHERE project_id = ?", id)
                .forEach(r -> lines.add(new StatementLine("QUOTATION", (UUID) r.get("id"), (String) r.get("quotation_number"),
                        TradeSupport.localDate(r.get("quote_date")), (String) r.get("status"), (BigDecimal) r.get("grand_total"), null)));
        lines.sort(Comparator.comparing(StatementLine::date, Comparator.nullsLast(Comparator.reverseOrder())));
        return new ProjectStatement(project, lines);
    }

    /** The signed-in customer's own projects. */
    @Transactional(readOnly = true)
    public List<ProjectResponse> mine() {
        return list(TradeSupport.currentCustomer(), null);
    }

    @Transactional(readOnly = true)
    public ProjectStatement myStatement(UUID id) {
        if (!get(id).customerId().equals(TradeSupport.currentCustomer())) {
            throw BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Project");
        }
        ProjectStatement s = statement(id);
        // Customers do not see draft-like internal documents.
        return new ProjectStatement(s.project(), s.lines().stream().filter(l -> !"QUOTATION".equals(l.type()) || !"DRAFT".equals(l.status())).toList());
    }

    private static ProjectResponse map(Map<String, Object> r) {
        BigDecimal billed = (BigDecimal) r.get("billed");
        BigDecimal received = (BigDecimal) r.get("received");
        return new ProjectResponse((UUID) r.get("id"), (UUID) r.get("customer_id"), (String) r.get("customer_name"),
                (String) r.get("name"), (String) r.get("site_address"), (BigDecimal) r.get("budget"), (String) r.get("status"),
                billed, received, billed.subtract(received).max(BigDecimal.ZERO), ((Number) r.get("invoice_count")).intValue(),
                TradeSupport.instant(r.get("created_at")));
    }
}
