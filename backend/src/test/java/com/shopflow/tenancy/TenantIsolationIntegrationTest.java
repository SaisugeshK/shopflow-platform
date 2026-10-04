package com.shopflow.tenancy;

import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Multi-tenancy (architecture §0B, D-031…D-035): one tenant can never read or change another tenant's rows — through
 * the API or directly in the database (row-level security) — plus tenant selection, switching, join links, module
 * switches, suspension and Super Admin support access.
 */
class TenantIsolationIntegrationTest extends IntegrationTest {

    private static final UUID TENANT_A = TestData.BUSINESS;

    private String platformToken;
    private UUID tenantB;
    private String tenantBCode;
    private String ownerBToken;

    @BeforeEach
    void createSecondTenant() {
        String adminMobile = TestData.mobile();
        data.platformAdmin(adminMobile);
        JsonNode verified = api.verify(adminMobile, null);
        assertThat(verified.path("user").path("role").asString()).isEqualTo("SUPER_ADMIN");
        platformToken = verified.path("accessToken").asString();

        String ownerB = TestData.mobile();
        JsonNode created = api.post("/api/v1/platform/tenants", platformToken, Map.of(
                "name", "Isolation Textiles " + ownerB.substring(9), "industry", "TEXTILE", "state", "Karnataka",
                "stateCode", "29", "ownerName", "Owner B", "ownerMobile", ownerB), 201).path("data");
        tenantB = UUID.fromString(created.path("id").asString());
        tenantBCode = created.path("tenantCode").asString();
        assertThat(created.path("joinPath").asString()).isEqualTo("/join/" + tenantBCode);
        // The textile template switched on variants and created its categories.
        assertThat(moduleOn(created.path("modules"), "VARIANTS")).isTrue();
        assertThat(created.path("usage").path("staff").asLong()).isEqualTo(1);
        ownerBToken = api.login(ownerB);
    }

    @Test
    void apiNeverReturnsAnotherTenantsRecords() {
        String ownerAToken = api.login(data.owner());
        UUID productA = data.product("100.00", "60.00", "18", "5");

        JsonNode meB = api.get("/api/v1/auth/me", ownerBToken, 200).path("data");
        assertThat(meB.path("business").path("id").asString()).isEqualTo(tenantB.toString());
        assertThat(meB.path("role").asString()).isEqualTo("OWNER");

        api.get("/api/v1/products/" + productA, ownerAToken, 200);
        api.get("/api/v1/products/" + productA, ownerBToken, 404);
        assertThat(ids(api.get("/api/v1/products?pageSize=100", ownerBToken, 200))).doesNotContain(productA.toString());
        assertThat(ids(api.get("/api/v1/categories", ownerBToken, 200))).hasSize(6);
        // Writes cannot reach the other tenant either.
        api.patch("/api/v1/products/" + productA, ownerBToken, Map.of("name", "Hijacked"), 404);
        api.post("/api/v1/products/" + productA + "/deactivate", ownerBToken, null, 404);
    }

    @Test
    void databasePoliciesEnforceIsolationEvenForHandWrittenSql() {
        UUID productA = data.product("100.00", "60.00", "18", "3");
        Long seenFromA = TenantContext.callInTenant(TENANT_A, () -> data.tenantJdbc().queryForObject(
                "SELECT count(*) FROM products WHERE id = ?", Long.class, productA));
        Long seenFromB = TenantContext.callInTenant(tenantB, () -> data.tenantJdbc().queryForObject(
                "SELECT count(*) FROM products WHERE id = ?", Long.class, productA));
        Long childRowsFromB = TenantContext.callInTenant(tenantB, () -> data.tenantJdbc().queryForObject(
                "SELECT count(*) FROM stock_balances WHERE product_id = ?", Long.class, productA));
        Long seenWithoutTenant = data.tenantJdbc().queryForObject("SELECT count(*) FROM products", Long.class);
        assertThat(seenFromA).isEqualTo(1);
        assertThat(seenFromB).isZero();
        assertThat(childRowsFromB).isZero();
        assertThat(seenWithoutTenant).as("no tenant in context = no rows").isZero();

        // Inserting a row for tenant A while working as tenant B is rejected by the policy's WITH CHECK.
        assertThatThrownBy(() -> TenantContext.runInTenant(tenantB, () -> data.tenantJdbc().update("""
                INSERT INTO categories (id, business_id, name, created_at, updated_at) VALUES (?,?,?,?,?)""",
                UUID.randomUUID(), TENANT_A, "Smuggled", Timestamp.from(Instant.now()), Timestamp.from(Instant.now()))))
                .isInstanceOf(DataAccessException.class);
        // Updates of another tenant's rows silently match nothing.
        int updated = TenantContext.callInTenant(tenantB, () -> data.tenantJdbc().update(
                "UPDATE products SET name = 'Hijacked' WHERE id = ?", productA));
        assertThat(updated).isZero();
        // A child row inherits its tenant from the parent automatically.
        UUID childTenant = data.jdbc().queryForObject("SELECT business_id FROM stock_balances WHERE product_id = ?", UUID.class, productA);
        assertThat(childTenant).isEqualTo(TENANT_A);
    }

