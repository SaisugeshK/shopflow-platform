package com.shopflow.billing;

import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/** Admin-created invoices, numbering, cancellation, payments, credit notes, PDFs and returns (§22–§31, §17). */
class BillingIntegrationTest extends IntegrationTest {

    private JsonNode manualInvoice(String token, UUID customerId, UUID productId, String qty, String paymentType, boolean generate) {
        return api.post("/api/v1/invoices", token, Map.of("customerId", customerId.toString(), "paymentType", paymentType,
                "generate", generate, "items", List.of(Map.of("productId", productId.toString(), "quantity", qty))), 201).path("data");
    }

    @Test
    void manualInterStateInvoiceUsesIgstAndPostsStockAndLedger() {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.customer("APPROVED", true, new BigDecimal("100000"), "29");
        UUID product = data.product("100.00", "70.00", "12", "10");

        JsonNode inv = manualInvoice(admin, c.id(), product, "3", "CREDIT", true);
        assertThat(inv.path("interState").asBoolean()).isTrue();
        assertThat(inv.path("igstTotal").decimalValue()).isEqualByComparingTo("36.00");
        assertThat(inv.path("cgstTotal").decimalValue()).isEqualByComparingTo("0");
        assertThat(inv.path("grandTotal").decimalValue()).isEqualByComparingTo("336.00");
        assertThat(inv.path("status").asString()).isEqualTo("CREDIT");
        assertThat(inv.path("amountInWords").asString()).isEqualTo("Indian Rupees Three Hundred Thirty Six Only");
        assertThat(inv.path("seller").path("name").asString()).isNotBlank();
        assertThat(data.onHand(product)).isEqualByComparingTo("7");
        assertThat(data.ledgerBalance(c.id())).isEqualByComparingTo("336.00");
        assertThat(inv.path("dueDate").asString()).isNotEqualTo(inv.path("invoiceDate").asString());
    }

    @Test
    void invoiceSnapshotDoesNotChangeWhenCustomerChanges() {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        UUID product = data.product("10.00", "5.00", "5", "10");
        JsonNode inv = manualInvoice(admin, c.id(), product, "1", "CASH", true);
        api.patch("/api/v1/customers/" + c.id(), admin, Map.of("shopName", "Renamed Shop"), 200);
        JsonNode again = api.get("/api/v1/invoices/" + inv.path("id").asString(), admin, 200).path("data");
        assertThat(again.path("buyer").path("name").asString()).isEqualTo(inv.path("buyer").path("name").asString());
    }

