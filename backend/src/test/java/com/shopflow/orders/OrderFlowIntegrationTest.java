package com.shopflow.orders;

import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/** Customer ordering, stock reservation, invoicing, delivery, credit rules and concurrency (§7, §10, §20, §76). */
class OrderFlowIntegrationTest extends IntegrationTest {

    private JsonNode placeOrder(String token, UUID productId, String qty, String method, int expected) {
        return api.post("/api/v1/orders", token, Map.of("paymentMethod", method,
                "items", List.of(Map.of("productId", productId.toString(), "quantity", qty))), expected);
    }

    @Test
    void fullOrderLifecycleWithPartialDelivery() {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        String cust = api.login(c.mobile());
        UUID product = data.product("200.00", "150.00", "5", "20");

        JsonNode order = placeOrder(cust, product, "10", "CREDIT", 201).path("data");
        assertThat(order.path("status").asString()).isEqualTo("PLACED");
        assertThat(order.path("grandTotal").decimalValue()).isEqualByComparingTo("2100.00");
        assertThat(data.reserved(product)).isEqualByComparingTo("10");
        String id = order.path("id").asString();
        String itemId = order.path("items").get(0).path("id").asString();

        api.post("/api/v1/orders/" + id + "/packing", admin, null, 409); // cannot skip ACCEPTED
        api.post("/api/v1/orders/" + id + "/accept", admin, Map.of("items", List.of(Map.of("orderItemId", itemId, "acceptedQuantity", "8"))), 200);
        assertThat(data.reserved(product)).isEqualByComparingTo("8");

        JsonNode invoice = api.post("/api/v1/invoices", admin, Map.of("orderId", id, "generate", true), 201).path("data");
        assertThat(invoice.path("grandTotal").decimalValue()).isEqualByComparingTo("1680.00");
        assertThat(invoice.path("invoiceNumber").asString()).matches("INV/\\d{4}-\\d{2}/\\d{6}");
        assertThat(data.ledgerBalance(c.id())).isEqualByComparingTo("1680.00");
        // Nothing left to bill: a second invoice is refused (never double-bill).
        api.post("/api/v1/invoices", admin, Map.of("orderId", id, "generate", true), 422);

        api.post("/api/v1/orders/" + id + "/packing", admin, null, 200);
        api.post("/api/v1/orders/" + id + "/ready-for-delivery", admin, null, 200);
        api.post("/api/v1/orders/" + id + "/out-for-delivery", admin, Map.of("deliveryPerson", "Ravi"), 200);
        api.post("/api/v1/orders/" + id + "/deliver", admin, Map.of("items", List.of(Map.of("orderItemId", itemId, "deliveredQuantity", "6"))), 200);

        assertThat(data.onHand(product)).isEqualByComparingTo("14");
        assertThat(data.reserved(product)).isEqualByComparingTo("0");
        JsonNode inv = api.get("/api/v1/invoices/" + invoice.path("id").asString(), admin, 200).path("data");
        assertThat(inv.path("creditedAmount").decimalValue()).isEqualByComparingTo("420.00"); // 2 short x 210
        assertThat(data.ledgerBalance(c.id())).isEqualByComparingTo("1260.00");

        JsonNode history = api.get("/api/v1/orders/" + id + "/status-history", cust, 200).path("data");
        assertThat(history.size()).isEqualTo(6);
        api.post("/api/v1/orders/" + id + "/complete", admin, null, 200);
    }

    @Test
    void insufficientStockIsRejected() {
        TestData.TestCustomer c = data.approvedCustomer();
        String cust = api.login(c.mobile());
        UUID product = data.product("50.00", "40.00", "18", "3");
        JsonNode err = placeOrder(cust, product, "4", "CASH", 409);
        assertThat(err.path("error").path("code").asString()).isEqualTo("INSUFFICIENT_STOCK");
    }

