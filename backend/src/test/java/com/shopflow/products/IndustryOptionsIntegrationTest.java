package com.shopflow.products;

import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Industry options (architecture §0B.7, Phase 2): unit conversions, decimal quantities, batch + expiry (FEFO),
 * serial numbers with warranty, schemes, daily rates, invoice charges, variants and barcode labels — each behind its
 * module switch.
 */
class IndustryOptionsIntegrationTest extends IntegrationTest {

    private String owner;
    private String platform;
    private UUID category;
    private UUID supplier;

    @BeforeEach
    void setUp() {
        String admin = TestData.mobile();
        data.platformAdmin(admin);
        platform = api.login(admin);
        owner = api.login(data.owner());
        category = data.category();
        supplier = data.supplier("33");
    }

    private void modules(Map<String, Boolean> switches) {
        api.exchange(HttpMethod.PUT, "/api/v1/platform/tenants/" + TestData.BUSINESS + "/modules", platform,
                Map.of("modules", switches), 200, Map.of());
    }

    private UUID product(Map<String, Object> extra) {
        Map<String, Object> body = new HashMap<>(Map.of("name", "Option product " + UUID.randomUUID().toString().substring(0, 6),
                "categoryId", category.toString(), "unit", "PCS", "purchasePrice", "50.00", "sellingPrice", "100.00",
                "gstRate", "18", "hsnCode", "1905"));
        body.putAll(extra);
        return UUID.fromString(api.post("/api/v1/products", owner, body, 201).path("data").path("id").asString());
    }

    private JsonNode purchase(List<Map<String, Object>> items) {
        String id = api.post("/api/v1/purchases", owner, Map.of("supplierId", supplier.toString(), "items", items, "post", true), 201)
                .path("data").path("id").asString();
        return api.get("/api/v1/purchases/" + id, owner, 200).path("data");
    }

    private JsonNode invoice(UUID customer, List<Map<String, Object>> items, List<Map<String, Object>> charges) {
        Map<String, Object> body = new HashMap<>(Map.of("customerId", customer.toString(), "paymentType", "CASH", "generate", true, "items", items));
        if (charges != null) {
            body.put("charges", charges);
        }
        return api.post("/api/v1/invoices", owner, body, 201).path("data");
    }

    private BigDecimal onHand(UUID product) {
        return api.get("/api/v1/products/" + product, owner, 200).path("data").path("onHand").decimalValue();
    }

    @Test
    void unitConversionsKeepStockInTheBaseUnit() {
        api.post("/api/v1/products", owner, Map.of("name", "No module", "categoryId", category.toString(), "unit", "PCS",
                "purchasePrice", "1", "sellingPrice", "2", "gstRate", "18", "units", List.of(Map.of("unit", "CASE", "factor", "12"))), 403);
        modules(Map.of("UOM_CONVERSIONS", true));
        UUID p = product(Map.of("units", List.of(Map.of("unit", "CASE", "factor", "12"))));
        JsonNode units = api.get("/api/v1/products/" + p, owner, 200).path("data").path("units");
        assertThat(units.get(0).path("unit").asString()).isEqualTo("CASE");

        JsonNode bought = purchase(List.of(Map.of("productId", p.toString(), "quantity", "3", "unit", "CASE", "rate", "600.00")));
        assertThat(bought.path("items").get(0).path("unitFactor").decimalValue()).isEqualByComparingTo("12");
        assertThat(onHand(p)).isEqualByComparingTo("36");

        UUID customer = data.approvedCustomer().id();
        JsonNode inv = invoice(customer, List.of(Map.of("productId", p.toString(), "quantity", "1", "unit", "CASE"),
                Map.of("productId", p.toString(), "quantity", "3")), null);
        JsonNode caseLine = inv.path("items").get(0);
        assertThat(caseLine.path("unit").asString()).isEqualTo("CASE");
        assertThat(caseLine.path("rate").decimalValue()).isEqualByComparingTo("1200.00");
        assertThat(onHand(p)).isEqualByComparingTo("21");

        // A customer orders by the case: the cart prices it per case and the order reserves 12 pieces.
        TestData.TestCustomer buyer = data.approvedCustomer();
        String customerToken = api.login(buyer.mobile());
        JsonNode cart = api.post("/api/v1/cart/items", customerToken, Map.of("productId", p.toString(), "quantity", "0.1", "unit", "CASE"), 400);
        assertThat(cart.path("error").path("code").asString()).isEqualTo("VALIDATION_ERROR");
        cart = api.post("/api/v1/cart/items", customerToken, Map.of("productId", p.toString(), "quantity", "1", "unit", "CASE"), 200).path("data");
        assertThat(cart.path("items").get(0).path("unit").asString()).isEqualTo("CASE");
        assertThat(cart.path("items").get(0).path("unitPrice").decimalValue()).isEqualByComparingTo("1200.00");
        JsonNode order = api.post("/api/v1/orders", customerToken, Map.of("paymentMethod", "CASH"), 201).path("data");
        assertThat(order.path("items").get(0).path("unitFactor").decimalValue()).isEqualByComparingTo("12");
        assertThat(api.get("/api/v1/products/" + p, owner, 200).path("data").path("reserved").decimalValue()).isEqualByComparingTo("12");

        // Whole numbers only for a PCS product; an unknown unit is rejected.
        api.post("/api/v1/invoices", owner, Map.of("customerId", customer.toString(), "paymentType", "CASH",
                "items", List.of(Map.of("productId", p.toString(), "quantity", "1.5"))), 400);
        api.post("/api/v1/invoices", owner, Map.of("customerId", customer.toString(), "paymentType", "CASH",
                "items", List.of(Map.of("productId", p.toString(), "quantity", "1", "unit", "BAG"))), 400);
    }

