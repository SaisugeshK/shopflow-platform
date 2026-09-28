package com.shopflow.reports;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Tabular report: typed columns, rows keyed by column key, and column totals. Used for JSON and for CSV/Excel/PDF
 * exports, so every format shows exactly the same numbers.
 */
public record ReportResult(String name, String title, LocalDate from, LocalDate to, List<Column> columns,
                           List<Map<String, Object>> rows, Map<String, Object> totals) {

    public record Column(String key, String label, Type type) {
    }

    public enum Type { TEXT, DATE, MONEY, QUANTITY, NUMBER, PERCENT }

    public static Column text(String key, String label) {
        return new Column(key, label, Type.TEXT);
    }

    public static Column date(String key, String label) {
        return new Column(key, label, Type.DATE);
    }

    public static Column money(String key, String label) {
        return new Column(key, label, Type.MONEY);
    }

    public static Column qty(String key, String label) {
        return new Column(key, label, Type.QUANTITY);
    }

    public static Column number(String key, String label) {
        return new Column(key, label, Type.NUMBER);
    }
}
