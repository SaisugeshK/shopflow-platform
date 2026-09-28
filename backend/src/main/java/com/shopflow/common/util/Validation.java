package com.shopflow.common.util;

/**
 * Shared regular expressions for Indian business identifiers, used in DTO @Pattern constraints.
 */
public final class Validation {

    public static final String GSTIN = "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$";
    public static final String PAN = "^[A-Z]{5}[0-9]{4}[A-Z]$";
    public static final String PINCODE = "^[1-9][0-9]{5}$";
    public static final String STATE_CODE = "^[0-9]{2}$";
    public static final String HSN = "^[0-9]{4,8}$";
    public static final String IFSC = "^[A-Z]{4}0[A-Z0-9]{6}$";

    private Validation() {
    }

    public static String upper(String s) {
        return s == null || s.isBlank() ? null : s.trim().toUpperCase(java.util.Locale.ROOT);
    }

    public static String trim(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