    @Test
    void batchesAreSoldFirstExpiryFirstOutAndExpiredStockIsBlocked() {
        modules(Map.of("BATCH_EXPIRY", true));
        UUID p = product(Map.of("trackBatches", true));
        api.post("/api/v1/purchases", owner, Map.of("supplierId", supplier.toString(),
                "items", List.of(Map.of("productId", p.toString(), "quantity", "5", "rate", "50"))), 400);
        LocalDate today = LocalDate.now();
        purchase(List.of(
                Map.of("productId", p.toString(), "quantity", "10", "rate", "50", "batchNumber", "late", "expiryDate", today.plusDays(90).toString()),
                Map.of("productId", p.toString(), "quantity", "10", "rate", "50", "batchNumber", "soon", "expiryDate", today.plusDays(10).toString()),
                Map.of("productId", p.toString(), "quantity", "4", "rate", "50", "batchNumber", "old", "expiryDate", today.minusDays(1).toString())));
        assertThat(onHand(p)).isEqualByComparingTo("24");

        JsonNode inv = invoice(data.approvedCustomer().id(), List.of(Map.of("productId", p.toString(), "quantity", "12")), null);
        String batches = inv.path("items").get(0).path("batchDetails").asString();
        assertThat(batches).contains("SOON").contains("LATE").doesNotContain("OLD");

        JsonNode near = api.get("/api/v1/batches?status=NEAR_EXPIRY&productId=" + p, owner, 200).path("data");
        assertThat(near).isEmpty(); // SOON is sold out
        JsonNode expired = api.get("/api/v1/batches?status=EXPIRED&productId=" + p, owner, 200).path("data");
        assertThat(expired).hasSize(1);
        assertThat(expired.get(0).path("batchNumber").asString()).isEqualTo("OLD");

        // Only 8 sellable units are left (LATE); the expired 4 cannot be sold.
        api.post("/api/v1/invoices", owner, Map.of("customerId", data.approvedCustomer().id().toString(), "paymentType", "CASH",
                "generate", true, "items", List.of(Map.of("productId", p.toString(), "quantity", "10"))), 409);
        api.post("/api/v1/batches/products/" + p + "/write-off", owner, Map.of("batchNumber", "OLD", "expired", true,
                "reason", "Expired stock destroyed"), 200);
        assertThat(onHand(p)).isEqualByComparingTo("8");
    }