    @Test
    void creditLimitPolicies() {
        String owner = api.login(data.owner());
        TestData.TestCustomer c = data.customer("APPROVED", true, new BigDecimal("1000"), "33");
        String cust = api.login(c.mobile());
        UUID product = data.product("500.00", "400.00", "0", "100");

        // Default policy REQUIRE_ADMIN_APPROVAL: over-limit order waits for approval.
        JsonNode pending = placeOrder(cust, product, "3", "CREDIT", 201).path("data");
        assertThat(pending.path("creditApprovalStatus").asString()).isEqualTo("PENDING");

        api.patch("/api/v1/business/settings", owner, Map.of("creditPolicy", "BLOCK"), 200);
        try {
            JsonNode blocked = placeOrder(cust, product, "3", "CREDIT", 422);
            assertThat(blocked.path("error").path("code").asString()).isEqualTo("CREDIT_LIMIT_EXCEEDED");
            placeOrder(cust, product, "1", "CASH", 201);
        } finally {
            api.patch("/api/v1/business/settings", owner, Map.of("creditPolicy", "REQUIRE_ADMIN_APPROVAL"), 200);
        }

        TestData.TestCustomer noCredit = data.customer("APPROVED", false, BigDecimal.ZERO, "33");
        JsonNode err = placeOrder(api.login(noCredit.mobile()), product, "1", "CREDIT", 422);
        assertThat(err.path("error").path("code").asString()).isEqualTo("CREDIT_NOT_ENABLED");
    }

    @Test
    void customerCancellationWindowAndStockRelease() {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        String cust = api.login(c.mobile());
        UUID product = data.product("10.00", "8.00", "5", "10");

        JsonNode o1 = placeOrder(cust, product, "4", "CASH", 201).path("data");
        api.post("/api/v1/orders/" + o1.path("id").asString() + "/cancel", cust, Map.of("reason", "Not needed"), 200);
        assertThat(data.reserved(product)).isEqualByComparingTo("0");

        JsonNode o2 = placeOrder(cust, product, "2", "CASH", 201).path("data");
        String id2 = o2.path("id").asString();
        api.post("/api/v1/orders/" + id2 + "/accept", admin, null, 200);
        api.post("/api/v1/orders/" + id2 + "/packing", admin, null, 200);
        JsonNode err = api.post("/api/v1/orders/" + id2 + "/cancel", cust, Map.of("reason", "late"), 409);
        assertThat(err.path("error").path("code").asString()).isEqualTo("ORDER_CANNOT_CANCEL");
        api.post("/api/v1/orders/" + id2 + "/cancel", admin, Map.of("reason", "Customer called"), 200);
        assertThat(data.reserved(product)).isEqualByComparingTo("0");
    }

    @Test
    void customersCannotSeeOtherCustomersOrders() {
        TestData.TestCustomer a = data.approvedCustomer();
        TestData.TestCustomer b = data.approvedCustomer();
        UUID product = data.product("10.00", "8.00", "5", "10");
        JsonNode order = placeOrder(api.login(a.mobile()), product, "1", "CASH", 201).path("data");
        String other = api.login(b.mobile());
        api.get("/api/v1/orders/" + order.path("id").asString(), other, 404);
        JsonNode list = api.get("/api/v1/orders", other, 200);
        list.path("data").forEach(o -> assertThat(o.path("customerId").asString()).isEqualTo(b.id().toString()));
    }

    @Test
    void idempotencyKeyPreventsDuplicateOrders() {
        TestData.TestCustomer c = data.approvedCustomer();
        String cust = api.login(c.mobile());
        UUID product = data.product("10.00", "8.00", "5", "10");
        Map<String, String> headers = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        Map<String, Object> body = Map.of("paymentMethod", "CASH", "items", List.of(Map.of("productId", product.toString(), "quantity", "1")));
        String first = api.post("/api/v1/orders", cust, body, 201, headers).path("data").path("id").asString();
        String second = api.post("/api/v1/orders", cust, body, 201, headers).path("data").path("id").asString();
        assertThat(second).isEqualTo(first);
        assertThat(data.reserved(product)).isEqualByComparingTo("1");
    }

    @Test
    void concurrentOrdersNeverOversellStock() throws Exception {
        UUID product = data.product("10.00", "8.00", "5", "5");
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            tokens.add(api.login(data.approvedCustomer().mobile()));
        }
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Callable<Boolean>> tasks = new ArrayList<>();
        for (String t : tokens) {
            tasks.add(() -> {
                try {
                    placeOrder(t, product, "1", "CASH", 201);
                    return true;
                } catch (AssertionError e) {
                    return false;
                }
            });
        }
        int placed = 0;
        for (Future<Boolean> f : pool.invokeAll(tasks)) {
            if (f.get()) {
                placed++;
            }
        }
        pool.shutdown();
        assertThat(placed).isEqualTo(5);
        assertThat(data.reserved(product)).isEqualByComparingTo("5");
        assertThat(data.onHand(product)).isEqualByComparingTo("5");
    }
}
