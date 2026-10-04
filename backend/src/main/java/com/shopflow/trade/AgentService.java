package com.shopflow.trade;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerService;
import com.shopflow.trade.TradeDtos.AgentRequest;
import com.shopflow.trade.TradeDtos.AgentResponse;
import com.shopflow.trade.TradeDtos.CommissionReport;
import com.shopflow.trade.TradeDtos.CommissionRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Agents / brokers and their commission (§0B.9, COMMISSION module). A customer can be linked to one agent; when an
 * invoice for that customer is generated, the agent's percentage of the taxable value is fixed on the invoice.
 * Commission is due once the invoice is generated and is marked paid here.
 */
@Service
public class AgentService {

    private static final String SELECT = """
            SELECT a.id, a.name, a.mobile_number, a.commission_percent, a.active,
                   (SELECT COUNT(*) FROM customers c WHERE c.agent_id = a.id) AS customer_count,
                   COALESCE((SELECT SUM(i.commission_amount) FROM invoices i WHERE i.agent_id = a.id AND i.status <> 'CANCELLED'
                             AND i.commission_paid_at IS NULL), 0) AS pending,
                   COALESCE((SELECT SUM(i.commission_amount) FROM invoices i WHERE i.agent_id = a.id AND i.status <> 'CANCELLED'
                             AND i.commission_paid_at IS NOT NULL), 0) AS paid
            FROM agents a
            """;

    private final JdbcTemplate jdbc;
    private final CustomerService customers;
    private final AuditService audit;

