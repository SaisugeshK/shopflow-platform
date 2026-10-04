package com.shopflow.trade;

import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import com.shopflow.support.TestData.TestCustomer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Trade documents (architecture §0B.9, Phase 4): quotations that become orders at the quoted rates, delivery challans
 * that move stock once (issue / cancel / invoice), e-way bills, job work, agent commission and project statements —
 * each behind its module.
 */
class TradeDocumentsIntegrationTest extends IntegrationTest {

    private String owner;
    private String platform;

    @BeforeEach
    void setUp() {
        String admin = TestData.mobile();
        data.platformAdmin(admin);
        platform = api.login(admin);
        owner = api.login(data.owner());
        modules(Map.of("QUOTATIONS", true, "DELIVERY_CHALLAN", true, "EWAY_BILL", true, "JOB_WORK", true,
                "COMMISSION", true, "PROJECT_ACCOUNTS", true));
    }

    private void modules(Map<String, Boolean> switches) {
        api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + TestData.BUSINESS + "/modules", platform, Map.of("modules", switches), 200, Map.of());
    }

    @Test
    void quotationIsAcceptedByTheCustomerAndBecomesAnOrderAtQuotedRates() {
        TestCustomer customer = data.approvedCustomer();
        UUID product = data.product("100.00", "60.00", "18", "50");
        UUID project = UUID.fromString(api.post("/api/v1/projects", owner, Map.of("customerId", customer.id().toString(),
                "name", "Anna Nagar site", "siteAddress", "Plot 4"), 201).path("data").path("id").asString());

        JsonNode q = api.post("/api/v1/quotations", owner, Map.of("customerId", customer.id().toString(), "projectId", project.toString(),
                "validUntil", "2099-12-31", "items", List.of(Map.of("productId", product.toString(), "quantity", "10", "rate", "90",
                        "discountPercent", "10"))), 201).path("data");
        String id = q.path("id").asString();
        assertThat(q.path("status").asString()).isEqualTo("DRAFT");
        assertThat(q.path("taxableTotal").decimalValue()).isEqualByComparingTo("810.00"); // 10 × 90 − 10%
        assertThat(q.path("grandTotal").decimalValue()).isEqualByComparingTo("956.00"); // 955.80 rounded off

        String customerToken = api.login(customer.mobile());
        // Drafts are invisible to the customer.
        assertThat(api.get("/api/v1/my/quotations", customerToken, 200).path("data").findValuesAsString("id")).doesNotContain(id);
        api.post("/api/v1/my/quotations/" + id + "/accept", customerToken, Map.of("paymentMethod", "CREDIT"), 404);

        api.post("/api/v1/quotations/" + id + "/send", owner, null, 200);
        JsonNode accepted = api.post("/api/v1/my/quotations/" + id + "/accept", customerToken, Map.of("paymentMethod", "CREDIT"), 200).path("data");
        assertThat(accepted.path("status").asString()).isEqualTo("CONVERTED");
        String orderId = accepted.path("orderId").asString();
        JsonNode order = api.get("/api/v1/orders/" + orderId, owner, 200).path("data");
        assertThat(order.path("grandTotal").decimalValue()).isEqualByComparingTo("956.00");
        assertThat(data.jdbc().queryForObject("SELECT project_id FROM orders WHERE id = ?", UUID.class, UUID.fromString(orderId))).isEqualTo(project);
        // Accepting twice does nothing.
        api.post("/api/v1/my/quotations/" + id + "/accept", customerToken, Map.of("paymentMethod", "CREDIT"), 409);

        // Another customer cannot see it.
        String other = api.login(data.approvedCustomer().mobile());
        api.get("/api/v1/my/quotations/" + id, other, 404);

        // Customers see their own projects.
        assertThat(api.get("/api/v1/my/projects", customerToken, 200).path("data").findValuesAsString("id")).contains(project.toString());
        api.get("/api/v1/my/projects/" + project + "/statement", other, 404);
    }

    @Test
    void challanMovesStockOnceAndItsInvoiceDoesNotMoveItAgain() {
        TestCustomer customer = data.approvedCustomer();
        UUID product = data.product("50.00", "30.00", "5", "20");

        JsonNode dc = api.post("/api/v1/delivery-challans", owner, Map.of("customerId", customer.id().toString(), "vehicleNumber", "tn01ab1234",
                "items", List.of(Map.of("productId", product.toString(), "quantity", "8"))), 201).path("data");
        assertThat(dc.path("status").asString()).isEqualTo("ISSUED");
        assertThat(dc.path("totalValue").decimalValue()).isEqualByComparingTo("400.00");
        assertThat(dc.path("vehicleNumber").asString()).isEqualTo("TN01AB1234");
        assertThat(data.onHand(product)).isEqualByComparingTo("12");

        // Cancel a second challan: the stock comes back.
        String second = api.post("/api/v1/delivery-challans", owner, Map.of("customerId", customer.id().toString(),
                "items", List.of(Map.of("productId", product.toString(), "quantity", "2"))), 201).path("data").path("id").asString();
        assertThat(data.onHand(product)).isEqualByComparingTo("10");
        api.post("/api/v1/delivery-challans/" + second + "/cancel", owner, Map.of("reason", "Wrong lorry"), 200);
        assertThat(data.onHand(product)).isEqualByComparingTo("12");

        JsonNode billed = api.post("/api/v1/delivery-challans/" + dc.path("id").asString() + "/invoice", owner,
                Map.of("paymentType", "CREDIT"), 201).path("data");
        String invoiceId = billed.path("invoiceId").asString();
        assertThat(data.onHand(product)).isEqualByComparingTo("12"); // not moved again
        JsonNode invoice = api.get("/api/v1/invoices/" + invoiceId, owner, 200).path("data");
        assertThat(invoice.path("source").asString()).isEqualTo("CHALLAN");
        assertThat(invoice.path("taxableTotal").decimalValue()).isEqualByComparingTo("400.00");
        assertThat(invoice.path("trade").path("challanNumber").asString()).isEqualTo(dc.path("challanNumber").asString());
        assertThat(api.get("/api/v1/delivery-challans/" + dc.path("id").asString(), owner, 200).path("data").path("status").asString()).isEqualTo("INVOICED");
        api.post("/api/v1/delivery-challans/" + dc.path("id").asString() + "/cancel", owner, Map.of("reason", "x"), 409);

        // E-way bill: 450 km → 3 days, test number.
        JsonNode eway = api.post("/api/v1/invoices/" + invoiceId + "/eway-bill", owner, Map.of("distanceKm", 450), 200).path("data");
        assertThat(eway.path("ewayBillNumber").asString()).hasSize(12);
        assertThat(eway.path("ewayTestOnly").asBoolean()).isTrue();
        api.post("/api/v1/invoices/" + invoiceId + "/eway-bill", owner, Map.of("distanceKm", 10), 409);

        // Cancelling the challan's invoice leaves the goods with the customer and reopens the challan.
        api.post("/api/v1/invoices/" + invoiceId + "/cancel", owner, Map.of("reason", "Wrong rate"), 200);
        assertThat(data.onHand(product)).isEqualByComparingTo("12");
        assertThat(api.get("/api/v1/delivery-challans/" + dc.path("id").asString(), owner, 200).path("data").path("status").asString()).isEqualTo("ISSUED");

        modules(Map.of("DELIVERY_CHALLAN", false, "EWAY_BILL", false));
        assertThat(api.get("/api/v1/delivery-challans", owner, 403).path("error").path("code").asString()).isEqualTo("MODULE_DISABLED");
        api.post("/api/v1/invoices/" + invoiceId + "/eway-bill", owner, Map.of("distanceKm", 10), 403);
    }

    @Test
    void jobWorkIssuesAndReceivesStock() {
        UUID fabric = data.product("200.00", "150.00", "5", "100");
        UUID dyed = data.product("300.00", "220.00", "5", "0");
        JsonNode job = api.post("/api/v1/job-work", owner, Map.of("jobWorkerName", "Sri Dyeing", "process", "Dyeing",
                "items", List.of(Map.of("productId", fabric.toString(), "quantity", "40"))), 201).path("data");
        String id = job.path("id").asString();
        assertThat(job.path("status").asString()).isEqualTo("OPEN");
        assertThat(data.onHand(fabric)).isEqualByComparingTo("60");

        JsonNode partly = api.post("/api/v1/job-work/" + id + "/receive", owner, Map.of(
                "finished", List.of(Map.of("productId", dyed.toString(), "quantity", "30")),
                "consumed", List.of(Map.of("productId", fabric.toString(), "quantity", "30")), "charges", "1500"), 200).path("data");
        assertThat(partly.path("status").asString()).isEqualTo("PARTIAL");
        assertThat(data.onHand(dyed)).isEqualByComparingTo("30");
        // Cannot return more than is still out.
        api.post("/api/v1/job-work/" + id + "/receive", owner, Map.of("returned", List.of(Map.of("productId", fabric.toString(), "quantity", "11"))), 400);

        JsonNode closed = api.post("/api/v1/job-work/" + id + "/receive", owner, Map.of(
                "returned", List.of(Map.of("productId", fabric.toString(), "quantity", "10"))), 200).path("data");
        assertThat(closed.path("status").asString()).isEqualTo("CLOSED");
        assertThat(closed.path("charges").decimalValue()).isEqualByComparingTo("1500");
        assertThat(data.onHand(fabric)).isEqualByComparingTo("70");
    }

    @Test
    void agentEarnsCommissionOnGeneratedInvoices() {
        TestCustomer customer = data.approvedCustomer();
        UUID product = data.product("100.00", "60.00", "18", "50");
        String agent = api.post("/api/v1/commissions/agents", owner, Map.of("name", "Ravi Broker", "mobileNumber", "9876501234",
                "commissionPercent", "2.5"), 201).path("data").path("id").asString();
        api.exchange(HttpMethod.PUT, "/api/v1/commissions/customers/" + customer.id() + "/agent", owner, Map.of("agentId", agent), 200, Map.of());

        Map<String, Object> invoice = new HashMap<>(Map.of("customerId", customer.id().toString(), "paymentType", "CREDIT", "generate", true,
                "items", List.of(Map.of("productId", product.toString(), "quantity", "4"))));
        String invoiceId = api.post("/api/v1/invoices", owner, invoice, 201).path("data").path("id").asString();
        JsonNode trade = api.get("/api/v1/invoices/" + invoiceId, owner, 200).path("data").path("trade");
        assertThat(trade.path("commissionAmount").decimalValue()).isEqualByComparingTo("10.00"); // 2.5% of 400
        assertThat(trade.path("agentName").asString()).isEqualTo("Ravi Broker");
        // The customer never sees the commission.
        JsonNode mine = api.get("/api/v1/invoices/" + invoiceId, api.login(customer.mobile()), 200).path("data").path("trade");
        assertThat(mine.path("commissionAmount").isMissingNode() || mine.path("commissionAmount").isNull()).isTrue();

        JsonNode report = api.get("/api/v1/commissions/report?agentId=" + agent + "&status=PENDING", owner, 200).path("data");
        assertThat(report.path("pending").decimalValue()).isEqualByComparingTo("10.00");
        api.post("/api/v1/commissions/pay", owner, Map.of("invoiceIds", List.of(invoiceId)), 200);
        assertThat(api.get("/api/v1/commissions/agents", owner, 200).path("data").get(0).path("paidCommission").decimalValue()).isEqualByComparingTo("10.00");
        api.post("/api/v1/commissions/pay", owner, Map.of("invoiceIds", List.of(invoiceId)), 409);

        modules(Map.of("COMMISSION", false));
        api.get("/api/v1/commissions/agents", owner, 403);
    }
}