    @Test
    void oneNumberInSeveralTenantsChoosesAndSwitches() {
        String mobile = TestData.mobile();
        data.user(mobile, "Multi Person", TestData.OWNER_ROLE, "ACTIVE");
        data.member(tenantB, mobile, "Multi Person", TestData.ADMIN_ROLE);

        JsonNode verified = api.verify(mobile, null);
        assertThat(verified.path("selectionRequired").asBoolean()).isTrue();
        assertThat(verified.path("accessToken").isMissingNode() || verified.path("accessToken").isNull()).isTrue();
        assertThat(verified.path("tenants")).hasSize(2);
        String selection = verified.path("selectionToken").asString();

        // A selection token is not a session.
        api.get("/api/v1/auth/me", selection, 403);
        api.post("/api/v1/auth/select-tenant", selection, Map.of("businessId", UUID.randomUUID().toString()), 403);

        JsonNode inB = api.post("/api/v1/auth/select-tenant", selection, Map.of("businessId", tenantB.toString()), 200).path("data");
        assertThat(inB.path("user").path("business").path("id").asString()).isEqualTo(tenantB.toString());
        assertThat(inB.path("user").path("role").asString()).isEqualTo("ADMIN");
        assertThat(inB.path("user").path("memberships")).hasSize(2);
        String tokenB = inB.path("accessToken").asString();

        JsonNode inA = api.post("/api/v1/auth/switch-tenant", tokenB, Map.of("businessId", TENANT_A.toString()), 200).path("data");
        assertThat(inA.path("user").path("business").path("id").asString()).isEqualTo(TENANT_A.toString());
        assertThat(inA.path("user").path("role").asString()).isEqualTo("OWNER");
        // Switching ends the previous session.
        api.get("/api/v1/auth/me", tokenB, 401);
        api.post("/api/v1/auth/switch-tenant", inA.path("accessToken").asString(), Map.of("platform", true), 403);
    }

    @Test
    void platformAndTenantTokensStayInTheirOwnArea() {
        api.get("/api/v1/products", platformToken, 403);
        api.get("/api/v1/customers", platformToken, 403);
        api.get("/api/v1/platform/tenants", ownerBToken, 403);
        api.get("/api/v1/platform/overview", ownerBToken, 403);
        JsonNode list = api.get("/api/v1/platform/tenants?q=" + tenantBCode, platformToken, 200).path("data");
        assertThat(list).hasSize(1);
        assertThat(api.get("/api/v1/platform/overview", platformToken, 200).path("data").path("tenants").asLong()).isGreaterThanOrEqualTo(2);
        JsonNode me = api.get("/api/v1/auth/me", platformToken, 200).path("data");
        assertThat(me.path("role").asString()).isEqualTo("SUPER_ADMIN");
        assertThat(me.path("business").isMissingNode() || me.path("business").isNull()).isTrue();
    }

    @Test
    void joinLinkRegistersTheCustomerInThatTenantOnly() {
        String mobile = TestData.mobile();
        JsonNode v = api.verify(mobile, tenantBCode);
        assertThat(v.path("registrationRequired").asBoolean()).isTrue();
        assertThat(v.path("registrationBusiness").path("id").asString()).isEqualTo(tenantB.toString());
        JsonNode reg = api.post("/api/v1/customer-registration", v.path("registrationToken").asString(), Map.of(
                "shopName", "Join Link Shop", "contactName", "Kavya",
                "address", Map.of("addressLine1", "9 Silk Street", "city", "Bengaluru", "state", "Karnataka", "pincode", "560001")), 201).path("data");
        assertThat(reg.path("user").path("business").path("id").asString()).isEqualTo(tenantB.toString());
        String customerId = reg.path("user").path("customer").path("id").asString();

        assertThat(ids(api.get("/api/v1/customers?pageSize=100", ownerBToken, 200))).contains(customerId);
        String ownerAToken = api.login(data.owner());
        assertThat(ids(api.get("/api/v1/customers?pageSize=100", ownerAToken, 200))).doesNotContain(customerId);
        api.get("/api/v1/customers/" + customerId, ownerAToken, 404);

        // Public landing data for the join link; unknown codes are 404.
        assertThat(api.get("/api/v1/public/tenants/" + tenantBCode, null, 200).path("data").path("id").asString()).isEqualTo(tenantB.toString());
        api.get("/api/v1/public/tenants/no-such-shop", null, 404);
    }

    @Test
    void moduleSwitchesAreEnforced() {
        api.get("/api/v1/sales-returns", ownerBToken, 200);
        JsonNode modules = api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + tenantB + "/modules", platformToken,
                Map.of("modules", Map.of("RETURNS", false, "SUPPLIER_PORTAL", true)), 200, Map.of()).path("data");
        assertThat(moduleOn(modules, "RETURNS")).isFalse();
        // The supplier portal needs purchase orders, which were switched on with it.
        assertThat(moduleOn(modules, "SUPPLIER_PORTAL")).isTrue();
        assertThat(moduleOn(modules, "PURCHASE_ORDERS")).isTrue();

