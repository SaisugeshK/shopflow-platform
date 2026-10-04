package com.shopflow.trade;

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
import com.shopflow.products.Product;
import com.shopflow.products.ProductService;
import com.shopflow.security.CurrentUser;
import com.shopflow.trade.TradeDtos.CreateJobWorkRequest;
import com.shopflow.trade.TradeDtos.JobWorkLineRequest;
import com.shopflow.trade.TradeDtos.JobWorkLineResponse;
import com.shopflow.trade.TradeDtos.JobWorkResponse;
import com.shopflow.trade.TradeDtos.ReceiveJobWorkRequest;
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

/**
 * Job work (§0B.9, JOB_WORK module): material is issued to a job worker (JOB_WORK_OUT) and comes back as finished goods
 * or unused material (JOB_WORK_IN); material used up in the process closes the issue line without a stock change.
 * Quantities are in the product's base unit. Batch- and serial-tracked products are not sent for job work.
 */
@Service
public class JobWorkService {

    private final JdbcTemplate jdbc;
    private final ProductService products;
    private final InventoryService inventory;
    private final DocumentSequenceService sequences;
    private final BusinessContext businessContext;
    private final AuditService audit;

    public JobWorkService(JdbcTemplate jdbc, ProductService products, InventoryService inventory, DocumentSequenceService sequences,
                          BusinessContext businessContext, AuditService audit) {
        this.jdbc = jdbc;
        this.products = products;
        this.inventory = inventory;
        this.sequences = sequences;
        this.businessContext = businessContext;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<JobWorkResponse> list(String status) {
        String sql = "SELECT * FROM job_work_orders" + (status == null || status.isBlank() ? "" : " WHERE status = ?")
                + " ORDER BY created_at DESC LIMIT 300";
        Object[] args = status == null || status.isBlank() ? new Object[0] : new Object[]{status.trim().toUpperCase()};
        return jdbc.queryForList(sql, args).stream().map(r -> map(r, null)).toList();
    }

    @Transactional(readOnly = true)
    public JobWorkResponse get(UUID id) {
        Map<String, Object> row = jdbc.queryForList("SELECT * FROM job_work_orders WHERE id = ?", id).stream().findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Job work"));
        return map(row, lines(id));
    }

    @Transactional
    public JobWorkResponse issue(CreateJobWorkRequest r) {
        String worker = Validation.trim(r.jobWorkerName());
        if (r.supplierId() != null) {
            List<String> name = jdbc.queryForList("SELECT name FROM suppliers WHERE id = ?", String.class, r.supplierId());
            if (name.isEmpty()) {
                throw BusinessException.validation("supplierId", "Supplier not found");
            }
            worker = worker == null ? name.getFirst() : worker;
        }
        if (worker == null) {
            throw BusinessException.validation("jobWorkerName", "Choose a supplier or enter the job worker's name");
        }
        LocalDate date = r.issueDate() != null ? r.issueDate() : businessContext.today();
        UUID id = UUID.randomUUID();
        String number = sequences.next(DocumentType.JOB_WORK, date);
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO job_work_orders (id, job_number, supplier_id, job_worker_name, process, issue_date, expected_date, status, notes,
                                             created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)
                """, id, number, r.supplierId(), worker, r.process().trim(), TradeSupport.date(date), TradeSupport.date(r.expectedDate()),
                Validation.trim(r.notes()), CurrentUser.id(), now, now);
        for (JobWorkLineRequest l : sorted(r.items())) {
            Product p = product(l.productId());
            inventory.post(p.getId(), MovementType.JOB_WORK_OUT, Money.qty(l.quantity()), Money.of(p.getPurchasePrice()), "JOB_WORK", id,
                    number, "Sent for " + r.process().trim(), null);
            insertLine(id, "ISSUE", p, l.quantity(), date);
        }
        audit.record(AuditAction.JOB_WORK_ISSUED, "JOB_WORK", id, null, Map.of("number", number, "lines", r.items().size()));
        return get(id);
    }

    @Transactional
    public JobWorkResponse receive(UUID id, ReceiveJobWorkRequest r) {
        Map<String, Object> job = lock(id);
        String status = (String) job.get("status");
        if (!"OPEN".equals(status) && !"PARTIAL".equals(status)) {
            throw new BusinessException(ErrorCode.CONFLICT, "The job work is " + status);
        }
        boolean empty = isEmpty(r.finished()) && isEmpty(r.returned()) && isEmpty(r.consumed());
        if (empty && (r.charges() == null || r.charges().signum() == 0)) {
            throw BusinessException.validation("finished", "Enter what came back, was returned or was used up");
        }
        LocalDate date = r.date() != null ? r.date() : businessContext.today();
        String number = (String) job.get("job_number");
        // Returned and consumed quantities settle the issue lines (never more than is still out).
        List<Map<String, Object>> issued = jdbc.queryForList(
                "SELECT * FROM job_work_lines WHERE job_work_order_id = ? AND direction = 'ISSUE' ORDER BY created_at FOR UPDATE", id);
        if (!isEmpty(r.returned())) {
            for (JobWorkLineRequest l : sorted(r.returned())) {
                settle(issued, l, "returned_quantity");
                Product p = product(l.productId());
                inventory.post(p.getId(), MovementType.JOB_WORK_IN, Money.qty(l.quantity()), Money.of(p.getPurchasePrice()), "JOB_WORK", id,
                        number, "Unused material back from job work", null);
            }
        }
        if (!isEmpty(r.consumed())) {
            for (JobWorkLineRequest l : r.consumed()) {
                settle(issued, l, "consumed_quantity");
            }
        }
        if (!isEmpty(r.finished())) {
            for (JobWorkLineRequest l : sorted(r.finished())) {
                Product p = product(l.productId());
                inventory.post(p.getId(), MovementType.JOB_WORK_IN, Money.qty(l.quantity()), Money.of(p.getPurchasePrice()), "JOB_WORK", id,
                        number, "Finished goods from job work", null);
                insertLine(id, "RECEIVE", p, l.quantity(), date);
            }
        }
        BigDecimal pending = jdbc.queryForObject("""
                SELECT COALESCE(SUM(quantity - returned_quantity - consumed_quantity), 0) FROM job_work_lines
                WHERE job_work_order_id = ? AND direction = 'ISSUE'
                """, BigDecimal.class, id);
        String next = pending.signum() <= 0 ? "CLOSED" : "PARTIAL";
        jdbc.update("UPDATE job_work_orders SET status = ?, charges = charges + ?, updated_at = now(), version = version + 1 WHERE id = ?",
                next, r.charges() == null ? BigDecimal.ZERO : Money.of(r.charges()), id);
        audit.record(AuditAction.JOB_WORK_RECEIVED, "JOB_WORK", id, Map.of("status", status), Map.of("status", next));
        return get(id);
    }

    /** Cancels a job work before anything came back: all issued material returns to stock. */
    @Transactional
    public JobWorkResponse cancel(UUID id) {
        Map<String, Object> job = lock(id);
        if (!"OPEN".equals(job.get("status"))) {
            throw new BusinessException(ErrorCode.CONFLICT, "Only an open job work with nothing received can be cancelled");
        }
        List<JobWorkLineResponse> issued = new ArrayList<>(lines(id));
        issued.sort(Comparator.comparing(JobWorkLineResponse::productId));
        for (JobWorkLineResponse l : issued) {
            if (!"ISSUE".equals(l.direction()) || l.pendingQuantity().signum() <= 0) {
                continue;
            }
            Product p = products.get(l.productId());
            inventory.post(p.getId(), MovementType.JOB_WORK_IN, l.pendingQuantity(), Money.of(p.getPurchasePrice()), "JOB_WORK", id,
                    (String) job.get("job_number"), "Job work cancelled", null);
        }
        jdbc.update("UPDATE job_work_orders SET status = 'CANCELLED', updated_at = now(), version = version + 1 WHERE id = ?", id);
        audit.record(AuditAction.JOB_WORK_RECEIVED, "JOB_WORK", id, Map.of("status", "OPEN"), Map.of("status", "CANCELLED"));
        return get(id);
    }

    private void settle(List<Map<String, Object>> issued, JobWorkLineRequest l, String column) {
        BigDecimal left = Money.qty(l.quantity());
        for (Map<String, Object> line : issued) {
            if (!l.productId().equals(line.get("product_id")) || left.signum() <= 0) {
                continue;
            }
            BigDecimal open = ((BigDecimal) line.get("quantity")).subtract((BigDecimal) line.get("returned_quantity"))
                    .subtract((BigDecimal) line.get("consumed_quantity"));
            BigDecimal take = Money.min(open, left);
            if (take.signum() <= 0) {
                continue;
            }
            jdbc.update("UPDATE job_work_lines SET " + column + " = " + column + " + ? WHERE id = ?", take, line.get("id"));
            line.put(column, ((BigDecimal) line.get(column)).add(take));
            left = left.subtract(take);
        }
        if (left.signum() > 0) {
            throw BusinessException.validation("returned", "More " + product(l.productId()).getName() + " than is still with the job worker");
        }
    }

    private Product product(UUID productId) {
        Product p = products.get(productId);
        if (p.isTrackBatches() || p.isTrackSerials()) {
            throw BusinessException.validation("items", p.getName() + " tracks batches or serial numbers and cannot be sent for job work");
        }
        return p;
    }

    private void insertLine(UUID jobId, String direction, Product p, BigDecimal quantity, LocalDate date) {
        jdbc.update("""
                INSERT INTO job_work_lines (id, job_work_order_id, direction, product_id, product_name, unit, quantity, line_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), jobId, direction, p.getId(), p.getName(), p.getUnit().name(), Money.qty(quantity),
                TradeSupport.date(date), Timestamp.from(Instant.now()));
    }

