package com.shopflow.common.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Single place for monetary scale and rounding. All money is BigDecimal, scale 2, HALF_UP.
 */
public final class Money {

    public static final int SCALE = 2;
    public static final int QUANTITY_SCALE = 3;
    public static final RoundingMode ROUNDING = RoundingMode.HALF_UP;
    public static final BigDecimal ZERO = BigDecimal.ZERO.setScale(SCALE, ROUNDING);
    public static final BigDecimal HUNDRED = new BigDecimal("100");

    private Money() {
    }

    public static BigDecimal of(BigDecimal value) {
        return value == null ? ZERO : value.setScale(SCALE, ROUNDING);
    }

    public static BigDecimal of(String value) {
        return of(new BigDecimal(value));
    }

    public static BigDecimal qty(BigDecimal value) {
        return value == null ? BigDecimal.ZERO.setScale(QUANTITY_SCALE, ROUNDING) : value.setScale(QUANTITY_SCALE, ROUNDING);
    }

    public static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    /** value × percent / 100, rounded to money scale. */
    public static BigDecimal percentOf(BigDecimal value, BigDecimal percent) {
        return value.multiply(percent).divide(HUNDRED, SCALE, ROUNDING);
    }

    public static boolean isPositive(BigDecimal value) {
        return value != null && value.signum() > 0;
    }

    public static BigDecimal min(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) <= 0 ? a : b;
    }

    public static BigDecimal max(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) >= 0 ? a : b;
    }
}
