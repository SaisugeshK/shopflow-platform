package com.shopflow.common.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Converts an INR amount to words using the Indian numbering system (lakh, crore),
 * e.g. 125000.50 → "Indian Rupees One Lakh Twenty Five Thousand and Fifty Paise Only".
 */
public final class AmountInWords {

    private static final String[] UNITS = {"", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"};
    private static final String[] TENS = {"", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"};

    private AmountInWords() {
    }

    public static String inr(BigDecimal amount) {
        BigDecimal value = amount.setScale(2, RoundingMode.HALF_UP).abs();
        long rupees = value.longValue();
        int paise = value.remainder(BigDecimal.ONE).movePointRight(2).intValue();

        StringBuilder sb = new StringBuilder("Indian Rupees ");
        sb.append(rupees == 0 ? "Zero" : words(rupees));
        if (paise > 0) {
            sb.append(" and ").append(words(paise)).append(" Paise");
        }
        sb.append(" Only");
        if (amount.signum() < 0) {
            sb.insert(0, "Minus ");
        }
        return sb.toString();
    }

    static String words(long n) {
        StringBuilder sb = new StringBuilder();
        long crore = n / 10_000_000;
        n %= 10_000_000;
        long lakh = n / 100_000;
        n %= 100_000;
        long thousand = n / 1_000;
        n %= 1_000;
        long hundred = n / 100;
        long rest = n % 100;

        if (crore > 0) {
            append(sb, words(crore) + " Crore");
        }
        if (lakh > 0) {
            append(sb, twoDigits((int) lakh) + " Lakh");
        }
        if (thousand > 0) {
            append(sb, twoDigits((int) thousand) + " Thousand");
        }
        if (hundred > 0) {
            append(sb, UNITS[(int) hundred] + " Hundred");
        }
        if (rest > 0) {
            append(sb, twoDigits((int) rest));
        }
        return sb.toString();
    }

    private static String twoDigits(int n) {
        if (n < 20) {
            return UNITS[n];
        }
        return (TENS[n / 10] + (n % 10 > 0 ? " " + UNITS[n % 10] : "")).trim();
    }

    private static void append(StringBuilder sb, String part) {
        if (!sb.isEmpty()) {
            sb.append(' ');
        }
        sb.append(part);
    }
}
