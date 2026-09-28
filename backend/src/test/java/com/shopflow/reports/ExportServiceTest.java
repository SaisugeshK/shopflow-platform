package com.shopflow.reports;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ExportServiceTest {

    private final ExportService exports = new ExportService();

    private ReportResult report() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("customer", "=HYPERLINK(\"evil\")");
        row.put("amount", new BigDecimal("1234.50"));
        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("amount", new BigDecimal("1234.50"));
        return new ReportResult("sales", "Sales Report", LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30),
                List.of(ReportResult.text("customer", "Customer"), ReportResult.money("amount", "Amount")),
                List.of(row), totals);
    }

    @Test
    void csvNeutralisesFormulaInjection() {
        String csv = new String(exports.csv(report()), StandardCharsets.UTF_8);
        assertThat(csv).contains("\"'=HYPERLINK(\"\"evil\"\")\"");
        assertThat(csv).contains("1234.50");
        assertThat(csv).contains("Total");
    }

    @Test
    void negativeNumbersAreNotEscaped() {
        assertThat(ExportService.escape("-12.50")).isEqualTo("-12.50");
        assertThat(ExportService.escape("-cmd")).isEqualTo("'-cmd");
    }

    @Test
    void xlsxAndPdfAreProduced() {
        assertThat(exports.xlsx(report())).startsWith((byte) 'P', (byte) 'K');
        assertThat(new String(exports.pdf(report()), 0, 4, StandardCharsets.US_ASCII)).isEqualTo("%PDF");
    }
}
