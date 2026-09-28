package com.shopflow.common.util;

import com.shopflow.common.error.BusinessException;

import java.util.regex.Pattern;

/**
 * Normalises Indian mobile numbers to E.164 (+91XXXXXXXXXX).
 */
public final class MobileNumbers {

    private static final Pattern INDIAN_MOBILE = Pattern.compile("^[6-9]\\d{9}$");

    private MobileNumbers() {
    }

    public static String normalize(String raw) {
        if (raw == null) {
            throw BusinessException.validation("mobileNumber", "Mobile number is required");
        }
        String digits = raw.replaceAll("[\\s()-]", "");
        if (digits.startsWith("+91")) {
            digits = digits.substring(3);
        } else if (digits.startsWith("0091")) {
            digits = digits.substring(4);
        } else if (digits.startsWith("91") && digits.length() == 12) {
            digits = digits.substring(2);
        } else if (digits.startsWith("0") && digits.length() == 11) {
            digits = digits.substring(1);
        }
        if (!INDIAN_MOBILE.matcher(digits).matches()) {
            throw BusinessException.validation("mobileNumber", "Enter a valid 10-digit Indian mobile number");
        }
        return "+91" + digits;
    }

    public static String normalizeOptional(String raw) {
        return raw == null || raw.isBlank() ? null : normalize(raw);
    }

    /** +919876543210 → +91******3210 for logs and audit. */
    public static String mask(String e164) {
        if (e164 == null || e164.length() < 6) {
            return "****";
        }
        return e164.substring(0, 3) + "******" + e164.substring(e164.length() - 4);
    }
}
