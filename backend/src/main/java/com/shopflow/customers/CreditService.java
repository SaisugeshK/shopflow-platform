package com.shopflow.customers;

import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettings.CreditPolicy;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.util.Money;
import com.shopflow.customers.CustomerRepositories.CustomerCreditProfileRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * Outstanding/overdue figures and credit-limit validation (§10). The backend is the only place credit is decided.
 */
@Service
public class CreditService {

    private final CustomerCreditProfileRepository profiles;
    private final CustomerLedgerService ledger;
    private final BusinessSettingsService settings;
    private final BusinessContext businessContext;
    private final JdbcTemplate jdbc;

    public CreditService(CustomerCreditProfileRepository profiles, CustomerLedgerService ledger,
                         BusinessSettingsService settings, BusinessContext businessContext, JdbcTemplate jdbc) {
        this.profiles = profiles;
        this.ledger = ledger;
        this.settings = settings;
        this.businessContext = businessContext;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Outstanding outstanding(UUID customerId) {
        CustomerCreditProfile profile = profile(customerId);
        BigDecimal balance = ledger.balance(customerId);
        LocalDate today = businessContext.today();
        Map<String, Object> row = jdbc.queryForMap("""
                SELECT COALESCE(SUM(grand_total - paid_amount - credited_amount), 0) AS open_amount,
                       COALESCE(SUM(CASE WHEN due_date < ? THEN grand_total - paid_amount - credited_amount ELSE 0 END), 0) AS overdue,
                       MIN(CASE WHEN grand_total - paid_amount - credited_amount > 0 THEN due_date END) AS oldest_due,
                       COUNT(*) FILTER (WHERE grand_total - paid_amount - credited_amount > 0) AS open_invoices
                FROM invoices
                WHERE customer_id = ? AND status NOT IN ('DRAFT', 'CANCELLED')
                """, Date.valueOf(today), customerId);
        BigDecimal invoiceOutstanding = Money.of((BigDecimal) row.get("open_amount"));
        BigDecimal overdue = Money.of((BigDecimal) row.get("overdue"));
        Date oldest = (Date) row.get("oldest_due");
        BigDecimal limit = Money.of(profile.getCreditLimit());
        BigDecimal available = profile.isCreditEnabled() ? Money.max(Money.ZERO, limit.subtract(Money.max(balance, Money.ZERO))) : Money.ZERO;
        return new Outstanding(balance, invoiceOutstanding, overdue, ((Number) row.get("open_invoices")).intValue(),
                oldest == null ? null : oldest.toLocalDate(), profile.isCreditEnabled(), limit, profile.getCreditDays(),
                available, effectivePolicy(profile));
    }

    /**
     * Decides whether an additional credit exposure is allowed. Exposure = current ledger balance plus the unbilled
     * value of open credit orders plus the new amount.
     */
    @Transactional(readOnly = true)
    public CreditDecision evaluate(UUID customerId, BigDecimal additionalAmount) {
        CustomerCreditProfile profile = profile(customerId);
        if (!profile.isCreditEnabled()) {
            return new CreditDecision(Decision.NOT_ENABLED, Money.ZERO, Money.ZERO);
        }
        BigDecimal exposure = Money.max(ledger.balance(customerId), Money.ZERO).add(openCreditOrderValue(customerId));
        BigDecimal projected = exposure.add(Money.of(additionalAmount));
        BigDecimal limit = Money.of(profile.getCreditLimit());
        if (projected.compareTo(limit) <= 0) {
            return new CreditDecision(Decision.ALLOWED, projected, limit);
        }
        return switch (effectivePolicy(profile)) {
            case BLOCK -> new CreditDecision(Decision.BLOCKED, projected, limit);
            case REQUIRE_ADMIN_APPROVAL -> new CreditDecision(Decision.REQUIRES_APPROVAL, projected, limit);
            case ALLOW -> new CreditDecision(Decision.ALLOWED_OVER_LIMIT, projected, limit);
        };
    }

    public CustomerCreditProfile profile(UUID customerId) {
        return profiles.findById(customerId).orElseGet(() -> {
            CustomerCreditProfile p = new CustomerCreditProfile();
            p.setCustomerId(customerId);
            return p;
        });
    }

    public int creditDays(UUID customerId) {
        return profile(customerId).getCreditDays();
    }

    private CreditPolicy effectivePolicy(CustomerCreditProfile profile) {
        return profile.getCreditPolicy() != null ? profile.getCreditPolicy() : settings.settings().getCreditPolicy();
    }

    /** Value of CREDIT orders not yet invoiced (invoiced value is already in the ledger). */
    private BigDecimal openCreditOrderValue(UUID customerId) {
        BigDecimal value = jdbc.queryForObject("""
                SELECT COALESCE(SUM(o.grand_total), 0) FROM orders o
                WHERE o.customer_id = ? AND o.payment_method = 'CREDIT'
                  AND o.status IN ('PLACED','ACCEPTED','PACKING','READY_FOR_DELIVERY','OUT_FOR_DELIVERY')
                  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = o.id AND i.status <> 'CANCELLED' AND i.status <> 'DRAFT')
                """, BigDecimal.class, customerId);
        return Money.of(value);
    }

    public enum Decision { ALLOWED, ALLOWED_OVER_LIMIT, REQUIRES_APPROVAL, BLOCKED, NOT_ENABLED }

    public record CreditDecision(Decision decision, BigDecimal projectedExposure, BigDecimal creditLimit) {
    }

    public record Outstanding(BigDecimal ledgerBalance, BigDecimal invoiceOutstanding, BigDecimal overdueAmount,
                              int openInvoiceCount, LocalDate oldestDueDate, boolean creditEnabled,
                              BigDecimal creditLimit, int creditDays, BigDecimal availableCredit, CreditPolicy creditPolicy) {
    }
}