        JsonNode error = api.get("/api/v1/sales-returns", ownerBToken, 403);
        assertThat(error.path("error").path("code").asString()).isEqualTo("MODULE_DISABLED");
        List<String> enabled = new ArrayList<>();
        api.get("/api/v1/auth/me", ownerBToken, 200).path("data").path("modules").forEach(m -> enabled.add(m.asString()));
        assertThat(enabled).contains("SUPPLIER_PORTAL", "PURCHASE_ORDERS", "VARIANTS").doesNotContain("RETURNS");

        // Tenant A is unaffected.
        api.get("/api/v1/sales-returns", api.login(data.owner()), 200);
    }

    @Test
    void suspensionSignsEveryoneOutAndBlocksSignIn() {
        api.post("/api/v1/platform/tenants/" + tenantB + "/suspend", platformToken, Map.of("reason", "Unpaid subscription"), 200);
        api.get("/api/v1/auth/me", ownerBToken, 401);
        String staffOfB = TestData.mobile();
        data.member(tenantB, staffOfB, "Suspended Staff", TestData.ADMIN_ROLE);
        JsonNode challenge = api.post("/api/v1/auth/otp/request", null, Map.of("mobileNumber", staffOfB), 200).path("data");
        JsonNode error = api.post("/api/v1/auth/otp/verify", null, Map.of("mobileNumber", staffOfB,
                "otp", api.latestOtp(staffOfB), "requestId", challenge.path("requestId").asString()), 403);
        assertThat(error.path("error").path("code").asString()).isEqualTo("TENANT_SUSPENDED");
        api.post("/api/v1/platform/tenants/" + tenantB + "/reactivate", platformToken, Map.of("reason", "Paid in full"), 200);
        assertThat(api.get("/api/v1/platform/tenants/" + tenantB, platformToken, 200).path("data").path("status").asString()).isEqualTo("ACTIVE");
    }

    @Test
    void supportAccessIsReadOnlyTimeBoxedAndVisibleToTheOwner() {
        api.post("/api/v1/platform/tenants/" + tenantB + "/support-access", platformToken, Map.of("reason", "short"), 400);
        JsonNode access = api.post("/api/v1/platform/tenants/" + tenantB + "/support-access", platformToken,
                Map.of("reason", "Owner reported a wrong stock figure", "minutes", 15), 200).path("data");
        String supportToken = access.path("accessToken").asString();
        assertThat(Instant.parse(access.path("expiresAt").asString())).isBefore(Instant.now().plusSeconds(16 * 60));

        JsonNode me = api.get("/api/v1/auth/me", supportToken, 200).path("data");
        assertThat(me.path("support").asBoolean()).isTrue();
        assertThat(me.path("business").path("id").asString()).isEqualTo(tenantB.toString());
        api.get("/api/v1/products", supportToken, 200);
        api.get("/api/v1/categories", supportToken, 200);
        api.post("/api/v1/categories", supportToken, Map.of("name", "Support should not write"), 403);
        api.get("/api/v1/platform/tenants", supportToken, 403);

        JsonNode audit = api.get("/api/v1/audit-logs?action=SUPPORT_ACCESS_STARTED", ownerBToken, 200).path("data");
        assertThat(audit).isNotEmpty();
        assertThat(audit.get(0).path("newValue").asString()).contains("wrong stock figure");
        // Tenant A's owner does not see tenant B's audit trail.
        assertThat(api.get("/api/v1/audit-logs?action=SUPPORT_ACCESS_STARTED&pageSize=100", api.login(data.owner()), 200)
                .path("data").findValuesAsString("entityId")).doesNotContain(tenantB.toString());

        // Suspending the tenant ends the support view too.
        api.post("/api/v1/platform/tenants/" + tenantB + "/suspend", platformToken, Map.of("reason", "Investigation"), 200);
        api.get("/api/v1/products", supportToken, 401);
        api.post("/api/v1/platform/tenants/" + tenantB + "/reactivate", platformToken, Map.of("reason", "Resolved"), 200);
    }

    @Test
    void documentNumbersAreUniquePerTenantOnly() {
        assertThat(data.jdbc().queryForObject("SELECT tenant_code FROM businesses WHERE id = ?", String.class, TENANT_A)).isEqualTo("main");
        for (String constraint : List.of("ux_stock_adjustments_number", "ux_purchase_payments_number", "ux_payment_receipts_number",
                "ux_users_business_mobile")) {
            String definition = data.jdbc().queryForObject(
                    "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = ?", String.class, constraint);
            assertThat(definition).as(constraint).contains("business_id");
        }
    }

    private static boolean moduleOn(JsonNode modules, String code) {
        for (JsonNode m : modules) {
            if (code.equals(m.path("code").asString())) {
                return m.path("enabled").asBoolean();
            }
        }
        throw new AssertionError("module " + code + " missing");
    }

    private static List<String> ids(JsonNode response) {
        List<String> ids = new ArrayList<>();
        response.path("data").forEach(n -> ids.add(n.path("id").asString()));
        return ids;
    }
}