    @Test
    void serialNumbersAreReceivedSoldWithWarrantyAndRestoredOnCancel() {
        modules(Map.of("SERIAL_NUMBERS", true));
        UUID p = product(Map.of("trackSerials", true, "warrantyMonths", 12));
        api.post("/api/v1/purchases", owner, Map.of("supplierId", supplier.toString(),
                "items", List.of(Map.of("productId", p.toString(), "quantity", "2", "rate", "50", "serialNumbers", List.of("only-one")))), 400);
        String tag = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        purchase(List.of(Map.of("productId", p.toString(), "quantity", "3", "rate", "50",
                "serialNumbers", List.of("IMEI-" + tag + "-1", "IMEI-" + tag + "-2", "IMEI-" + tag + "-3"))));
        assertThat(api.get("/api/v1/serials/in-stock?productId=" + p, owner, 200).path("data")).hasSize(3);

        UUID customer = data.approvedCustomer().id();
        JsonNode inv = invoice(customer, List.of(Map.of("productId", p.toString(), "quantity", "1",
                "serialNumbers", List.of("imei-" + tag + "-2"))), null);
        assertThat(inv.path("items").get(0).path("serialNumbers").get(0).asString()).isEqualTo("IMEI-" + tag + "-2");

        JsonNode found = api.get("/api/v1/serials?q=" + tag + "-2", owner, 200).path("data").get(0);
        assertThat(found.path("status").asString()).isEqualTo("SOLD");
        assertThat(found.path("invoiceNumber").asString()).isEqualTo(inv.path("invoiceNumber").asString());
        assertThat(LocalDate.parse(found.path("warrantyUntil").asString())).isAfter(LocalDate.now().plusMonths(11));
        assertThat(found.path("underWarranty").asBoolean()).isTrue();

        // A sold serial cannot be sold again; cancelling the invoice puts it back in stock.
        api.post("/api/v1/invoices", owner, Map.of("customerId", customer.toString(), "paymentType", "CASH", "generate", true,
                "items", List.of(Map.of("productId", p.toString(), "quantity", "1", "serialNumbers", List.of("IMEI-" + tag + "-2")))), 400);
        api.post("/api/v1/invoices/" + inv.path("id").asString() + "/cancel", owner, Map.of("reason", "Wrong unit"), 200);
        assertThat(api.get("/api/v1/serials?q=" + tag + "-2", owner, 200).path("data").get(0).path("status").asString()).isEqualTo("IN_STOCK");
    }

    @Test
    void schemesGiveSlabDiscountsAndFreeGoods() {
        modules(Map.of("SCHEMES", true));
        UUID p = product(Map.of());
        purchase(List.of(Map.of("productId", p.toString(), "quantity", "50", "rate", "50")));
        api.post("/api/v1/schemes", owner, Map.of("name", "10 + 1", "schemeType", "BUY_X_GET_Y", "productId", p.toString(),
                "buyQuantity", "10", "freeQuantity", "1"), 201);
        api.post("/api/v1/schemes", owner, Map.of("name", "Bulk 5%", "schemeType", "QUANTITY_SLAB", "productId", p.toString(),
                "minQuantity", "20", "discountPercent", "5"), 201);

        JsonNode inv = invoice(data.approvedCustomer().id(), List.of(Map.of("productId", p.toString(), "quantity", "20")), null);
        JsonNode items = inv.path("items");
        assertThat(items).hasSize(2);
        assertThat(items.get(0).path("discountPercent").decimalValue()).isEqualByComparingTo("5");
        assertThat(items.get(0).path("schemeName").asString()).isEqualTo("Bulk 5%");
        assertThat(items.get(1).path("freeItem").asBoolean()).isTrue();
        assertThat(items.get(1).path("quantity").decimalValue()).isEqualByComparingTo("2");
        assertThat(items.get(1).path("lineTotal").decimalValue()).isEqualByComparingTo("0");
        assertThat(onHand(p)).isEqualByComparingTo("28"); // 50 − 20 sold − 2 free
    }

