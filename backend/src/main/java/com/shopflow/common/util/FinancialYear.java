package com.shopflow.common.util;

import java.time.LocalDate;

/**
 * Indian financial year label such as "2026-27" for a date, given the month the year starts in (April by default).
 */
public final class FinancialYear {

    private FinancialYear() {
    }

    public static String label(LocalDate date, int startMonth) {
        int startYear = date.getMonthValue() >= startMonth ? date.getYear() : date.getYear() - 1;
        if (startMonth == 1) {
            return String.valueOf(startYear);
        }
        return startYear + "-" + String.format("%02d", (startYear + 1) % 100);
    }

    public static LocalDate start(LocalDate date, int startMonth) {
        int startYear = date.getMonthValue() >= startMonth ? date.getYear() : date.getYear() - 1;
        return LocalDate.of(startYear, startMonth, 1);
    }
}
