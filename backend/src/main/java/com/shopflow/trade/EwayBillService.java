package com.shopflow.trade;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Validation;
import com.shopflow.trade.TradeDtos.EwayBillRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * E-way bill details on an invoice (§0B.9, EWAY_BILL module). Until a GST suvidha provider is configured the number
 * comes from a mock and is flagged as a test number on screen and on the invoice. Validity follows the GST rule for
 * normal cargo: one day for every 200 km (or part of it).
 */
@Service
public class EwayBillService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final AuditService audit;

    public EwayBillService(JdbcTemplate jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional
    public void generate(UUID invoiceId, EwayBillRequest r) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT status, eway_bill_number FROM invoices WHERE id = ? FOR UPDATE", invoiceId);
        if (rows.isEmpty()) {
            throw BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, "Invoice");
        }
        String status = (String) rows.getFirst().get("status");
        if ("DRAFT".equals(status) || "CANCELLED".equals(status)) {
            throw new BusinessException(ErrorCode.INVOICE_INVALID_STATUS, "An e-way bill needs a generated invoice (it is " + status + ")");
        }
        if (rows.getFirst().get("eway_bill_number") != null) {
            throw new BusinessException(ErrorCode.CONFLICT, "This invoice already has e-way bill " + rows.getFirst().get("eway_bill_number"));
        }
        // 12 digits, never starting with 0.
        String number = (1 + RANDOM.nextInt(9)) + String.format("%011d", Math.abs(RANDOM.nextLong()) % 100_000_000_000L);
        Instant now = Instant.now();
        long days = Math.max(1, (r.distanceKm() + 199) / 200);
        Instant validUntil = now.plus(Duration.ofDays(days));
        jdbc.update("""
                UPDATE invoices SET eway_bill_number = ?, eway_bill_date = ?, eway_valid_until = ?, eway_distance_km = ?, eway_test_only = TRUE,
                       vehicle_number = COALESCE(?, vehicle_number), transport = COALESCE(?, transport), updated_at = now(), version = version + 1
                WHERE id = ?
                """, number, Timestamp.from(now), Timestamp.from(validUntil), r.distanceKm(),
                Validation.upper(Validation.trim(r.vehicleNumber())), Validation.trim(r.transport()), invoiceId);
        audit.record(AuditAction.EWAY_BILL_GENERATED, "INVOICE", invoiceId, null,
                Map.of("ewayBillNumber", number, "distanceKm", r.distanceKm(), "testOnly", true));
    }
}
