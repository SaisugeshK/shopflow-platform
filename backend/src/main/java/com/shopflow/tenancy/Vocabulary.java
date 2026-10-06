package com.shopflow.tenancy;

import com.shopflow.common.error.BusinessException;
import com.shopflow.products.Product;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The words and units a business sees (§0B.15): its industry's defaults ({@link IndustryTemplate#terms()},
 * {@link IndustryTemplate#units()}) with the owner's own changes on top. Legal/GST words on invoices never change.
 */
@Service
public class Vocabulary {

    /** Term keys the owner may rename. */
    public static final Set<String> KEYS = Set.of("product", "products", "customer", "customers", "supplier", "suppliers", "variantOptions");

    public record Words(Map<String, String> terms, List<String> units) {
    }

    public record Effective(Map<String, String> terms, List<String> units, Map<String, String> defaultTerms,
                            List<String> defaultUnits, String industry) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public Vocabulary(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** For the signed-in tenant. */
    public Words words() {
        Effective e = effective();
        return new Words(e.terms(), e.units());
    }

    @Transactional(readOnly = true)
    public Effective effective() {
        UUID tenant = TenantContext.requireTenantId();
        Map<String, Object> row = jdbc.queryForList("""
                SELECT b.industry, s.custom_terms::text AS terms, s.units FROM businesses b
                LEFT JOIN business_settings s ON s.business_id = b.id WHERE b.id = ?
                """, tenant).stream().findFirst().orElse(Map.of());
        IndustryTemplate template = template((String) row.get("industry"));
        Map<String, String> defaults = template.terms();
        Map<String, String> terms = new LinkedHashMap<>(defaults);
        String custom = (String) row.get("terms");
        if (custom != null && !custom.isBlank()) {
            Map<String, String> own = json.readValue(custom, new TypeReference<Map<String, String>>() { });
            own.forEach((k, v) -> {
                if (KEYS.contains(k) && v != null && !v.isBlank()) {
                    terms.put(k, v);
                }
            });
        }
        String ownUnits = (String) row.get("units");
        List<String> units = ownUnits == null || ownUnits.isBlank() ? template.units() : Arrays.asList(ownUnits.split(","));
        return new Effective(terms, units, defaults, template.units(), template.name());
    }

    /** The owner's words and units; null or empty values fall back to the industry defaults. */
    @Transactional
    public Effective save(Map<String, String> terms, List<String> units) {
        Effective before = effective();
        Map<String, String> own = new LinkedHashMap<>();
        if (terms != null) {
            terms.forEach((k, v) -> {
                if (!KEYS.contains(k)) {
                    throw BusinessException.validation("terms", "Unknown word: " + k);
                }
                String value = v == null ? "" : v.trim();
                if (value.length() > 40) {
                    throw BusinessException.validation("terms", "Keep each word under 40 characters");
                }
                if (!value.isEmpty() && !value.equals(before.defaultTerms().get(k))) {
                    own.put(k, value);
                }
            });
        }
        List<String> codes = new ArrayList<>();
        if (units != null) {
            for (String u : units) {
                String code = u == null ? "" : u.trim().toUpperCase(Locale.ROOT);
                try {
                    Product.Unit.valueOf(code);
                } catch (IllegalArgumentException e) {
                    throw BusinessException.validation("units", "Unknown unit " + u);
                }
                if (!codes.contains(code)) {
                    codes.add(code);
                }
            }
            if (codes.isEmpty()) {
                throw BusinessException.validation("units", "Keep at least one unit");
            }
        }
        String unitsValue = codes.isEmpty() || codes.equals(before.defaultUnits()) ? null : String.join(",", codes);
        jdbc.update("UPDATE business_settings SET custom_terms = CAST(? AS jsonb), units = ?, updated_at = now() WHERE business_id = ?",
                own.isEmpty() ? null : json.writeValueAsString(own), unitsValue, TenantContext.requireTenantId());
        return effective();
    }

    private static IndustryTemplate template(String code) {
        try {
            return code == null ? IndustryTemplate.GENERAL : IndustryTemplate.valueOf(code);
        } catch (IllegalArgumentException e) {
            return IndustryTemplate.GENERAL;
        }
    }
}
