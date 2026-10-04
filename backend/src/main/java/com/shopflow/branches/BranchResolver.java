package com.shopflow.branches;

import com.shopflow.common.error.BusinessException;
import com.shopflow.tenancy.ModuleCode;
import com.shopflow.tenancy.TenantModules;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Branch stock bookkeeping used by every stock movement (§0B.14). Only branches other than the default one have
 * {@code branch_stock} rows; the default (main) branch holds the rest of the total, so the existing total stock and
 * every movement written without a branch stay correct.
 */
@Component
public class BranchResolver {

    private final JdbcTemplate jdbc;
    private final TenantModules modules;

    public BranchResolver(JdbcTemplate jdbc, TenantModules modules) {
        this.jdbc = jdbc;
        this.modules = modules;
    }

    /**
     * The non-default branch the current request works at, or null for the default branch (also when the BRANCHES
     * module is off or no branch was chosen). An unknown or inactive branch is rejected.
     */
    public UUID effectiveBranch() {
        UUID requested = BranchContext.current().orElse(null);
        if (requested == null || !modules.isEnabled(ModuleCode.BRANCHES)) {
            return null;
        }
        List<Map<String, Object>> row = jdbc.queryForList("SELECT is_default, active FROM branches WHERE id = ?", requested);
        if (row.isEmpty() || !Boolean.TRUE.equals(row.getFirst().get("active"))) {
            throw BusinessException.validation("branch", "Choose an active branch");
        }
        return Boolean.TRUE.equals(row.getFirst().get("is_default")) ? null : requested;
    }

    /**
     * Applies a movement of {@code quantity} (base units) at {@code branchId} (null = default). {@code totalBefore} is
     * the product's total on hand before the movement. Throws when the branch does not hold enough stock.
     *
     * @return the stock left at the branch
     */
    public BigDecimal apply(UUID branchId, UUID productId, BigDecimal quantity, boolean inbound, BigDecimal totalBefore,
                            java.util.function.Function<BigDecimal, RuntimeException> insufficient) {
        if (branchId == null) {
            if (inbound) {
                return null;
            }
            BigDecimal elsewhere = jdbc.queryForObject("SELECT COALESCE(SUM(on_hand), 0) FROM branch_stock WHERE product_id = ?",
                    BigDecimal.class, productId);
            if (elsewhere.signum() == 0) {
                return null; // no branch holds any of it: the total check already covered this
            }
            BigDecimal atMain = totalBefore.subtract(elsewhere);
            if (atMain.compareTo(quantity) < 0) {
                throw insufficient.apply(atMain.max(BigDecimal.ZERO));
            }
            return atMain.subtract(quantity);
        }
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("INSERT INTO branch_stock (branch_id, product_id, on_hand, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT DO NOTHING",
                branchId, productId, now);
        BigDecimal atBranch = jdbc.queryForObject("SELECT on_hand FROM branch_stock WHERE branch_id = ? AND product_id = ? FOR UPDATE",
                BigDecimal.class, branchId, productId);
        BigDecimal after = inbound ? atBranch.add(quantity) : atBranch.subtract(quantity);
        if (after.signum() < 0) {
            throw insufficient.apply(atBranch);
        }
        jdbc.update("UPDATE branch_stock SET on_hand = ?, updated_at = ? WHERE branch_id = ? AND product_id = ?", after, now, branchId, productId);
        return after;
    }
}
