package com.shopflow.saas;

import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import com.shopflow.support.TestData.TestCustomer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SaaS operations (architecture §0B.14, Phase 5): plan limits and upgrades, business self-signup approved by the
 * Super Admin, custom-domain lookup, and branches with stock per branch and transfers.
 */
class SaasIntegrationTest extends IntegrationTest {

    private String platform;

    @BeforeEach
    void setUp() {
        String admin = TestData.mobile();
        data.platformAdmin(admin);
        platform = api.login(admin);
    }

    private JsonNode newTenant(String plan) {
        String owner = TestData.mobile();
        JsonNode t = api.post("/api/v1/platform/tenants", platform, Map.of("name", "Plan Test " + owner.substring(9), "industry", "GROCERY",
                "state", "Tamil Nadu", "stateCode", "33", "ownerName", "Owner", "ownerMobile", owner, "planCode", plan), 201).path("data");
        assertThat(t.path("planCode").asString()).isEqualTo(plan);
        return t;
    }

    @Test
    void planLimitsBlockNewItemsUntilTheTenantIsUpgraded() {
        JsonNode t = newTenant("FREE");
        String id = t.path("id").asString();
        String ownerMobile = t.path("ownerMobile").asString();
        String owner = api.verify(ownerMobile, t.path("tenantCode").asString()).path("accessToken").asString();

        // Free: 2 staff (the owner + one admin).
        api.post("/api/v1/users", owner, Map.of("mobileNumber", TestData.mobile(), "fullName", "Admin One"), 201);
        JsonNode blocked = api.post("/api/v1/users", owner, Map.of("mobileNumber", TestData.mobile(), "fullName", "Admin Two"), 403);
        assertThat(blocked.path("error").path("code").asString()).isEqualTo("PLAN_LIMIT_REACHED");

        // Free: 1 branch (the main one).
        api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + id + "/modules", platform, Map.of("modules", Map.of("BRANCHES", true)), 200, Map.of());
        assertThat(api.get("/api/v1/branches", owner, 200).path("data")).hasSize(1);
        api.post("/api/v1/branches", owner, Map.of("code", "WH1", "name", "Godown"), 403);

        JsonNode sub = api.get("/api/v1/subscription", owner, 200).path("data");
        assertThat(sub.path("plan").path("code").asString()).isEqualTo("FREE");
        assertThat(sub.path("usage").path("staff").asLong()).isEqualTo(2);

