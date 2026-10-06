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
    GENERAL("General trading", "Plain catalogue, no special options", Set.of(), List.of("PCS", "BOX", "NOS", "PACK", "CASE", "CARTON", "SET", "DOZEN", "KG", "L", "M"), List.of()),
    GROCERY("Grocery / FMCG / kirana wholesale", "Batch + expiry, case/pack/piece units, MRP, schemes, barcode",
            Set.of(BATCH_EXPIRY, UOM_CONVERSIONS, SCHEMES, BARCODE_LABELS),
            List.of("PCS", "BOX", "PACK", "CASE", "CARTON", "KG", "G", "L", "ML", "BAG"),
            List.of("Staples", "Edible oil", "Spices", "Beverages", "Snacks", "Personal care", "Household")),
    TEXTILE("Textile / fabric / garments", "Size × colour variants, metres, job work, broker commission",
            Set.of(VARIANTS, UOM_CONVERSIONS, JOB_WORK, COMMISSION, BARCODE_LABELS),
            List.of("PCS", "BOX", "M", "ROLL", "SET", "DOZEN", "KG", "BUNDLE"),
            List.of("Shirting", "Suiting", "Sarees", "Dress material", "Readymade", "Lining")),
    CONSTRUCTION("Construction materials", "Weight units, daily rates, delivery challan, transport charges, project accounts",
            Set.of(UOM_CONVERSIONS, DAILY_RATES, DELIVERY_CHALLAN, CHARGES, EWAY_BILL, PROJECT_ACCOUNTS),
            List.of("PCS", "BOX", "BAG", "KG", "TONNE", "CFT", "SQFT", "NOS", "LOAD"),
            List.of("Cement", "Steel / TMT", "Sand", "Aggregates", "Bricks & blocks", "Tiles", "Plumbing")),
    ELECTRICAL("Electrical / electronics", "Serial + warranty, metre/coil units, quotations",
            Set.of(SERIAL_NUMBERS, UOM_CONVERSIONS, QUOTATIONS, BARCODE_LABELS),
            List.of("PCS", "BOX", "M", "COIL", "NOS", "SET"),
            List.of("Wires & cables", "Switches", "Lighting", "Fans", "Appliances", "MCB & DB")),
    HARDWARE("Hardware & tools", "Metre/kg units, quotations, barcode",
            Set.of(UOM_CONVERSIONS, QUOTATIONS, BARCODE_LABELS),
            List.of("PCS", "BOX", "KG", "M", "SET", "NOS"),
            List.of("Hand tools", "Power tools", "Fasteners", "Pipes & fittings", "Paints")),
    FMCG_DISTRIBUTION("FMCG distribution", "Batch + expiry, schemes, case/pack units",
            Set.of(BATCH_EXPIRY, UOM_CONVERSIONS, SCHEMES, BARCODE_LABELS),
            List.of("PCS", "BOX", "PACK", "CASE", "CARTON"),
            List.of("Food", "Beverages", "Personal care", "Home care")),
    AUTO_PARTS("Auto spares", "Part-number search, serials, quotations",
            Set.of(SERIAL_NUMBERS, QUOTATIONS, BARCODE_LABELS),
            List.of("PCS", "BOX", "SET", "L", "NOS"),
            List.of("Engine", "Brakes", "Electrical", "Lubricants", "Tyres", "Body parts")),
    FOOTWEAR("Footwear", "Size variants, barcode", Set.of(VARIANTS, BARCODE_LABELS), List.of("PCS", "BOX", "PAIR"),
            List.of("Men", "Women", "Kids", "Sports")),
    COSMETICS("Cosmetics", "Batch + expiry, barcode", Set.of(BATCH_EXPIRY, BARCODE_LABELS), List.of("PCS", "BOX", "PACK"),
            List.of("Skin care", "Hair care", "Make-up", "Fragrance")),
    STATIONERY("Stationery", "Simple catalogue, packs", Set.of(UOM_CONVERSIONS, BARCODE_LABELS), List.of("PCS", "BOX", "PACK", "REAM"),
            List.of("Paper", "Writing", "Office", "School")),
    MOBILE_ELECTRONICS("Mobiles & accessories", "IMEI serials and warranty", Set.of(SERIAL_NUMBERS, BARCODE_LABELS), List.of("PCS", "BOX"),
            List.of("Phones", "Accessories", "Chargers", "Audio")),
    PAINTS("Paints", "Shade variants, litre packs", Set.of(VARIANTS, UOM_CONVERSIONS), List.of("PCS", "BOX", "L", "KG"),
            List.of("Interior", "Exterior", "Enamel", "Primer", "Tools")),
    PLASTICS("Plastics & packaging", "Kg/pcs conversions", Set.of(UOM_CONVERSIONS), List.of("PCS", "BOX", "KG", "BUNDLE"),
            List.of("Bags", "Containers", "Film")),
    FURNITURE("Furniture", "Variants, delivery challan", Set.of(VARIANTS, DELIVERY_CHALLAN, CHARGES), List.of("PCS", "BOX", "SET"),
            List.of("Home", "Office", "Outdoor")),
    AGRI_INPUTS("Agri inputs", "Batch + expiry, bag/kg units", Set.of(BATCH_EXPIRY, UOM_CONVERSIONS), List.of("PCS", "BOX", "BAG", "KG", "L"),
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

    /** Product unit codes ({@code Product.Unit}) offered by default; every industry starts with PCS and BOX. */
    public List<String> units() {
        return units;
    }

    /**
     * Words this industry uses in menus and screens (§0B.15): product / customer / supplier names (singular and plural)
     * and the default variant option names. The owner can rename them in Settings.
     */
    public java.util.Map<String, String> terms() {
        String[] t = switch (this) {
            case GENERAL -> new String[]{"Product", "Customer", "Supplier", "Size|Colour"};
            case GROCERY -> new String[]{"Item", "Retailer", "Distributor", "Pack size|Flavour"};
            case TEXTILE -> new String[]{"Article", "Dealer", "Mill", "Size|Colour|Weight"};
            case CONSTRUCTION -> new String[]{"Material", "Contractor", "Manufacturer", "Grade|Size"};
            case ELECTRICAL -> new String[]{"Item", "Dealer", "Distributor", "Rating|Colour"};
            case HARDWARE -> new String[]{"Item", "Customer", "Supplier", "Size|Finish"};
            case FMCG_DISTRIBUTION -> new String[]{"Item", "Retailer", "Company", "Pack size|Flavour"};
            case AUTO_PARTS -> new String[]{"Part", "Customer", "Supplier", "Model|Make"};
            case FOOTWEAR -> new String[]{"Article", "Retailer", "Manufacturer", "Size|Colour"};
            case COSMETICS -> new String[]{"Product", "Retailer", "Distributor", "Shade|Pack size"};
            case STATIONERY -> new String[]{"Item", "Customer", "Supplier", "Size|Colour"};
            case MOBILE_ELECTRONICS -> new String[]{"Product", "Retailer", "Distributor", "Storage|Colour"};
            case PAINTS -> new String[]{"Product", "Dealer", "Company", "Shade|Pack size"};
            case PLASTICS -> new String[]{"Item", "Customer", "Manufacturer", "Size|Thickness"};
            case FURNITURE -> new String[]{"Product", "Customer", "Manufacturer", "Size|Finish"};
            case AGRI_INPUTS -> new String[]{"Product", "Dealer", "Company", "Pack size|Grade"};
        };
        java.util.Map<String, String> m = new java.util.LinkedHashMap<>();
        m.put("product", t[0]);
        m.put("products", plural(t[0]));
        m.put("customer", t[1]);
        m.put("customers", plural(t[1]));
        m.put("supplier", t[2]);
        m.put("suppliers", plural(t[2]));
        m.put("variantOptions", t[3]);
        return m;
    }

    private static String plural(String word) {
        return word.endsWith("y") ? word.substring(0, word.length() - 1) + "ies" : word + "s";
    }

    public List<String> categories() {
        return categories;
    }
}
