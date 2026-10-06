package com.shopflow.tenancy;

import com.shopflow.support.IntegrationTest;
import com.shopflow.support.TestData;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Industry words and units (architecture §0B.15): defaults per industry, owner changes, and reset. */
class VocabularyIntegrationTest extends IntegrationTest {

    @Test
    void textileBusinessUsesItsWordsAndUnitsAndTheOwnerCanChangeThem() {
        String admin = TestData.mobile();
        data.platformAdmin(admin);
        String platform = api.login(admin);
        String ownerMobile = TestData.mobile();
        JsonNode t = api.post("/api/v1/platform/tenants", platform, Map.of("name", "Words Textiles " + ownerMobile.substring(9),
                "industry", "TEXTILE", "state", "Tamil Nadu", "stateCode", "33", "ownerName", "Owner", "ownerMobile", ownerMobile), 201).path("data");
        String owner = api.verify(ownerMobile, t.path("tenantCode").asString()).path("accessToken").asString();

        JsonNode words = api.get("/api/v1/auth/me", owner, 200).path("data").path("vocabulary");
        assertThat(words.path("terms").path("product").asString()).isEqualTo("Article");
        assertThat(words.path("terms").path("products").asString()).isEqualTo("Articles");
        assertThat(words.path("terms").path("customer").asString()).isEqualTo("Dealer");
        assertThat(words.path("terms").path("variantOptions").asString()).isEqualTo("Size|Colour|Weight");
        assertThat(units(words)).contains("PCS", "BOX", "M", "ROLL", "KG");

        // The owner renames customers and narrows the units.
        JsonNode saved = api.exchange(HttpMethod.PUT, "/api/v1/business/vocabulary", owner, Map.of(
                "terms", Map.of("customer", "Shop", "customers", "Shops"), "units", List.of("pcs", "M", "KG")), 200, Map.of()).path("data");
        assertThat(saved.path("terms").path("customer").asString()).isEqualTo("Shop");
        assertThat(saved.path("defaultTerms").path("customer").asString()).isEqualTo("Dealer");
        JsonNode after = api.get("/api/v1/auth/me", owner, 200).path("data").path("vocabulary");
        assertThat(units(after)).containsExactly("PCS", "M", "KG");
        assertThat(after.path("terms").path("product").asString()).isEqualTo("Article");

        api.exchange(HttpMethod.PUT, "/api/v1/business/vocabulary", owner, Map.of("units", List.of("BOXES")), 400, Map.of());
        api.exchange(HttpMethod.PUT, "/api/v1/business/vocabulary", owner, Map.of("terms", Map.of("price", "x")), 400, Map.of());

        // Reset: back to the industry defaults.
        JsonNode reset = api.exchange(HttpMethod.PUT, "/api/v1/business/vocabulary", owner, Map.of(), 200, Map.of()).path("data");
        assertThat(reset.path("terms").path("customer").asString()).isEqualTo("Dealer");
        assertThat(units(reset)).contains("ROLL", "BUNDLE");

        // Staff of another business keep their own words (the demo business is general trading).
        JsonNode main = api.get("/api/v1/auth/me", api.login(data.owner()), 200).path("data").path("vocabulary");
        assertThat(main.path("terms").path("product").asString()).isNotEqualTo("Article");
    }

    private static List<String> units(JsonNode words) {
        List<String> list = new ArrayList<>();
        words.path("units").forEach(u -> list.add(u.asString()));
        return list;
    }
}