        // Upgrade: both now work.
        api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + id + "/plan", platform, Map.of("planCode", "STARTER"), 200, Map.of());
        api.post("/api/v1/users", owner, Map.of("mobileNumber", TestData.mobile(), "fullName", "Admin Two"), 201);
        api.post("/api/v1/branches", owner, Map.of("code", "WH1", "name", "Godown", "kind", "WAREHOUSE"), 201);
        assertThat(api.get("/api/v1/subscription", owner, 200).path("data").path("usage").path("branches").asLong()).isEqualTo(2);
        api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + id + "/plan", platform, Map.of("planCode", "NOPE"), 400, Map.of());
        api.get("/api/v1/platform/plans", owner, 403);
    }

    @Test
    void selfSignupIsApprovedIntoANewBusiness() {
        String mobile = TestData.mobile();
        JsonNode otp = api.post("/api/v1/public/signup/otp", null, Map.of("mobileNumber", mobile), 200).path("data");
        Map<String, Object> request = new java.util.HashMap<>(Map.of("requestId", otp.path("requestId").asString(), "otp", api.latestOtp(mobile),
                "mobileNumber", mobile, "businessName", "Sri Murugan Traders", "ownerName", "Murugan", "state", "Tamil Nadu",
                "stateCode", "33", "industry", "CONSTRUCTION", "planCode", "STARTER"));
        String id = api.post("/api/v1/public/signup", null, request, 201).path("data").path("id").asString();
        assertThat(api.get("/api/v1/public/signup/status?mobileNumber=" + mobile.substring(3), null, 200).path("data").path("status").asString()).isEqualTo("PENDING");

        // A wrong OTP and a second pending request are refused.
        JsonNode otp2 = api.post("/api/v1/public/signup/otp", null, Map.of("mobileNumber", mobile), 429);
        assertThat(otp2.path("error").path("code").asString()).isIn("AUTH_OTP_COOLDOWN", "RATE_LIMITED");

        assertThat(api.get("/api/v1/platform/signups?status=PENDING", platform, 200).path("data").findValuesAsString("id")).contains(id);
        JsonNode approved = api.post("/api/v1/platform/signups/" + id + "/approve", platform, Map.of("planCode", "GROWTH"), 200).path("data");
        assertThat(approved.path("status").asString()).isEqualTo("APPROVED");
        String code = approved.path("tenantCode").asString();
        JsonNode tenant = api.get("/api/v1/platform/tenants/" + approved.path("businessId").asString(), platform, 200).path("data");
        assertThat(tenant.path("planCode").asString()).isEqualTo("GROWTH");
        assertThat(tenant.path("industry").asString()).isEqualTo("CONSTRUCTION");
        api.post("/api/v1/platform/signups/" + id + "/approve", platform, Map.of(), 409);

        // The owner signs in to the new business (later, after the sign-up OTP's resend cooldown).
        data.jdbc().update("UPDATE otp_requests SET created_at = created_at - interval '1 hour' WHERE mobile_number = ?", mobile);
        String owner = api.verify(mobile, code).path("accessToken").asString();
        assertThat(api.get("/api/v1/auth/me", owner, 200).path("data").path("role").asString()).isEqualTo("OWNER");

        // Custom domain → the sign-in page finds the business.
        api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + approved.path("businessId").asString() + "/domain", platform,
                Map.of("domain", "murugan-" + code + ".example.com"), 200, Map.of());
        assertThat(api.get("/api/v1/public/tenants/by-host/MURUGAN-" + code + ".example.com", null, 200).path("data").path("tenantCode").asString()).isEqualTo(code);
        assertThat(api.get("/api/v1/public/tenants/by-host/unknown.example.com", null, 200).path("data").path("tenantCode").isMissingNode()).isTrue();
        api.get("/api/v1/platform/signups", owner, 403);
    }

    @Test
    void rejectedSignupDoesNotCreateABusiness() {
        String mobile = TestData.mobile();
        JsonNode otp = api.post("/api/v1/public/signup/otp", null, Map.of("mobileNumber", mobile), 200).path("data");
        api.post("/api/v1/public/signup", null, Map.of("requestId", otp.path("requestId").asString(), "otp", "000000", "mobileNumber", mobile,
                "businessName", "X", "ownerName", "Y", "state", "Tamil Nadu", "stateCode", "33", "industry", "GROCERY"), 401);
        String id = api.post("/api/v1/public/signup", null, Map.of("requestId", otp.path("requestId").asString(), "otp", api.latestOtp(mobile),
                "mobileNumber", mobile, "businessName", "Fake Shop", "ownerName", "Y", "state", "Tamil Nadu", "stateCode", "33",
                "industry", "GROCERY"), 201).path("data").path("id").asString();
        JsonNode rejected = api.post("/api/v1/platform/signups/" + id + "/reject", platform, Map.of("reason", "Could not verify the business"), 200).path("data");
        assertThat(rejected.path("status").asString()).isEqualTo("REJECTED");
        assertThat(rejected.path("businessId").isNull() || rejected.path("businessId").isMissingNode()).isTrue();
    }

    @Test
    void branchesHoldTheirOwnStockAndTransfersMoveIt() {
        String owner = api.login(data.owner());
        api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + TestData.BUSINESS + "/modules", platform, Map.of("modules", Map.of("BRANCHES", true)), 200, Map.of());
        try {
            UUID product = data.product("100.00", "60.00", "18", "20");
            List<JsonNode> branches = new java.util.ArrayList<>();
            api.get("/api/v1/branches", owner, 200).path("data").forEach(branches::add);
            String main = branches.stream().filter(b -> b.path("isDefault").asBoolean()).findFirst().orElseThrow().path("id").asString();
            String code = "W" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
            String wh = api.post("/api/v1/branches", owner, Map.of("code", code, "name", "Godown " + code, "kind", "WAREHOUSE"), 201).path("data").path("id").asString();

            JsonNode transfer = api.post("/api/v1/stock-transfers", owner, Map.of("fromBranchId", main, "toBranchId", wh,
                    "items", List.of(Map.of("productId", product.toString(), "quantity", "8"))), 201).path("data");
            assertThat(transfer.path("transferNumber").asString()).startsWith("ST");
            assertThat(data.onHand(product)).isEqualByComparingTo("20"); // total unchanged
            assertThat(stockAt(owner, wh, product)).isEqualByComparingTo("8");
            assertThat(stockAt(owner, main, product)).isEqualByComparingTo("12");

            // Selling at the warehouse uses its stock only.
            TestCustomer c = data.approvedCustomer();
            Map<String, String> atWarehouse = Map.of("X-Branch-Id", wh);
            JsonNode tooMuch = api.post("/api/v1/invoices", owner, Map.of("customerId", c.id().toString(), "paymentType", "CASH", "generate", true,
                    "items", List.of(Map.of("productId", product.toString(), "quantity", "10"))), 409, atWarehouse);
            assertThat(tooMuch.path("error").path("code").asString()).isEqualTo("INSUFFICIENT_STOCK");
            api.post("/api/v1/invoices", owner, Map.of("customerId", c.id().toString(), "paymentType", "CASH", "generate", true,
                    "items", List.of(Map.of("productId", product.toString(), "quantity", "5"))), 201, atWarehouse);
            assertThat(stockAt(owner, wh, product)).isEqualByComparingTo("3");
            assertThat(stockAt(owner, main, product)).isEqualByComparingTo("12");
            assertThat(data.onHand(product)).isEqualByComparingTo("15");

            // The main branch cannot sell what is at the warehouse.
            api.post("/api/v1/invoices", owner, Map.of("customerId", c.id().toString(), "paymentType", "CASH", "generate", true,
                    "items", List.of(Map.of("productId", product.toString(), "quantity", "13"))), 409);
            // A branch with stock cannot be closed.
            api.exchange(HttpMethod.PUT, "/api/v1/branches/" + wh, owner, Map.of("code", code, "name", "Godown", "active", false), 409, Map.of());
        } finally {
            api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + TestData.BUSINESS + "/modules", platform, Map.of("modules", Map.of("BRANCHES", false)), 200, Map.of());
        }
    }

    private java.math.BigDecimal stockAt(String token, String branch, UUID product) {
        for (JsonNode r : api.get("/api/v1/branches/" + branch + "/stock", token, 200).path("data")) {
            if (r.path("productId").asString().equals(product.toString())) {
                return r.path("onHand").decimalValue();
            }
        }
        return java.math.BigDecimal.ZERO;
    }
}
