package com.shopflow.products;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.util.Money;
import com.shopflow.security.CurrentUser;
import com.shopflow.tenancy.ModuleCode;
import com.shopflow.tenancy.TenantContext;
import com.shopflow.tenancy.TenantModules;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Daily rate list (§0B.7, DAILY_RATES module): effective-dated prices for products priced by the day (cement, steel,
 * sand…). The rate in force today is copied to the product's selling price, so every price path uses it; an order
 * keeps the rate it was placed at.
 */
@Service
public class DailyRateService {

    private static final Logger log = LoggerFactory.getLogger(DailyRateService.class);

    public record RateLine(@NotNull UUID productId, @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal rate) {
    }

    public record SetRatesRequest(LocalDate effectiveDate, @NotNull @Size(min = 1, max = 500) List<@Valid RateLine> rates) {
    }

    public record RateRow(UUID productId, String sku, String name, String unit, BigDecimal currentPrice, BigDecimal rate,
                          LocalDate rateDate, BigDecimal previousRate, LocalDate previousDate) {
    }

    private final JdbcTemplate jdbc;
    private final TenantModules modules;
    private final BusinessContext businessContext;
    private final AuditService audit;
    private final TransactionTemplate tx;

    public DailyRateService(JdbcTemplate jdbc, TenantModules modules, BusinessContext businessContext, AuditService audit,
                            PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.modules = modules;
        this.businessContext = businessContext;
        this.audit = audit;
        this.tx = new TransactionTemplate(txManager);
    }

    /** Rate-priced products with the rate in force on {@code date} and the one before it. */
    public List<RateRow> list(LocalDate date) {
        LocalDate on = date == null ? businessContext.today() : date;
        return jdbc.query("""
                SELECT p.id, p.sku, p.name, p.unit, p.selling_price,
                       r.rate, r.effective_date, prev.rate AS prev_rate, prev.effective_date AS prev_date
                FROM products p
                LEFT JOIN LATERAL (SELECT rate, effective_date FROM product_daily_rates
                                   WHERE product_id = p.id AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1) r ON TRUE
                LEFT JOIN LATERAL (SELECT rate, effective_date FROM product_daily_rates
                                   WHERE product_id = p.id AND effective_date < coalesce(r.effective_date, ?) ORDER BY effective_date DESC LIMIT 1) prev ON TRUE
                WHERE p.pricing_mode = 'DAILY_RATE' AND p.active AND NOT p.variant_group
                ORDER BY p.name
                """, (rs, i) -> new RateRow(rs.getObject("id", UUID.class), rs.getString("sku"), rs.getString("name"),
                rs.getString("unit"), rs.getBigDecimal("selling_price"), rs.getBigDecimal("rate"),
                rs.getDate("effective_date") == null ? null : rs.getDate("effective_date").toLocalDate(),
                rs.getBigDecimal("prev_rate"), rs.getDate("prev_date") == null ? null : rs.getDate("prev_date").toLocalDate()),
                Date.valueOf(on), Date.valueOf(on));
    }

    @Transactional
    public List<RateRow> set(SetRatesRequest r) {
        modules.require(ModuleCode.DAILY_RATES);
        LocalDate today = businessContext.today();
        LocalDate date = r.effectiveDate() == null ? today : r.effectiveDate();
        if (date.isBefore(today.minusDays(7))) {
            throw BusinessException.validation("effectiveDate", "Rates can be back-dated by at most 7 days");
        }
        Timestamp now = Timestamp.from(Instant.now());
        for (RateLine line : r.rates()) {
            Integer rateProduct = jdbc.queryForObject("SELECT count(*) FROM products WHERE id = ? AND pricing_mode = 'DAILY_RATE'",
                    Integer.class, line.productId());
            if (rateProduct == null || rateProduct == 0) {
                throw BusinessException.validation("rates", "Product " + line.productId() + " is not priced by daily rate");
            }
            jdbc.update("""
                    INSERT INTO product_daily_rates (id, product_id, effective_date, rate, created_at, created_by) VALUES (?,?,?,?,?,?)
                    ON CONFLICT (product_id, effective_date) DO UPDATE SET rate = EXCLUDED.rate, created_at = EXCLUDED.created_at,
                        created_by = EXCLUDED.created_by
                    """, UUID.randomUUID(), line.productId(), Date.valueOf(date), Money.of(line.rate()), now, CurrentUser.id());
        }
        int applied = applyRatesInForce(today);
        audit.record(AuditAction.PRODUCT_UPDATED, "DAILY_RATES", null, null,
                Map.of("effectiveDate", date.toString(), "products", r.rates().size(), "pricesUpdated", applied));
        return list(date);
    }

    /** Copies the rate in force on {@code today} to selling_price for rate-priced products of the current tenant. */
    int applyRatesInForce(LocalDate today) {
        return jdbc.update("""
                UPDATE products p SET selling_price = r.rate, updated_at = now(), version = version + 1
                FROM (SELECT DISTINCT ON (product_id) product_id, rate FROM product_daily_rates
                      WHERE effective_date <= ? ORDER BY product_id, effective_date DESC) r
                WHERE p.id = r.product_id AND p.pricing_mode = 'DAILY_RATE' AND p.selling_price <> r.rate
                """, Date.valueOf(today));
    }

    /** Just after midnight: rates entered in advance take effect in every tenant that uses daily rates. */
    @Scheduled(cron = "0 5 0 * * *", zone = "Asia/Kolkata")
    public void rollOver() {
        List<UUID> tenants = TenantContext.callAsPlatform(() -> jdbc.queryForList(
                "SELECT DISTINCT business_id FROM product_daily_rates", UUID.class));
        for (UUID tenant : tenants) {
            try {
                TenantContext.runInTenant(tenant, () -> tx.executeWithoutResult(s -> applyRatesInForce(businessContext.today())));
            } catch (RuntimeException e) {
                log.warn("Daily rate roll-over failed for tenant {}", tenant, e);
            }
        }
    }
}
