package com.shopflow.payments;

import com.shopflow.integrations.payment.MockPaymentGateway;
import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Mock gateway scenarios (§0A, §110): success, failure, duplicate, out-of-order, invalid signature, partial, refund. */
class OnlinePaymentIntegrationTest extends IntegrationTest {

    @Autowired
    MockPaymentGateway gateway;

    private record Ctx(String cust, String admin, TestData.TestCustomer customer, JsonNode order) {
    }

    private Ctx onlineOrder() {
        TestData.TestCustomer c = data.approvedCustomer();
        String cust = api.login(c.mobile());
        UUID product = data.product("100.00", "60.00", "0", "10");
        JsonNode order = api.post("/api/v1/orders", cust, Map.of("paymentMethod", "ONLINE",
                "items", List.of(Map.of("productId", product.toString(), "quantity", "2"))), 201).path("data");
        return new Ctx(cust, api.login(data.admin()), c, order);
    }

    private List<String> simulate(JsonNode order, String outcome) {
        String paymentId = order.path("paymentIntent").path("paymentId").asString();
        JsonNode r = api.post("/api/v1/dev/payments/" + paymentId + "/simulate", null, Map.of("outcome", outcome), 200).path("data");
        return api.mapper().convertValue(r.path("webhookResults"), List.class);
    }

    private JsonNode reload(Ctx ctx) {
        return api.get("/api/v1/orders/" + ctx.order().path("id").asString(), ctx.cust(), 200).path("data");
    }

    @Test
    void successCapturesAndPostsLedger() {
        Ctx ctx = onlineOrder();
        assertThat(ctx.order().path("paymentIntent").path("status").asString()).isEqualTo("UNPAID");
        assertThat(simulate(ctx.order(), "SUCCESS")).containsExactly("AUTHORIZED", "CAPTURED");
        assertThat(reload(ctx).path("paymentStatus").asString()).isEqualTo("PAID");
        assertThat(data.ledgerBalance(ctx.customer().id())).isEqualByComparingTo("-200.00");
        // Once invoiced, the prepayment is applied automatically.
        String id = ctx.order().path("id").asString();
        api.post("/api/v1/orders/" + id + "/accept", ctx.admin(), null, 200);
        JsonNode inv = api.post("/api/v1/invoices", ctx.admin(), Map.of("orderId", id, "generate", true), 201).path("data");
        assertThat(inv.path("status").asString()).isEqualTo("PAID");
        assertThat(data.ledgerBalance(ctx.customer().id())).isEqualByComparingTo("0");
    }

    @Test
    void duplicateAndOutOfOrderWebhooksAreIgnored() {
        Ctx a = onlineOrder();
        assertThat(simulate(a.order(), "DUPLICATE_WEBHOOK")).containsExactly("CAPTURED", "DUPLICATE");
        assertThat(data.ledgerBalance(a.customer().id())).isEqualByComparingTo("-200.00");

        Ctx b = onlineOrder();
        List<String> results = simulate(b.order(), "OUT_OF_ORDER");
        assertThat(results.getFirst()).isEqualTo("CAPTURED");
        assertThat(results.get(1)).startsWith("IGNORED_STALE");
        assertThat(reload(b).path("paymentStatus").asString()).isEqualTo("PAID");
    }

    @Test
    void failedPaymentLeavesOrderRetryable() {
        Ctx ctx = onlineOrder();
        assertThat(simulate(ctx.order(), "FAILED")).containsExactly("FAILED");
        assertThat(reload(ctx).path("paymentStatus").asString()).isEqualTo("FAILED");
        JsonNode retry = api.post("/api/v1/orders/" + ctx.order().path("id").asString() + "/payment-intent", ctx.cust(), null, 200).path("data");
        assertThat(retry.path("paymentId").asString()).isNotEqualTo(ctx.order().path("paymentIntent").path("paymentId").asString());
    }

    @Test
    void invalidSignatureIsRejectedAndRecorded() {
        Ctx ctx = onlineOrder();
        assertThat(simulate(ctx.order(), "INVALID_SIGNATURE")).containsExactly("WEBHOOK_SIGNATURE_INVALID");
        assertThat(reload(ctx).path("paymentStatus").asString()).isEqualTo("PENDING");
        Integer rejected = data.jdbc().queryForObject("SELECT COUNT(*) FROM payment_gateway_events WHERE processing_status = 'REJECTED' AND provider_order_id = ?",
                Integer.class, ctx.order().path("paymentIntent").path("providerOrderId").asString());
        assertThat(rejected).isEqualTo(1);
    }

    @Test
    void partialCaptureAndTimeoutKeepOrderConsistent() {
        Ctx partial = onlineOrder();
        assertThat(simulate(partial.order(), "PARTIAL")).containsExactly("CAPTURED");
        JsonNode o = reload(partial);
        assertThat(o.path("paymentStatus").asString()).isEqualTo("PARTIALLY_PAID");
        assertThat(o.path("balanceDue").decimalValue()).isEqualByComparingTo("100.00");

        Ctx timeout = onlineOrder();
        assertThat(simulate(timeout.order(), "TIMEOUT")).isEmpty();
        assertThat(reload(timeout).path("paymentStatus").asString()).isEqualTo("PENDING");
    }

    @Test
    void clientSignatureIsVerifiedButDoesNotCapture() {
        Ctx ctx = onlineOrder();
        String paymentId = ctx.order().path("paymentIntent").path("paymentId").asString();
        String providerOrderId = ctx.order().path("paymentIntent").path("providerOrderId").asString();
        String providerPaymentId = gateway.paymentIdFor(providerOrderId);
        api.post("/api/v1/payments/" + paymentId + "/verify", ctx.cust(), Map.of("providerPaymentId", providerPaymentId, "signature", "forged"), 400);
        JsonNode p = api.post("/api/v1/payments/" + paymentId + "/verify", ctx.cust(), Map.of("providerPaymentId", providerPaymentId,
                "signature", gateway.clientSignature(providerOrderId, providerPaymentId)), 200).path("data");
        assertThat(p.path("status").asString()).isEqualTo("PENDING");
        assertThat(reload(ctx).path("paymentStatus").asString()).isNotEqualTo("PAID");
    }

    @Test
    void rejectingAPaidOrderRefundsThroughTheGateway() {
        Ctx ctx = onlineOrder();
        simulate(ctx.order(), "SUCCESS");
        api.post("/api/v1/orders/" + ctx.order().path("id").asString() + "/reject", ctx.admin(), Map.of("reason", "Out of delivery area"), 200);
        JsonNode o = reload(ctx);
        assertThat(o.path("status").asString()).isEqualTo("REJECTED");
        assertThat(o.path("paymentStatus").asString()).isEqualTo("REFUNDED");
        assertThat(data.ledgerBalance(ctx.customer().id())).isEqualByComparingTo("0");
    }
}
