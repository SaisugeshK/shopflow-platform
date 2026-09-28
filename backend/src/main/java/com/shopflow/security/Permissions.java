package com.shopflow.security;

/**
 * Permission codes seeded by V7__reference_data.sql. Authorization checks use these, never role names, so Admin
 * capabilities can be widened per user without code changes (§3.2).
 */
public final class Permissions {

    public static final String DASHBOARD_VIEW = "DASHBOARD_VIEW";
    public static final String DASHBOARD_OWNER_VIEW = "DASHBOARD_OWNER_VIEW";
    public static final String PRODUCT_READ = "PRODUCT_READ";
    public static final String PRODUCT_WRITE = "PRODUCT_WRITE";
    public static final String STOCK_READ = "STOCK_READ";
    public static final String STOCK_WRITE = "STOCK_WRITE";
    public static final String PURCHASE_READ = "PURCHASE_READ";
    public static final String PURCHASE_WRITE = "PURCHASE_WRITE";
    public static final String SUPPLIER_READ = "SUPPLIER_READ";
    public static final String SUPPLIER_WRITE = "SUPPLIER_WRITE";
    public static final String CUSTOMER_READ = "CUSTOMER_READ";
    public static final String CUSTOMER_WRITE = "CUSTOMER_WRITE";
    public static final String CREDIT_OVERRIDE = "CREDIT_OVERRIDE";
    public static final String ORDER_READ = "ORDER_READ";
    public static final String ORDER_WRITE = "ORDER_WRITE";
    public static final String INVOICE_READ = "INVOICE_READ";
    public static final String INVOICE_WRITE = "INVOICE_WRITE";
    public static final String PAYMENT_READ = "PAYMENT_READ";
    public static final String PAYMENT_WRITE = "PAYMENT_WRITE";
    public static final String RETURN_READ = "RETURN_READ";
    public static final String RETURN_WRITE = "RETURN_WRITE";
    public static final String REPORT_READ = "REPORT_READ";
    public static final String REPORT_FINANCIAL = "REPORT_FINANCIAL";
    public static final String USER_MANAGE = "USER_MANAGE";
    public static final String SETTINGS_MANAGE = "SETTINGS_MANAGE";
    public static final String AUDIT_READ = "AUDIT_READ";
    public static final String CATALOG_BROWSE = "CATALOG_BROWSE";
    public static final String CUSTOMER_SELF = "CUSTOMER_SELF";

    private Permissions() {
    }
}
