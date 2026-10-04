package com.shopflow.trade;

import com.shopflow.business.BusinessSettingsService;
import com.shopflow.billing.TaxCalculator;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.customers.CustomerAddress;
import com.shopflow.customers.CustomerService;
import com.shopflow.security.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Small lookups shared by the trade document services. */
@Component
class TradeSupport {

    private final JdbcTemplate jdbc;
    private final CustomerService customers;
    private final BusinessSettingsService settings;

    TradeSupport(JdbcTemplate jdbc, CustomerService customers, BusinessSettingsService settings) {
        this.jdbc = jdbc;
        this.customers = customers;
        this.settings = settings;
    }

    /** A project must belong to the document's customer. */
    void checkProject(UUID projectId, UUID customerId) {
        if (projectId == null) {
            return;
        }
        List<UUID> owner = jdbc.queryForList("SELECT customer_id FROM projects WHERE id = ?", UUID.class, projectId);
        if (owner.isEmpty() || !owner.getFirst().equals(customerId)) {
            throw BusinessException.validation("projectId", "The project does not belong to this customer");
        }
    }

    /** Inter-state supply when the customer's default address is in another GST state. */
    boolean interState(UUID customerId) {
        String buyerState = customers.defaultAddress(customerId).map(CustomerAddress::getStateCode).orElse(null);
        return TaxCalculator.isInterState(settings.business().getStateCode(), buyerState);
    }

    /** Grand total rounded to the rupee when the business rounds off its documents. */
    BigDecimal grandTotal(BigDecimal beforeRound) {
        return settings.taxSettings().isRoundOffEnabled()
                ? beforeRound.setScale(0, java.math.RoundingMode.HALF_UP).setScale(2) : beforeRound;
    }

    /** The signed-in customer's id; throws for staff. */
    static UUID currentCustomer() {
        if (!CurrentUser.isCustomer()) {
            throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, "Customer account required");
        }
        return CurrentUser.customerId();
    }

    static Date date(LocalDate d) {
        return d == null ? null : Date.valueOf(d);
    }

    static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    static LocalDate localDate(Object o) {
        return o == null ? null : ((Date) o).toLocalDate();
    }

    static java.time.Instant instant(Object o) {
        return o == null ? null : ((java.sql.Timestamp) o).toInstant();
    }
}
