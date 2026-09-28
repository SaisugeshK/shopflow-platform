package com.shopflow.purchases;

import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Purchasing, supplier ledger, stock adjustments, WhatsApp, reports, dashboards and audit (§13–§18, §32, §40, §80). */
class PurchaseAndReportsIntegrationTest extends IntegrationTest {

    @Test
    void purchasePostingReturnsAndSupplierLedger() {
        String admin = api.login(data.admin());
        UUID supplier = data.supplier("33");
        UUID product = data.product("100.00", "60.00", "18", "0");
        JsonNode purchase = api.post("/api/v1/purchases", admin, Map.of("supplierId", supplier.toString(), "supplierInvoiceNumber", "S-1",
                "items", List.of(Map.of("productId", product.toString(), "quantity", "10", "rate", "60.00", "discountPercent", "10"))), 201).path("data");
        assertThat(purchase.path("status").asString()).isEqualTo("DRAFT");
        assertThat(purchase.path("taxableTotal").decimalValue()).isEqualByComparingTo("540.00");
        assertThat(purchase.path("grandTotal").decimalValue()).isEqualByComparingTo("637.00"); // 540 + 97.20 tax, rounded
        assertThat(data.onHand(product)).isEqualByComparingTo("0");

        String id = purchase.path("id").asString();
        api.post("/api/v1/purchases/" + id + "/post", admin, null, 200);
        api.post("/api/v1/purchases/" + id + "/post", admin, null, 200); // idempotent
        assertThat(data.onHand(product)).isEqualByComparingTo("10");
        api.post("/api/v1/purchases/" + id + "/cancel", admin, Map.of("reason", "x"), 409);

        api.post("/api/v1/purchases/" + id + "/payments", admin, Map.of("amount", "300.00", "method", "BANK_TRANSFER"), 201);
        api.post("/api/v1/purchases/" + id + "/payments", admin, Map.of("amount", "400.00", "method", "CASH"), 422);

        String itemId = api.get("/api/v1/purchases/" + id, admin, 200).path("data").path("items").get(0).path("id").asString();
        JsonNode ret = api.post("/api/v1/purchase-returns", admin, Map.of("purchaseId", id, "reason", "Damaged in transit", "post", true,
                "items", List.of(Map.of("purchaseItemId", itemId, "quantity", "2"))), 201).path("data");
        assertThat(ret.path("status").asString()).isEqualTo("POSTED");
        assertThat(data.onHand(product)).isEqualByComparingTo("8");
        api.post("/api/v1/purchase-returns", admin, Map.of("purchaseId", id, "reason", "Too many",
                "items", List.of(Map.of("purchaseItemId", itemId, "quantity", "9"))), 422);

        JsonNode ledger = api.get("/api/v1/suppliers/" + supplier + "/ledger", admin, 200).path("data");
        assertThat(ledger.size()).isEqualTo(3);
        BigDecimal balance = ledger.get(ledger.size() - 1).path("balance").decimalValue();
        assertThat(balance).isEqualByComparingTo(new BigDecimal("637.00").subtract(new BigDecimal("300.00")).subtract(ret.path("grandTotal").decimalValue()));
    }

    @Test
    void stockAdjustmentsRequireReasonAndCannotGoNegative() {
        String admin = api.login(data.admin());
        UUID product = data.product("10.00", "5.00", "5", "3");
        api.post("/api/v1/stock/adjustments", admin, Map.of("productId", product.toString(), "type", "DAMAGE_OUT", "quantity", "1", "reason", "Broken"), 201);
        JsonNode err = api.post("/api/v1/stock/adjustments", admin, Map.of("productId", product.toString(), "type", "LOSS_OUT", "quantity", "5", "reason", "Lost"), 409);
        assertThat(err.path("error").path("code").asString()).isEqualTo("INSUFFICIENT_STOCK");
        api.post("/api/v1/stock/adjustments", admin, Map.of("productId", product.toString(), "type", "ADJUSTMENT_IN", "quantity", "1"), 400);
        assertThat(data.onHand(product)).isEqualByComparingTo("2");
        JsonNode movements = api.get("/api/v1/stock/movements?productId=" + product, admin, 200).path("data");
        assertThat(movements.size()).isEqualTo(2);
    }

    @Test
    void whatsAppDeliveryRetriesAndTracksStatus() throws Exception {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        UUID product = data.product("10.00", "5.00", "5", "10");
        String invoiceId = api.post("/api/v1/invoices", admin, Map.of("customerId", c.id().toString(), "paymentType", "CASH", "generate", true,
                "items", List.of(Map.of("productId", product.toString(), "quantity", "1"))), 201).path("data").path("id").asString();
        JsonNode msg = api.post("/api/v1/invoices/" + invoiceId + "/send-whatsapp", admin, null, 200).path("data");
        String status = "";
        for (int i = 0; i < 40 && !"SENT".equals(status); i++) {
            Thread.sleep(100);
            status = api.get("/api/v1/invoices/" + invoiceId + "/whatsapp-messages", admin, 200).path("data").get(0).path("status").asString();
        }
        assertThat(status).isEqualTo("SENT");
        api.post("/api/v1/dev/whatsapp/" + msg.path("id").asString() + "/status", null, Map.of("status", "READ"), 200);
        api.post("/api/v1/dev/whatsapp/" + msg.path("id").asString() + "/status", null, Map.of("status", "DELIVERED"), 200); // out of order
        assertThat(api.get("/api/v1/invoices/" + invoiceId + "/whatsapp-messages", admin, 200).path("data").get(0).path("status").asString()).isEqualTo("READ");
        assertThat(api.get("/api/v1/invoices/" + invoiceId, admin, 200).path("data").path("sentAt").isNull()).isFalse();
    }

