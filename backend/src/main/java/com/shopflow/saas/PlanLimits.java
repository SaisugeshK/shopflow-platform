package com.shopflow.saas;

import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.saas.SaasDtos.PlanResponse;
import com.shopflow.saas.SaasDtos.SubscriptionResponse;
import com.shopflow.saas.SaasDtos.Usage;
import com.shopflow.tenancy.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;

/**
 * Plan limits per tenant (§0B.14). Checked when something countable is created: staff users, products, customers,
 * generated invoices (per calendar month), branches and stored files. A null limit is unlimited.
 */
@Service
public class PlanLimits {

    public enum Limit {
        STAFF("staff users"), PRODUCTS("products"), CUSTOMERS("customers"), INVOICES_PER_MONTH("invoices a month"),
        BRANCHES("branches"), STORAGE_MB("MB of files");

        private final String label;

        Limit(String label) {
            this.label = label;
        }
    }

    private final JdbcTemplate jdbc;
    private final BusinessContext businessContext;

    public PlanLimits(JdbcTemplate jdbc, BusinessContext businessContext) {
        this.jdbc = jdbc;
        this.businessContext = businessContext;
    }

    /** Throws PLAN_LIMIT_REACHED when one more would go over the tenant's plan. */
    public void check(Limit limit) {
        check(limit, 1);
    }

    public void check(Limit limit, long adding) {
        UUID tenant = TenantContext.tenantId().orElse(null);
        if (tenant == null) {
            return;
        }
        PlanResponse plan = planOf(tenant);
        Integer max = switch (limit) {
            case STAFF -> plan.maxStaff();
            case PRODUCTS -> plan.maxProducts();
            case CUSTOMERS -> plan.maxCustomers();
            case INVOICES_PER_MONTH -> plan.maxInvoicesPerMonth();
            case BRANCHES -> plan.maxBranches();
            case STORAGE_MB -> plan.maxStorageMb();
        };
        if (max == null) {
            return;
        }
        long used = used(limit);
        if (used + adding > max) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_REACHED, "Your " + plan.name() + " plan allows " + max + " "
                    + limit.label + " (" + used + " used). Ask ShopFlow to upgrade your plan.");
        }
    }

    /** Storage: bytes about to be stored. */
    public void checkStorage(long bytes) {
        check(Limit.STORAGE_MB, (bytes + 1_048_575) / 1_048_576);
    }

    public SubscriptionResponse subscription() {
        UUID tenant = TenantContext.requireTenantId();
        Timestamp changed = jdbc.queryForObject("SELECT plan_changed_at FROM businesses WHERE id = ?", Timestamp.class, tenant);
        return new SubscriptionResponse(planOf(tenant), new Usage(used(Limit.STAFF), used(Limit.PRODUCTS), used(Limit.CUSTOMERS),
                used(Limit.INVOICES_PER_MONTH), used(Limit.BRANCHES), used(Limit.STORAGE_MB)), changed == null ? null : changed.toInstant());
    }

    PlanResponse planOf(UUID tenant) {
        return jdbc.queryForObject("SELECT p.* FROM businesses b JOIN plans p ON p.code = b.plan_code WHERE b.id = ?",
                (rs, i) -> plan(rs), tenant);
    }

    public List<PlanResponse> plans() {
        return jdbc.query("SELECT * FROM plans ORDER BY sort_order, code", (rs, i) -> plan(rs));
    }

    private long used(Limit limit) {
        Long n = switch (limit) {
            case STAFF -> jdbc.queryForObject("""
                    SELECT count(DISTINCT u.id) FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
                    WHERE r.code IN ('OWNER','ADMIN') AND u.status = 'ACTIVE'
                    """, Long.class);
            case PRODUCTS -> jdbc.queryForObject("SELECT count(*) FROM products WHERE active", Long.class);
            case CUSTOMERS -> jdbc.queryForObject("SELECT count(*) FROM customers", Long.class);
            case INVOICES_PER_MONTH -> jdbc.queryForObject("SELECT count(*) FROM invoices WHERE status <> 'DRAFT' AND invoice_date >= ?",
                    Long.class, Date.valueOf(businessContext.today().withDayOfMonth(1)));
            case BRANCHES -> jdbc.queryForObject("SELECT count(*) FROM branches WHERE active", Long.class);
            case STORAGE_MB -> jdbc.queryForObject("SELECT COALESCE(SUM(size_bytes), 0) / 1048576 FROM stored_files", Long.class);
        };
        return n == null ? 0 : n;
    }

    static PlanResponse plan(ResultSet rs) throws SQLException {
        return new PlanResponse(rs.getString("code"), rs.getString("name"), rs.getString("description"), rs.getBigDecimal("price_monthly"),
                (Integer) rs.getObject("max_staff"), (Integer) rs.getObject("max_products"), (Integer) rs.getObject("max_customers"),
                (Integer) rs.getObject("max_invoices_per_month"), (Integer) rs.getObject("max_branches"),
                (Integer) rs.getObject("max_storage_mb"), rs.getBoolean("active"));
    }
}
