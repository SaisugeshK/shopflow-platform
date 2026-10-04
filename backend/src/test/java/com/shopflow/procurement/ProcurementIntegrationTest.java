package com.shopflow.procurement;

import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Purchase orders and the supplier portal (architecture §0B.8, Phase 3): send → supplier quotes (edits lines, marks
 * unavailable, adds a line) → counter → quote → accept selected lines → partial and final goods receipts that post
 * purchases (stock + supplier ledger) — with supplier visibility limited to their own orders.
 */
class ProcurementIntegrationTest extends IntegrationTest {

    private String owner;
    private String platform;
    private UUID category;

    @BeforeEach
    void setUp() {
        String admin = TestData.mobile();
        data.platformAdmin(admin);
        platform = api.login(admin);
        owner = api.login(data.owner());
        category = data.category();
        modules(Map.of("PURCHASE_ORDERS", true, "SUPPLIER_PORTAL", true));
    }

    private void modules(Map<String, Boolean> switches) {
        api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + TestData.BUSINESS + "/modules", platform, Map.of("modules", switches), 200, Map.of());
    }

    private UUID product(String name) {
        return UUID.fromString(api.post("/api/v1/products", owner, Map.of("name", name + " " + UUID.randomUUID().toString().substring(0, 5),
                "categoryId", category.toString(), "unit", "PCS", "purchasePrice", "40.00", "sellingPrice", "60.00", "gstRate", "18"), 201)
                .path("data").path("id").asString());
    }

    private String supplierLogin(UUID supplier) {
        String mobile = TestData.mobile();
        JsonNode access = api.post("/api/v1/suppliers/" + supplier + "/portal-access", owner, Map.of("mobileNumber", mobile.substring(3)), 200).path("data");
        assertThat(access.path("enabled").asBoolean()).isTrue();
        return api.login(mobile);
    }

    private static JsonNode line(JsonNode po, int number) {
        for (JsonNode l : po.path("lines")) {
            if (l.path("lineNumber").asInt() == number) {
                return l;
            }
        }
        throw new AssertionError("no line " + number);
    }

    private BigDecimal onHand(UUID product) {
        return api.get("/api/v1/products/" + product, owner, 200).path("data").path("onHand").decimalValue();
    }

    @Test
    void fullQuotationRoundsAndGoodsReceipts() {
        UUID supplier = data.supplier("33");
        String supplierToken = supplierLogin(supplier);
        UUID rice = product("PO Rice");
        UUID dal = product("PO Dal");
        UUID oil = product("PO Oil");

        JsonNode po = api.post("/api/v1/purchase-orders", owner, Map.of("supplierId", supplier.toString(), "send", true, "lines", List.of(
                Map.of("productId", rice.toString(), "quantity", "10", "rate", "40"),
                Map.of("productId", dal.toString(), "quantity", "5", "rate", "90"))), 201).path("data");
        String id = po.path("id").asString();
        assertThat(po.path("status").asString()).isEqualTo("SENT");
        assertThat(po.path("revisions")).hasSize(1);

        // The supplier signs in and sees only their order, not the business's other data.
        JsonNode me = api.get("/api/v1/auth/me", supplierToken, 200).path("data");
        assertThat(me.path("role").asString()).isEqualTo("SUPPLIER");
        assertThat(me.path("supplier").path("id").asString()).isEqualTo(supplier.toString());
        api.get("/api/v1/products", supplierToken, 403);
        api.get("/api/v1/purchase-orders", supplierToken, 403);
        assertThat(api.get("/api/v1/supplier-portal/purchase-orders", supplierToken, 200).path("data").findValuesAsString("id")).contains(id);

        // Round 1: supplier raises a rate, marks dal unavailable and adds oil as an extra line.
        JsonNode quoted = api.exchange(HttpMethod.PUT, "/api/v1/supplier-portal/purchase-orders/" + id + "/quote", supplierToken, Map.of(
                "lines", List.of(Map.of("lineId", line(po, 1).path("id").asString(), "rate", "42", "deliveryDate", "2030-01-10", "note", "New crop"),
                        Map.of("lineId", line(po, 2).path("id").asString(), "availability", "UNAVAILABLE", "substituteNote", "Can send moong dal")),
                "extraLines", List.of(Map.of("description", "Groundnut oil 1L", "quantity", "4", "rate", "150", "taxRate", "5")),
                "quoteValidUntil", "2030-12-31", "note", "Prices valid this month"), 200, Map.of()).path("data");
        assertThat(quoted.path("status").asString()).isEqualTo("QUOTED");
        assertThat(quoted.path("lines")).hasSize(3);
        assertThat(line(quoted, 2).path("lineTotal").decimalValue()).isEqualByComparingTo("0"); // unavailable lines are not counted
        assertThat(line(quoted, 3).path("addedBy").asString()).isEqualTo("SUPPLIER");

        // Round 2: the business counters the rate; the supplier meets it.
        JsonNode countered = api.exchange(HttpMethod.PUT, "/api/v1/purchase-orders/" + id + "/counter", owner, Map.of(
                "lines", List.of(Map.of("lineId", line(po, 1).path("id").asString(), "rate", "41")), "note", "Best we can do"), 200, Map.of()).path("data");
        assertThat(countered.path("status").asString()).isEqualTo("COUNTERED");
        api.post("/api/v1/purchase-orders/" + id + "/accept", owner, Map.of(), 409); // waiting for the supplier
        JsonNode requoted = api.exchange(HttpMethod.PUT, "/api/v1/supplier-portal/purchase-orders/" + id + "/quote", supplierToken,
                Map.of("note", "OK at 41"), 200, Map.of()).path("data");
        assertThat(line(requoted, 1).path("rate").decimalValue()).isEqualByComparingTo("41");

        // Accept: rice + the extra oil line (linked to our product); dal is unavailable and gets rejected.
        JsonNode accepted = api.post("/api/v1/purchase-orders/" + id + "/accept", owner, Map.of(
                "productLinks", Map.of(line(po, 1).path("id").asString(), rice.toString(), line(quoted, 3).path("id").asString(), oil.toString())), 200).path("data");
        assertThat(accepted.path("status").asString()).isEqualTo("ACCEPTED");
        assertThat(line(accepted, 1).path("status").asString()).isEqualTo("ACCEPTED");
        assertThat(line(accepted, 2).path("status").asString()).isEqualTo("REJECTED");
        assertThat(line(accepted, 3).path("status").asString()).isEqualTo("ACCEPTED");
        assertThat(accepted.path("revisions").size()).isEqualTo(5); // sent, quoted, countered, quoted, accepted
        assertThat(accepted.path("revisions").get(1).path("snapshot").path("lines")).hasSize(3);

        // Partial delivery: 6 rice arrive, 1 damaged and at a different rate → flagged; stock +5.
        Map<String, Object> first = new HashMap<>(Map.of("supplierInvoiceNumber", "SUP-INV-1", "lines", List.of(
                Map.of("poLineId", line(accepted, 1).path("id").asString(), "receivedQuantity", "6", "damagedQuantity", "1", "rate", "41.50"))));
        JsonNode partly = api.post("/api/v1/purchase-orders/" + id + "/receipts", owner, first, 201).path("data");
        assertThat(partly.path("status").asString()).isEqualTo("PARTIALLY_RECEIVED");
        assertThat(partly.path("receipts").get(0).path("hasMismatch").asBoolean()).isTrue();
        assertThat(partly.path("receipts").get(0).path("purchaseNumber").asString()).isNotBlank();
        assertThat(onHand(rice)).isEqualByComparingTo("5");

        JsonNode done = api.post("/api/v1/purchase-orders/" + id + "/receipts", owner, Map.of("lines", List.of(
                Map.of("poLineId", line(accepted, 1).path("id").asString(), "receivedQuantity", "5"),
                Map.of("poLineId", line(accepted, 3).path("id").asString(), "receivedQuantity", "4"))), 201).path("data");
        assertThat(done.path("status").asString()).isEqualTo("RECEIVED");
        assertThat(onHand(rice)).isEqualByComparingTo("10");
        assertThat(onHand(oil)).isEqualByComparingTo("4");
        assertThat(api.get("/api/v1/supplier-portal/deliveries", supplierToken, 200).path("data")).hasSize(2);
        api.exchange(HttpMethod.PUT, "/api/v1/supplier-portal/purchase-orders/" + id + "/quote", supplierToken, Map.of("note", "late"), 409, Map.of());
    }

    @Test
    void suppliersOnlySeeTheirOwnOrdersAndModulesGateThePortal() {
        UUID supplierA = data.supplier("33");
        UUID supplierB = data.supplier("29");
        String tokenA = supplierLogin(supplierA);
        String tokenB = supplierLogin(supplierB);
        UUID p = product("PO Soap");
        String id = api.post("/api/v1/purchase-orders", owner, Map.of("supplierId", supplierA.toString(), "lines",
                List.of(Map.of("productId", p.toString(), "quantity", "3"))), 201).path("data").path("id").asString();

        // A draft is invisible to the supplier until sent.
        api.get("/api/v1/supplier-portal/purchase-orders/" + id, tokenA, 404);
        api.post("/api/v1/purchase-orders/" + id + "/send", owner, null, 200);
        api.get("/api/v1/supplier-portal/purchase-orders/" + id, tokenA, 200);
        api.get("/api/v1/supplier-portal/purchase-orders/" + id, tokenB, 404);
        assertThat(api.get("/api/v1/supplier-portal/purchase-orders", tokenB, 200).path("data").findValuesAsString("id")).doesNotContain(id);

        // Supplier declines; switching the portal off blocks supplier logins.
        assertThat(api.post("/api/v1/supplier-portal/purchase-orders/" + id + "/decline", tokenA, Map.of("reason", "Out of stock"), 200)
                .path("data").path("status").asString()).isEqualTo("REJECTED");
        modules(Map.of("SUPPLIER_PORTAL", false));
        assertThat(api.get("/api/v1/supplier-portal/purchase-orders", tokenA, 403).path("error").path("code").asString()).isEqualTo("MODULE_DISABLED");
        modules(Map.of("PURCHASE_ORDERS", false));
        assertThat(api.get("/api/v1/purchase-orders", owner, 403).path("error").path("code").asString()).isEqualTo("MODULE_DISABLED");
        modules(Map.of("PURCHASE_ORDERS", true, "SUPPLIER_PORTAL", true));

        // Turning a supplier's login off ends its sessions.
        api.exchange(HttpMethod.DELETE, "/api/v1/suppliers/" + supplierB + "/portal-access", owner, null, 200, Map.of());
        api.get("/api/v1/auth/me", tokenB, 401);
    }
}
