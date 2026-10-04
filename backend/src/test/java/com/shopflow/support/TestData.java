package com.shopflow.support;

import com.shopflow.tenancy.TenantAwareDataSource;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Creates fictitious test records directly in the database. Every call uses fresh identifiers, so tests are
 * independent and can share one database.
 */
@TestComponent
public class TestData {

    public static final UUID BUSINESS = UUID.fromString("00000000-0000-0000-0000-000000000001");
    public static final UUID OWNER_ROLE = UUID.fromString("00000000-0000-0000-0001-000000000001");
    public static final UUID ADMIN_ROLE = UUID.fromString("00000000-0000-0000-0001-000000000002");
    public static final UUID CUSTOMER_ROLE = UUID.fromString("00000000-0000-0000-0001-000000000003");

    private final JdbcTemplate jdbc;
    private final JdbcTemplate tenantJdbc;

    /** Fixtures are written with platform access: they create rows for any tenant, bypassing the RLS tenant scope. */
    public TestData(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource instanceof TenantAwareDataSource t ? t.platformView() : dataSource);
        this.tenantJdbc = new JdbcTemplate(dataSource);
    }

    /** Runs SQL exactly as the application does: under the current {@link com.shopflow.tenancy.TenantContext}. */
    public JdbcTemplate tenantJdbc() {
        return tenantJdbc;
    }

    /** Makes {@code mobile} a platform SUPER_ADMIN. */
    public UUID platformAdmin(String mobile) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO platform_admins (id, mobile_number, full_name, status, created_at, updated_at) VALUES (?,?,?,'ACTIVE',?,?)",
                id, mobile, "Test Super Admin", now(), now());
        return id;
    }

    /** A user (membership) of {@code mobile} in another tenant. */
    public UUID member(UUID businessId, String mobile, String name, UUID role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, business_id, mobile_number, full_name, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)",
                id, businessId, mobile, name, now(), now());
        jdbc.update("INSERT INTO user_roles (user_id, role_id) VALUES (?,?)", id, role);
        return id;
    }


    /** A random valid Indian mobile that avoids the mock providers' failure suffixes. */
    public static String mobile() {
        String tail;
        do {
            tail = String.format("%09d", ThreadLocalRandom.current().nextLong(1_000_000_000L));
        } while (tail.endsWith("0000") || tail.endsWith("1111") || tail.endsWith("9999") || tail.endsWith("8888"));
        return "+919" + tail;
    }

    private static Timestamp now() {
        return Timestamp.from(Instant.now());
    }

    public UUID user(String mobile, String name, UUID role, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, business_id, mobile_number, full_name, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                id, BUSINESS, mobile, name, status, now(), now());
        jdbc.update("INSERT INTO user_roles (user_id, role_id) VALUES (?,?)", id, role);
        return id;
    }

    public String owner() {
        String m = mobile();
        user(m, "Test Owner", OWNER_ROLE, "ACTIVE");
        return m;
    }

    public String admin() {
        String m = mobile();
        user(m, "Test Admin", ADMIN_ROLE, "ACTIVE");
        return m;
    }

    public record TestCustomer(UUID id, UUID userId, String mobile) {
    }

    public TestCustomer customer(String status, boolean creditEnabled, BigDecimal creditLimit, String stateCode) {
        String m = mobile();
        UUID userId = user(m, "Test Customer", CUSTOMER_ROLE, "ACTIVE");
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO customers (id, business_id, user_id, customer_code, shop_name, contact_name, mobile_number, status, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)""", id, BUSINESS, userId, "T-" + id.toString().substring(0, 8), "Test Shop " + m.substring(9),
                "Contact", m, status, now(), now());
        jdbc.update("""
                INSERT INTO customer_addresses (id, customer_id, label, address_line1, city, state, state_code, pincode, is_default, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,TRUE,?,?)""", UUID.randomUUID(), id, "Shop", "1 Test Street", "Chennai",
                "33".equals(stateCode) ? "Tamil Nadu" : "Karnataka", stateCode, "600001", now(), now());
        jdbc.update("INSERT INTO customer_credit_profiles (customer_id, credit_enabled, credit_limit, credit_days, updated_at) VALUES (?,?,?,?,?)",
                id, creditEnabled, creditLimit, 30, now());
        return new TestCustomer(id, userId, m);
    }

    public TestCustomer approvedCustomer() {
        return customer("APPROVED", true, new BigDecimal("100000"), "33");
    }

    public UUID category() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO categories (id, business_id, name, created_at, updated_at) VALUES (?,?,?,?,?)",
                id, BUSINESS, "Cat " + id.toString().substring(0, 8), now(), now());
        return id;
    }

    /** Product priced at {@code price} with {@code gst}% GST, cost {@code cost}, and opening stock. */
    public UUID product(String price, String cost, String gst, String openingStock) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO products (id, business_id, sku, name, category_id, hsn_code, unit, purchase_price, selling_price, gst_rate, minimum_stock, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", id, BUSINESS, "SKU-" + id.toString().substring(0, 8), "Product " + id.toString().substring(0, 6),
                category(), "1905", "PCS", new BigDecimal(cost), new BigDecimal(price), new BigDecimal(gst), BigDecimal.ONE, now(), now());
        BigDecimal qty = new BigDecimal(openingStock);
        if (qty.signum() > 0) {
            jdbc.update("""
                    INSERT INTO stock_movements (id, product_id, movement_type, direction, quantity, unit_cost, balance_after, reference_type, reference_id, reference_number, created_at)
                    VALUES (?,?,'OPENING','IN',?,?,?,'OPENING_STOCK',?,'OPENING',?)""", UUID.randomUUID(), id, qty, new BigDecimal(cost), qty, id, now());
        }
        jdbc.update("INSERT INTO stock_balances (product_id, on_hand, reserved, updated_at) VALUES (?,?,0,?)", id, qty, now());
        return id;
    }

    public UUID supplier(String stateCode) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO suppliers (id, business_id, supplier_code, name, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                id, BUSINESS, "TS-" + id.toString().substring(0, 8), "Test Supplier", now(), now());
        jdbc.update("""
                INSERT INTO supplier_addresses (id, supplier_id, address_line1, city, state, state_code, pincode, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?)""", UUID.randomUUID(), id, "1 Mill Road", "City", "State", stateCode, "600001", now(), now());
        return id;
    }

    public BigDecimal onHand(UUID productId) {
        return jdbc.queryForObject("SELECT on_hand FROM stock_balances WHERE product_id = ?", BigDecimal.class, productId);
    }

    public BigDecimal reserved(UUID productId) {
        return jdbc.queryForObject("SELECT reserved FROM stock_balances WHERE product_id = ?", BigDecimal.class, productId);
    }

    public BigDecimal ledgerBalance(UUID customerId) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM customer_ledger_entries WHERE customer_id = ?",
                BigDecimal.class, customerId);
    }

    public JdbcTemplate jdbc() {
        return jdbc;
    }
}
