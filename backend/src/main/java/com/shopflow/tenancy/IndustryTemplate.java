package com.shopflow.tenancy;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import static com.shopflow.tenancy.ModuleCode.*;

/**
 * Industry templates chosen when a tenant is created (§0B.7). A template only pre-sets modules, units and sample
 * categories; everything stays editable afterwards. Pharma is intentionally absent until a compliance review.
 */
public enum IndustryTemplate {
    GENERAL("General trading", "Plain catalogue, no special options", Set.of(), List.of("pcs", "box"), List.of()),
    GROCERY("Grocery / FMCG / kirana wholesale", "Batch + expiry, case/pack/piece units, MRP, schemes, barcode",
            Set.of(BATCH_EXPIRY, UOM_CONVERSIONS, SCHEMES, BARCODE_LABELS),
            List.of("pcs", "pack", "case", "kg", "g", "ltr", "ml"),
            List.of("Staples", "Edible oil", "Spices", "Beverages", "Snacks", "Personal care", "Household")),
    TEXTILE("Textile / fabric / garments", "Size × colour variants, metres, job work, broker commission",
            Set.of(VARIANTS, UOM_CONVERSIONS, JOB_WORK, COMMISSION, BARCODE_LABELS),
            List.of("pcs", "mtr", "roll", "set", "dozen"),
            List.of("Shirting", "Suiting", "Sarees", "Dress material", "Readymade", "Lining")),
    CONSTRUCTION("Construction materials", "Weight units, daily rates, delivery challan, transport charges, project accounts",
            Set.of(UOM_CONVERSIONS, DAILY_RATES, DELIVERY_CHALLAN, CHARGES, EWAY_BILL, PROJECT_ACCOUNTS),
            List.of("bag", "kg", "tonne", "cft", "sqft", "nos", "load"),
            List.of("Cement", "Steel / TMT", "Sand", "Aggregates", "Bricks & blocks", "Tiles", "Plumbing")),
    ELECTRICAL("Electrical / electronics", "Serial + warranty, metre/coil units, quotations",
            Set.of(SERIAL_NUMBERS, UOM_CONVERSIONS, QUOTATIONS, BARCODE_LABELS),
            List.of("pcs", "mtr", "coil", "box"),
            List.of("Wires & cables", "Switches", "Lighting", "Fans", "Appliances", "MCB & DB")),
    HARDWARE("Hardware & tools", "Metre/kg units, quotations, barcode",
            Set.of(UOM_CONVERSIONS, QUOTATIONS, BARCODE_LABELS),
            List.of("pcs", "kg", "mtr", "box", "set"),
            List.of("Hand tools", "Power tools", "Fasteners", "Pipes & fittings", "Paints")),
    FMCG_DISTRIBUTION("FMCG distribution", "Batch + expiry, schemes, case/pack units",
            Set.of(BATCH_EXPIRY, UOM_CONVERSIONS, SCHEMES, BARCODE_LABELS),
            List.of("pcs", "pack", "case"),
            List.of("Food", "Beverages", "Personal care", "Home care")),
    AUTO_PARTS("Auto spares", "Part-number search, serials, quotations",
            Set.of(SERIAL_NUMBERS, QUOTATIONS, BARCODE_LABELS),
            List.of("pcs", "set", "ltr"),
            List.of("Engine", "Brakes", "Electrical", "Lubricants", "Tyres", "Body parts")),
    FOOTWEAR("Footwear", "Size variants, barcode", Set.of(VARIANTS, BARCODE_LABELS), List.of("pair", "box"),
            List.of("Men", "Women", "Kids", "Sports")),
    COSMETICS("Cosmetics", "Batch + expiry, barcode", Set.of(BATCH_EXPIRY, BARCODE_LABELS), List.of("pcs", "box"),
            List.of("Skin care", "Hair care", "Make-up", "Fragrance")),
    STATIONERY("Stationery", "Simple catalogue, packs", Set.of(UOM_CONVERSIONS, BARCODE_LABELS), List.of("pcs", "pack", "ream", "box"),
            List.of("Paper", "Writing", "Office", "School")),
    MOBILE_ELECTRONICS("Mobiles & accessories", "IMEI serials and warranty", Set.of(SERIAL_NUMBERS, BARCODE_LABELS), List.of("pcs"),
            List.of("Phones", "Accessories", "Chargers", "Audio")),
    PAINTS("Paints", "Shade variants, litre packs", Set.of(VARIANTS, UOM_CONVERSIONS), List.of("ltr", "pcs", "kg"),
            List.of("Interior", "Exterior", "Enamel", "Primer", "Tools")),
    PLASTICS("Plastics & packaging", "Kg/pcs conversions", Set.of(UOM_CONVERSIONS), List.of("kg", "pcs", "bundle"),
            List.of("Bags", "Containers", "Film")),
    FURNITURE("Furniture", "Variants, delivery challan", Set.of(VARIANTS, DELIVERY_CHALLAN, CHARGES), List.of("pcs", "set"),
            List.of("Home", "Office", "Outdoor")),
    AGRI_INPUTS("Agri inputs", "Batch + expiry, bag/kg units", Set.of(BATCH_EXPIRY, UOM_CONVERSIONS), List.of("bag", "kg", "ltr"),
            List.of("Seeds", "Fertilisers", "Pesticides", "Tools"));

    private final String label;
    private final String description;
    private final Set<ModuleCode> modules;
    private final List<String> units;
    private final List<String> categories;

    IndustryTemplate(String label, String description, Set<ModuleCode> modules, List<String> units, List<String> categories) {
        this.label = label;
        this.description = description;
        this.modules = modules.isEmpty() ? Set.of() : EnumSet.copyOf(modules);
        this.units = units;
        this.categories = categories;
    }

    public String label() {
        return label;
    }

    public String description() {
        return description;
    }

    /** Modules switched on in addition to the defaults. */
    public Set<ModuleCode> modules() {
        return modules;
    }

    public List<String> units() {
        return units;
    }

    public List<String> categories() {
        return categories;
    }
}