    public AgentService(JdbcTemplate jdbc, CustomerService customers, AuditService audit) {
        this.jdbc = jdbc;
        this.customers = customers;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<AgentResponse> list() {
        return jdbc.queryForList(SELECT + " ORDER BY a.active DESC, a.name").stream().map(AgentService::map).toList();
    }

    @Transactional(readOnly = true)
    public AgentResponse get(UUID id) {
        return jdbc.queryForList(SELECT + " WHERE a.id = ?", id).stream().findFirst().map(AgentService::map)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Agent"));
    }

    @Transactional
    public AgentResponse create(AgentRequest r) {
        UUID id = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("INSERT INTO agents (id, name, mobile_number, commission_percent, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                id, r.name().trim(), MobileNumbers.normalizeOptional(r.mobileNumber()), r.commissionPercent(),
                r.active() == null || r.active(), now, now);
        audit.record(AuditAction.AGENT_SAVED, "AGENT", id, null, Map.of("name", r.name().trim(), "commissionPercent", r.commissionPercent()));
        return get(id);
    }

    /** A new percentage applies to invoices generated from now on; earlier invoices keep theirs. */
    @Transactional
    public AgentResponse update(UUID id, AgentRequest r) {
        AgentResponse before = get(id);
        jdbc.update("UPDATE agents SET name = ?, mobile_number = ?, commission_percent = ?, active = ?, updated_at = now(), version = version + 1 WHERE id = ?",
                r.name().trim(), MobileNumbers.normalizeOptional(r.mobileNumber()), r.commissionPercent(),
                r.active() == null ? before.active() : r.active(), id);
        audit.record(AuditAction.AGENT_SAVED, "AGENT", id, Map.of("commissionPercent", before.commissionPercent(), "active", before.active()),
                Map.of("commissionPercent", r.commissionPercent(), "active", r.active() == null ? before.active() : r.active()));
        return get(id);
    }

    /** Links a customer to an agent (or removes the link with a null agent). */
    @Transactional
    public void assign(UUID customerId, UUID agentId) {
        Customer customer = customers.get(customerId);
        if (agentId != null && !get(agentId).active()) {
            throw BusinessException.validation("agentId", "The agent is inactive");
        }
        UUID before = customer.getAgentId();
        customer.setAgentId(agentId);
        Map<String, Object> oldValue = new HashMap<>();
        oldValue.put("agentId", before);
        Map<String, Object> newValue = new HashMap<>();
        newValue.put("agentId", agentId);
        audit.record(AuditAction.CUSTOMER_AGENT_CHANGED, "CUSTOMER", customerId, oldValue, newValue);
    }

    @Transactional(readOnly = true)
    public CommissionReport report(UUID agentId, LocalDate from, LocalDate to, String status) {
        StringBuilder sql = new StringBuilder("""
                SELECT i.id, i.invoice_number, i.invoice_date, i.status, i.customer_id, i.buyer_name, i.agent_id, a.name AS agent_name,
                       i.taxable_total, i.commission_percent, i.commission_amount, i.commission_paid_at
                FROM invoices i JOIN agents a ON a.id = i.agent_id
                WHERE i.status NOT IN ('DRAFT','CANCELLED') AND i.commission_amount IS NOT NULL
                """);
        List<Object> args = new ArrayList<>();
        if (agentId != null) {
            sql.append(" AND i.agent_id = ?");
            args.add(agentId);
        }
        if (from != null) {
            sql.append(" AND i.invoice_date >= ?");
            args.add(TradeSupport.date(from));
        }
        if (to != null) {
            sql.append(" AND i.invoice_date <= ?");
            args.add(TradeSupport.date(to));
        }
        if ("PENDING".equalsIgnoreCase(status)) {
            sql.append(" AND i.commission_paid_at IS NULL");
        } else if ("PAID".equalsIgnoreCase(status)) {
            sql.append(" AND i.commission_paid_at IS NOT NULL");
        }
        sql.append(" ORDER BY i.invoice_date DESC, i.invoice_number DESC LIMIT 1000");
        List<CommissionRow> rows = jdbc.queryForList(sql.toString(), args.toArray()).stream().map(r -> new CommissionRow(
                (UUID) r.get("id"), (String) r.get("invoice_number"), TradeSupport.localDate(r.get("invoice_date")),
                (String) r.get("status"), (UUID) r.get("customer_id"), (String) r.get("buyer_name"), (UUID) r.get("agent_id"),
                (String) r.get("agent_name"), (BigDecimal) r.get("taxable_total"), (BigDecimal) r.get("commission_percent"),
                (BigDecimal) r.get("commission_amount"), TradeSupport.instant(r.get("commission_paid_at")))).toList();
        BigDecimal pending = rows.stream().filter(r -> r.paidAt() == null).map(CommissionRow::commissionAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal paid = rows.stream().filter(r -> r.paidAt() != null).map(CommissionRow::commissionAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CommissionReport(rows, pending, paid);
    }

    /** Marks the commission on these invoices as paid to the agent. Returns how many were marked. */
    @Transactional
    public int pay(List<UUID> invoiceIds) {
        int marked = 0;
        for (UUID id : invoiceIds) {
            marked += jdbc.update("""
                    UPDATE invoices SET commission_paid_at = ?, updated_at = now(), version = version + 1
                    WHERE id = ? AND agent_id IS NOT NULL AND commission_paid_at IS NULL AND status NOT IN ('DRAFT','CANCELLED')
                    """, Timestamp.from(Instant.now()), id);
        }
        if (marked == 0) {
            throw new BusinessException(ErrorCode.CONFLICT, "No unpaid commission on the chosen invoices");
        }
        audit.record(AuditAction.COMMISSION_PAID, "INVOICE", null, null, Map.of("invoices", invoiceIds.size(), "marked", marked));
        return marked;
    }

    private static AgentResponse map(Map<String, Object> r) {
        return new AgentResponse((UUID) r.get("id"), (String) r.get("name"), (String) r.get("mobile_number"),
                (BigDecimal) r.get("commission_percent"), (Boolean) r.get("active"), ((Number) r.get("customer_count")).intValue(),
                (BigDecimal) r.get("pending"), (BigDecimal) r.get("paid"));
    }
}
