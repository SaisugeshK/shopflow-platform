package com.shopflow.common.util;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * GST state codes. Used to derive the state code from a state name and to decide intra- vs inter-state supply.
 */
public final class IndianStates {

    private static final Map<String, String> CODES = new LinkedHashMap<>();

    static {
        put("Jammu and Kashmir", "01");
        put("Himachal Pradesh", "02");
        put("Punjab", "03");
        put("Chandigarh", "04");
        put("Uttarakhand", "05");
        put("Haryana", "06");
        put("Delhi", "07");
        put("Rajasthan", "08");
        put("Uttar Pradesh", "09");
        put("Bihar", "10");
        put("Sikkim", "11");
        put("Arunachal Pradesh", "12");
        put("Nagaland", "13");
        put("Manipur", "14");
        put("Mizoram", "15");
        put("Tripura", "16");
        put("Meghalaya", "17");
        put("Assam", "18");
        put("West Bengal", "19");
        put("Jharkhand", "20");
        put("Odisha", "21");
        put("Chhattisgarh", "22");
        put("Madhya Pradesh", "23");
        put("Gujarat", "24");
        put("Dadra and Nagar Haveli and Daman and Diu", "26");
        put("Maharashtra", "27");
        put("Karnataka", "29");
        put("Goa", "30");
        put("Lakshadweep", "31");
        put("Kerala", "32");
        put("Tamil Nadu", "33");
        put("Puducherry", "34");
        put("Andaman and Nicobar Islands", "35");
        put("Telangana", "36");
        put("Andhra Pradesh", "37");
        put("Ladakh", "38");
    }

    private IndianStates() {
    }

    private static void put(String name, String code) {
        CODES.put(name.toLowerCase(Locale.ROOT), code);
    }

    public static Optional<String> codeFor(String stateName) {
        if (stateName == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(CODES.get(stateName.trim().toLowerCase(Locale.ROOT)));
    }

    public static boolean isValidCode(String code) {
        return code != null && CODES.containsValue(code);
    }

    /** Returns the given code when valid, otherwise derives it from the state name. */
    public static String resolve(String stateName, String providedCode) {
        if (providedCode != null && !providedCode.isBlank()) {
            if (!isValidCode(providedCode.trim())) {
                throw com.shopflow.common.error.BusinessException.validation("stateCode", "Unknown GST state code");
            }
            return providedCode.trim();
        }
        return codeFor(stateName).orElseThrow(() ->
                com.shopflow.common.error.BusinessException.validation("state", "Unknown state; provide a valid GST state code"));
    }

    public static Map<String, String> all() {
        return Map.copyOf(CODES);
    }
}