    @Test
    void dailyRatesSetTheSellingPrice() {
        api.get("/api/v1/daily-rates", owner, 403);
        modules(Map.of("DAILY_RATES", true));
        UUID p = product(Map.of("pricingMode", "DAILY_RATE", "unit", "BAG", "decimalQuantity", false));
        api.exchange(HttpMethod.PUT, "/api/v1/daily-rates", owner, Map.of("rates", List.of(Map.of("productId", p.toString(), "rate", "385.50"))),
                200, Map.of());
        assertThat(api.get("/api/v1/products/" + p, owner, 200).path("data").path("sellingPrice").decimalValue()).isEqualByComparingTo("385.50");
        JsonNode row = null;
        for (JsonNode r : api.get("/api/v1/daily-rates", owner, 200).path("data")) {
            if (r.path("productId").asString().equals(p.toString())) {
                row = r;
            }
        }
        assertThat(row).isNotNull();
        assertThat(row.path("rate").decimalValue()).isEqualByComparingTo("385.50");
        // A product not priced by rate cannot be given a rate.
        api.exchange(HttpMethod.PUT, "/api/v1/daily-rates", owner, Map.of("rates", List.of(Map.of("productId", product(Map.of()).toString(), "rate", "1"))),
                400, Map.of());
    }

    @Test
    void invoiceChargesCarryTheirOwnGst() {
        UUID p = product(Map.of());
        purchase(List.of(Map.of("productId", p.toString(), "quantity", "5", "rate", "50")));
        UUID customer = data.approvedCustomer().id();
        List<Map<String, Object>> charges = List.of(Map.of("type", "TRANSPORT", "amount", "500", "taxRate", "18"));
        api.post("/api/v1/invoices", owner, Map.of("customerId", customer.toString(), "paymentType", "CASH",
                "items", List.of(Map.of("productId", p.toString(), "quantity", "1")), "charges", charges), 403);
        modules(Map.of("CHARGES", true));
        JsonNode inv = invoice(customer, List.of(Map.of("productId", p.toString(), "quantity", "1")), charges);
        assertThat(inv.path("chargesTotal").decimalValue()).isEqualByComparingTo("590.00");
        assertThat(inv.path("charges").get(0).path("sacCode").asString()).isEqualTo("9965");
        assertThat(inv.path("grandTotal").decimalValue()).isEqualByComparingTo("708.00"); // 118 goods + 590 transport
        assertThat(api.raw("/api/v1/invoices/" + inv.path("id").asString() + "/pdf", owner, 200)).isNotEmpty();
    }

    @Test
    void variantsAreGeneratedAndOnlyVariantsAreSold() {
        modules(Map.of("VARIANTS", true, "BARCODE_LABELS", true));
        UUID group = product(Map.of("name", "Cotton shirt " + UUID.randomUUID().toString().substring(0, 4), "sku", "SHIRT-" + UUID.randomUUID().toString().substring(0, 4)));
        JsonNode variants = api.post("/api/v1/products/" + group + "/variants", owner, Map.of("attributes", List.of(
                Map.of("name", "Size", "values", List.of("S", "M")), Map.of("name", "Colour", "values", List.of("Blue")))), 200).path("data");
        assertThat(variants).hasSize(2);
        assertThat(variants.get(0).path("variantAttributes").asString()).contains("Colour: Blue");
        // Generating again adds nothing new.
        assertThat(api.post("/api/v1/products/" + group + "/variants", owner, Map.of("attributes", List.of(
                Map.of("name", "Size", "values", List.of("S", "M")), Map.of("name", "Colour", "values", List.of("Blue")))), 200).path("data")).hasSize(2);
        assertThat(api.get("/api/v1/products/" + group, owner, 200).path("data").path("variantGroup").asBoolean()).isTrue();

        api.post("/api/v1/invoices", owner, Map.of("customerId", data.approvedCustomer().id().toString(), "paymentType", "CASH",
                "items", List.of(Map.of("productId", group.toString(), "quantity", "1"))), 400);

        List<String> ids = new ArrayList<>();
        variants.forEach(v -> ids.add(v.path("id").asString()));
        byte[] pdf = api.raw("/api/v1/labels/products?copies=2&ids=" + String.join(",", ids), owner, 200);
        assertThat(new String(pdf, 0, 4)).isEqualTo("%PDF");
    }
}
