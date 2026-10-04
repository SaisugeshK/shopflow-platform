package com.shopflow.tenancy;

import java.util.List;

/**
 * Per-tenant feature switches (§0B.6). Changed only by the Super Admin; a tenant without a row for a module gets its
 * {@link #enabledByDefault} value. {@link #requires} lists modules that must be on as well.
 */
public enum ModuleCode {
    CUSTOMER_PORTAL("Customer ordering (web shop + mobile)", true),
    CREDIT("Credit sales and outstanding", true),
    RETURNS("Sales and purchase returns", true),
    ONLINE_PAYMENTS("Online payments", true),
    WHATSAPP("WhatsApp invoice delivery", true),
    EINVOICE("GST e-invoice", true),
    PURCHASE_ORDERS("Purchase orders and goods receipt", false),
    SUPPLIER_PORTAL("Supplier portal: supplier login and quotation rounds", false, PURCHASE_ORDERS),
    UOM_CONVERSIONS("Unit conversions (case/pack/piece, bag/kg)", false),
    VARIANTS("Product variants (size, colour, design)", false),
    BATCH_EXPIRY("Batch and expiry tracking", false),
    SERIAL_NUMBERS("Serial / IMEI numbers and warranty", false),
    DAILY_RATES("Daily rate list", false),
    SCHEMES("Schemes and slab discounts", false),
    CHARGES("Invoice charges (transport, loading, cutting)", false),
    BARCODE_LABELS("Barcode labels", false),
    QUOTATIONS("Customer quotations", false),
    DELIVERY_CHALLAN("Delivery challans", false),
    EWAY_BILL("E-way bill details", false),
    JOB_WORK("Job work (send out / receive back)", false),
    COMMISSION("Broker / agent commission", false),
    PROJECT_ACCOUNTS("Project / site accounts", false),
    BRANCHES("Branches / warehouses with stock per location", false);

    private final String label;
    private final boolean enabledByDefault;
    private final List<ModuleCode> requires;

    ModuleCode(String label, boolean enabledByDefault, ModuleCode... requires) {
        this.label = label;
        this.enabledByDefault = enabledByDefault;
        // A plain list: EnumSet cannot be built while the enum's own constants are still initialising.
        this.requires = List.of(requires);
    }

    public String label() {
        return label;
    }

    public boolean enabledByDefault() {
        return enabledByDefault;
    }

    public List<ModuleCode> requires() {
        return requires;
    }
}