    private Map<String, Object> lock(UUID id) {
        return jdbc.queryForList("SELECT * FROM job_work_orders WHERE id = ? FOR UPDATE", id).stream().findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Job work"));
    }

    private static boolean isEmpty(List<?> l) {
        return l == null || l.isEmpty();
    }

    private static List<JobWorkLineRequest> sorted(List<JobWorkLineRequest> lines) {
        return lines.stream().sorted(Comparator.comparing(JobWorkLineRequest::productId)).toList();
    }

    private List<JobWorkLineResponse> lines(UUID id) {
        return jdbc.queryForList("SELECT * FROM job_work_lines WHERE job_work_order_id = ? ORDER BY direction, created_at", id).stream()
                .map(r -> {
                    BigDecimal qty = (BigDecimal) r.get("quantity");
                    BigDecimal returned = (BigDecimal) r.get("returned_quantity");
                    BigDecimal consumed = (BigDecimal) r.get("consumed_quantity");
                    return new JobWorkLineResponse((UUID) r.get("id"), (String) r.get("direction"), (UUID) r.get("product_id"),
                            (String) r.get("product_name"), (String) r.get("unit"), qty, returned, consumed,
                            "ISSUE".equals(r.get("direction")) ? qty.subtract(returned).subtract(consumed) : BigDecimal.ZERO,
                            TradeSupport.localDate(r.get("line_date")));
                }).toList();
    }

    private static JobWorkResponse map(Map<String, Object> r, List<JobWorkLineResponse> lines) {
        return new JobWorkResponse((UUID) r.get("id"), (String) r.get("job_number"), (UUID) r.get("supplier_id"),
                (String) r.get("job_worker_name"), (String) r.get("process"), TradeSupport.localDate(r.get("issue_date")),
                TradeSupport.localDate(r.get("expected_date")), (String) r.get("status"), (String) r.get("notes"),
                (BigDecimal) r.get("charges"), TradeSupport.instant(r.get("created_at")), lines);
    }
}
