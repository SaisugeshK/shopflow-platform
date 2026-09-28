package com.shopflow.billing.pdf;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Formats amounts with Indian digit grouping: 1234567.5 → 12,34,567.50. */
public final class IndianNumberFormat {

    private IndianNumberFormat() {
    }

    public static String format(BigDecimal value) {
        BigDecimal v = value.setScale(2, RoundingMode.HALF_UP);
        boolean negative = v.signum() < 0;
        String plain = v.abs().toPlainString();
        int dot = plain.indexOf('.');
        String integer = plain.substring(0, dot);
        String fraction = plain.substring(dot);
        StringBuilder sb = new StringBuilder();
        int len = integer.length();
        if (len <= 3) {
            sb.append(integer);
        } else {
            String head = integer.substring(0, len - 3);
            String tail = integer.substring(len - 3);
            StringBuilder h = new StringBuilder();
            for (int i = head.length(); i > 0; i -= 2) {
                int start = Math.max(0, i - 2);
                h.insert(0, head, start, i);
                if (start > 0) {
                    h.insert(0, ',');
                }
            }
            sb.append(h).append(',').append(tail);
        }
        return (negative ? "-" : "") + sb + fraction;
    }
}
