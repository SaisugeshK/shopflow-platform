package com.shopflow.common.sequence;

/**
 * Independent document number sequences (APPLICATION-ARCHITECTURE.md §98).
 * Financial-year scoped types produce PREFIX/2026-27/000001; master-data codes produce PREFIX-000001.
 */
public enum DocumentType {
    INVOICE("INV", true),
    ORDER("ORD", true),
    PURCHASE("PUR", true),
    PAYMENT("PAY", true),
    CREDIT_NOTE("CN", true),
    DEBIT_NOTE("DN", true),
    SALES_RETURN("SR", true),
    PURCHASE_RETURN("PR", true),
    PURCHASE_PAYMENT("PP", true),
    STOCK_ADJUSTMENT("ADJ", true),
    CUSTOMER("CUST", false),
    SUPPLIER("SUP", false);

    private final String defaultPrefix;
    private final boolean financialYearScoped;

    DocumentType(String defaultPrefix, boolean financialYearScoped) {
        this.defaultPrefix = defaultPrefix;
        this.financialYearScoped = financialYearScoped;
    }

    public String defaultPrefix() {
        return defaultPrefix;
    }

    public boolean financialYearScoped() {
        return financialYearScoped;
    }
}
