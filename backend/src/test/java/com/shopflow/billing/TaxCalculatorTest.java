package com.shopflow.billing;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaxCalculatorTest {

    private final TaxCalculator calc = new TaxCalculator();

    private static TaxCalculator.Line line(String qty, String rate, String discPct, String discAmt, String tax) {
        return new TaxCalculator.Line(new BigDecimal(qty), new BigDecimal(rate), discPct == null ? null : new BigDecimal(discPct),
                discAmt == null ? null : new BigDecimal(discAmt), new BigDecimal(tax), "1905");
    }

    @Test
    void intraStateSplitsTaxIntoCgstAndSgst() {
        TaxCalculator.Result r = calc.calculate(List.of(line("5", "100.00", null, null, "18")), false, true);
        assertThat(r.taxable()).isEqualByComparingTo("500.00");
        assertThat(r.cgst()).isEqualByComparingTo("45.00");
        assertThat(r.sgst()).isEqualByComparingTo("45.00");
        assertThat(r.igst()).isEqualByComparingTo("0");
        assertThat(r.grandTotal()).isEqualByComparingTo("590.00");
        assertThat(r.roundOff()).isEqualByComparingTo("0");
    }

    @Test
    void interStateUsesIgst() {
        TaxCalculator.Result r = calc.calculate(List.of(line("3", "333.33", null, null, "12")), true, false);
        assertThat(r.taxable()).isEqualByComparingTo("999.99");
        assertThat(r.igst()).isEqualByComparingTo("120.00");
        assertThat(r.cgst()).isEqualByComparingTo("0");
        assertThat(r.grandTotal()).isEqualByComparingTo("1119.99");
    }

    @Test
    void percentDiscountAppliesBeforeTax() {
        TaxCalculator.LineResult r = calc.line(line("10", "250.00", "10", null, "5"), false);
        assertThat(r.gross()).isEqualByComparingTo("2500.00");
        assertThat(r.discountAmount()).isEqualByComparingTo("250.00");
        assertThat(r.taxable()).isEqualByComparingTo("2250.00");
        assertThat(r.cgst()).isEqualByComparingTo("56.25");
        assertThat(r.sgst()).isEqualByComparingTo("56.25");
        assertThat(r.total()).isEqualByComparingTo("2362.50");
    }

    @Test
    void amountDiscountWinsAndDerivesPercent() {
        TaxCalculator.LineResult r = calc.line(line("4", "50.00", "99", "20.00", "18"), false);
        assertThat(r.discountAmount()).isEqualByComparingTo("20.00");
        assertThat(r.discountPercent()).isEqualByComparingTo("10.00");
        assertThat(r.taxable()).isEqualByComparingTo("180.00");
    }

    @Test
    void roundOffGoesToNearestRupeeAndIsReported() {
        TaxCalculator.Result r = calc.calculate(List.of(line("1", "99.90", null, null, "18")), false, true);
        // 99.90 + 8.99 + 8.99 = 117.88 -> 118.00, round off +0.12
        assertThat(r.grandTotal()).isEqualByComparingTo("118.00");
        assertThat(r.roundOff()).isEqualByComparingTo("0.12");
    }

    @Test
    void taxIsPerLineSoSummaryEqualsLines() {
        TaxCalculator.Result r = calc.calculate(List.of(
                line("1", "10.01", null, null, "18"), line("1", "10.01", null, null, "18"), line("2", "5.55", null, null, "5")), false, false);
        BigDecimal lineTax = r.lines().stream().map(TaxCalculator.LineResult::tax).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(r.totalTax()).isEqualByComparingTo(lineTax);
        assertThat(r.taxSummary()).hasSize(2);
        BigDecimal summaryTax = r.taxSummary().stream().map(TaxCalculator.TaxSummary::totalTax).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(summaryTax).isEqualByComparingTo(r.totalTax());
    }

    @ParameterizedTest
    @CsvSource({"0,100", "-1,100"})
    void rejectsNonPositiveQuantity(String qty, String rate) {
        assertThatThrownBy(() -> calc.line(line(qty, rate, null, null, "18"), false)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsDiscountAboveLineAmount() {
        assertThatThrownBy(() -> calc.line(line("1", "10", null, "11", "18"), false)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void zeroRatedGoods() {
        TaxCalculator.Result r = calc.calculate(List.of(line("2", "45.50", null, null, "0")), false, true);
        assertThat(r.totalTax()).isEqualByComparingTo("0");
        assertThat(r.grandTotal()).isEqualByComparingTo("91.00");
    }

    @Test
    void interStateDecision() {
        assertThat(TaxCalculator.isInterState("33", "29")).isTrue();
        assertThat(TaxCalculator.isInterState("33", "33")).isFalse();
        assertThat(TaxCalculator.isInterState("33", null)).isFalse();
    }
}