    @Test
    void concurrentGenerationProducesUniqueNumbers() throws Exception {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        UUID product = data.product("10.00", "5.00", "5", "100");
        List<String> drafts = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            drafts.add(manualInvoice(admin, c.id(), product, "1", "CASH", false).path("id").asString());
        }
        ExecutorService pool = Executors.newFixedThreadPool(6);
        List<Callable<String>> tasks = new ArrayList<>();
        for (String id : drafts) {
            tasks.add(() -> api.post("/api/v1/invoices/" + id + "/generate", admin, null, 200).path("data").path("invoiceNumber").asString());
        }
        Set<String> numbers = new HashSet<>();
        for (Future<String> f : pool.invokeAll(tasks)) {
            numbers.add(f.get());
        }
        pool.shutdown();
        assertThat(numbers).hasSize(6);
        // Generating again is idempotent: the number never changes.
        String first = api.get("/api/v1/invoices/" + drafts.getFirst(), admin, 200).path("data").path("invoiceNumber").asString();
        assertThat(api.post("/api/v1/invoices/" + drafts.getFirst() + "/generate", admin, null, 200).path("data").path("invoiceNumber").asString()).isEqualTo(first);
    }

    @Test
    void paymentsAllocateFifoAndCancellationReversesEverything() {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        UUID product = data.product("100.00", "60.00", "0", "20");
        JsonNode inv1 = manualInvoice(admin, c.id(), product, "2", "CREDIT", true);
        JsonNode inv2 = manualInvoice(admin, c.id(), product, "3", "CREDIT", true);
        assertThat(data.ledgerBalance(c.id())).isEqualByComparingTo("500.00");

        JsonNode pay = api.post("/api/v1/payments", admin, Map.of("customerId", c.id().toString(), "amount", "250.00", "method", "CASH"), 201).path("data");
        assertThat(pay.path("allocations").size()).isEqualTo(2);
        assertThat(api.get("/api/v1/invoices/" + inv1.path("id").asString(), admin, 200).path("data").path("status").asString()).isEqualTo("PAID");
        assertThat(api.get("/api/v1/invoices/" + inv2.path("id").asString(), admin, 200).path("data").path("outstanding").decimalValue()).isEqualByComparingTo("250.00");
        assertThat(data.ledgerBalance(c.id())).isEqualByComparingTo("250.00");

        // Over-payment against a specific invoice is refused.
        api.post("/api/v1/payments", admin, Map.of("customerId", c.id().toString(), "invoiceId", inv2.path("id").asString(),
                "amount", "300.00", "method", "UPI"), 422);

        api.post("/api/v1/payments/" + pay.path("id").asString() + "/cancel", admin, Map.of("reason", "Entered twice"), 200);
        assertThat(data.ledgerBalance(c.id())).isEqualByComparingTo("500.00");
        assertThat(api.get("/api/v1/invoices/" + inv1.path("id").asString(), admin, 200).path("data").path("status").asString()).isEqualTo("CREDIT");
    }

    @Test
    void cancellingAnInvoiceRestoresStockAndLedgerAndKeepsPaymentAsAdvance() {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        UUID product = data.product("50.00", "30.00", "0", "10");
        JsonNode inv = manualInvoice(admin, c.id(), product, "4", "CASH", true);
        api.post("/api/v1/payments", admin, Map.of("customerId", c.id().toString(), "invoiceId", inv.path("id").asString(),
                "amount", "200.00", "method", "CASH"), 201);
        JsonNode cancelled = api.post("/api/v1/invoices/" + inv.path("id").asString() + "/cancel", admin, Map.of("reason", "Wrong customer"), 200).path("data");
        assertThat(cancelled.path("status").asString()).isEqualTo("CANCELLED");
        assertThat(data.onHand(product)).isEqualByComparingTo("10");
        assertThat(data.ledgerBalance(c.id())).isEqualByComparingTo("-200.00"); // advance held for the customer
        api.post("/api/v1/invoices/" + inv.path("id").asString() + "/cancel", admin, Map.of("reason", "again"), 409);

        // The advance is applied automatically to the next invoice.
        JsonNode next = manualInvoice(admin, c.id(), product, "2", "CREDIT", true);
        assertThat(next.path("paidAmount").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(next.path("status").asString()).isEqualTo("PAID");
    }

    @Test
    void invoicePdfIsDeterministicAndCustomerScoped() {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        TestData.TestCustomer other = data.approvedCustomer();
        UUID product = data.product("10.00", "5.00", "18", "10");
        String id = manualInvoice(admin, c.id(), product, "1", "CASH", true).path("id").asString();
        byte[] first = api.raw("/api/v1/invoices/" + id + "/pdf", admin, 200);
        byte[] second = api.raw("/api/v1/invoices/" + id + "/pdf", api.login(c.mobile()), 200);
        assertThat(new String(first, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("%PDF");
        assertThat(second).isEqualTo(first);
        api.raw("/api/v1/invoices/" + id + "/pdf", api.login(other.mobile()), 404);
    }

    @Test
    void creditOverrideIsRequiredToInvoiceBeyondABlockedLimit() {
        String owner = api.login(data.owner());
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.customer("APPROVED", true, new BigDecimal("50"), "33");
        UUID product = data.product("100.00", "50.00", "0", "10");
        api.patch("/api/v1/customers/" + c.id() + "/credit", owner, Map.of("creditPolicy", "BLOCK"), 200);
        api.patch("/api/v1/customers/" + c.id() + "/credit", admin, Map.of("creditPolicy", "ALLOW"), 403);
        String draft = manualInvoice(admin, c.id(), product, "1", "CREDIT", false).path("id").asString();
        JsonNode err = api.post("/api/v1/invoices/" + draft + "/generate", admin, null, 422);
        assertThat(err.path("error").path("code").asString()).isEqualTo("CREDIT_LIMIT_EXCEEDED");
        api.post("/api/v1/invoices/" + draft + "/generate", owner, null, 200);
    }

    @Test
    void salesReturnCreatesCreditNoteAndStockIn() {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        UUID product = data.product("100.00", "60.00", "18", "10");
        JsonNode inv = manualInvoice(admin, c.id(), product, "5", "CREDIT", true);
        String itemId = inv.path("items").get(0).path("id").asString();
        String cust = api.login(c.mobile());
        JsonNode ret = api.post("/api/v1/sales-returns", cust, Map.of("invoiceId", inv.path("id").asString(), "reason", "Damaged",
                "items", List.of(Map.of("invoiceItemId", itemId, "quantity", "2"))), 201).path("data");
        // Cannot request more than remains returnable.
        api.post("/api/v1/sales-returns", cust, Map.of("invoiceId", inv.path("id").asString(), "reason", "More",
                "items", List.of(Map.of("invoiceItemId", itemId, "quantity", "4"))), 422);
        api.post("/api/v1/sales-returns/" + ret.path("id").asString() + "/approve", cust, null, 403);
        JsonNode approved = api.post("/api/v1/sales-returns/" + ret.path("id").asString() + "/approve", admin, null, 200).path("data");
        assertThat(approved.path("creditAmount").decimalValue()).isEqualByComparingTo("236.00");
        assertThat(data.onHand(product)).isEqualByComparingTo("7");
        assertThat(data.ledgerBalance(c.id())).isEqualByComparingTo("354.00");
        JsonNode updated = api.get("/api/v1/invoices/" + inv.path("id").asString(), admin, 200).path("data");
        assertThat(updated.path("grandTotal").decimalValue()).isEqualByComparingTo("590.00"); // original never modified
        assertThat(updated.path("outstanding").decimalValue()).isEqualByComparingTo("354.00");
    }
}