    @Test
    void whatsAppPermanentFailureIsRecordedWithoutBlockingInvoicing() throws Exception {
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        data.jdbc().update("UPDATE customers SET mobile_number = '+919876549999' WHERE id = ?", c.id());
        UUID product = data.product("10.00", "5.00", "5", "10");
        String invoiceId = api.post("/api/v1/invoices", admin, Map.of("customerId", c.id().toString(), "paymentType", "CASH", "generate", true,
                "items", List.of(Map.of("productId", product.toString(), "quantity", "1"))), 201).path("data").path("id").asString();
        api.post("/api/v1/invoices/" + invoiceId + "/send-whatsapp", admin, null, 200);
        JsonNode m = null;
        for (int i = 0; i < 40; i++) {
            Thread.sleep(100);
            m = api.get("/api/v1/invoices/" + invoiceId + "/whatsapp-messages", admin, 200).path("data").get(0);
            if ("FAILED".equals(m.path("status").asString())) {
                break;
            }
        }
        assertThat(m.path("status").asString()).isEqualTo("FAILED");
        assertThat(m.path("nextRetryAt").isNull() || m.path("nextRetryAt").isMissingNode()).isTrue(); // non-retryable
        assertThat(api.get("/api/v1/invoices/" + invoiceId, admin, 200).path("data").path("status").asString()).isEqualTo("GENERATED");
    }

    @Test
    void reportsDashboardsAndPermissions() {
        String owner = api.login(data.owner());
        String admin = api.login(data.admin());
        TestData.TestCustomer c = data.approvedCustomer();
        UUID product = data.product("100.00", "60.00", "0", "10");
        api.post("/api/v1/invoices", admin, Map.of("customerId", c.id().toString(), "paymentType", "CASH", "generate", true,
                "items", List.of(Map.of("productId", product.toString(), "quantity", "2"))), 201);

        JsonNode profit = api.get("/api/v1/reports/profit?productId=" + product, owner, 200).path("data");
        assertThat(profit.path("rows").get(0).path("grossProfit").decimalValue()).isEqualByComparingTo("80.00");
        assertThat(profit.path("rows").get(0).path("cogs").decimalValue()).isEqualByComparingTo("120.00");
        api.get("/api/v1/reports/profit", admin, 403);
        api.get("/api/v1/reports/tax", admin, 403);
        JsonNode sales = api.get("/api/v1/reports/sales?productId=" + product, admin, 200).path("data");
        assertThat(sales.path("totals").path("total").decimalValue()).isEqualByComparingTo("200.00");
        assertThat(api.raw("/api/v1/reports/sales?format=csv", admin, 200)).isNotEmpty();
        api.get("/api/v1/reports/unknown", admin, 404);

        api.get("/api/v1/dashboard/owner?range=THIS_FINANCIAL_YEAR", owner, 200);
        api.get("/api/v1/dashboard/owner", admin, 403);
        api.get("/api/v1/dashboard/admin", admin, 200);
        api.get("/api/v1/dashboard/customer", api.login(c.mobile()), 200);
    }

    @Test
    void auditTrailRecordsAndRedactsAndIsOwnerOnlyByDefault() {
        String owner = api.login(data.owner());
        String admin = api.login(data.admin());
        api.get("/api/v1/audit-logs", admin, 403);
        JsonNode logs = api.get("/api/v1/audit-logs?action=LOGIN&pageSize=50", owner, 200);
        assertThat(logs.path("pagination").path("totalItems").asLong()).isGreaterThan(0);
        Integer tokenLeaks = data.jdbc().queryForObject(
                "SELECT COUNT(*) FROM audit_logs WHERE new_value LIKE '%eyJhbGci%' OR old_value LIKE '%eyJhbGci%'", Integer.class);
        assertThat(tokenLeaks).isZero();
        // Audit rows cannot be deleted, even directly.
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> data.jdbc().update("DELETE FROM audit_logs"))
                .hasMessageContaining("not allowed");
    }

    @Test
    void ownerManagesAdminsButAdminsCannotTouchTheOwner() {
        String owner = api.login(data.owner());
        String adminMobile = TestData.mobile();
        JsonNode created = api.post("/api/v1/users", owner, Map.of("mobileNumber", adminMobile, "fullName", "New Admin"), 201).path("data");
        assertThat(created.path("role").asString()).isEqualTo("ADMIN");
        String adminToken = api.login(adminMobile);
        api.get("/api/v1/users", adminToken, 403);
        api.post("/api/v1/users/" + created.path("id").asString() + "/deactivate", owner, null, 200);
        api.get("/api/v1/auth/me", adminToken, 401); // sessions revoked on deactivation
    }
}
