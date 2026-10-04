-- Industry options (architecture §0B.7, Phase 2): unit conversions, decimal quantities, variants, batch + expiry,
-- serial / IMEI numbers, pricing modes and daily rates, schemes, invoice charges and barcodes. Each option is switched
-- on per tenant by a module (§0B.6); the columns below default to "off", so existing behaviour is unchanged.
SELECT set_config('app.platform_access', 'on', false);

-- ---------------------------------------------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE products DROP CONSTRAINT ck_products_unit;
ALTER TABLE products ADD CONSTRAINT ck_products_unit CHECK (unit IN (
    'PCS','BOX','PACK','KG','G','L','ML','M','DOZEN','SET','CARTON','BAG',
    'NOS','PAIR','CASE','TONNE','QUINTAL','ROLL','COIL','REAM','BUNDLE','SQFT','CFT','LOAD','CM'));

ALTER TABLE products
    ADD COLUMN barcode              VARCHAR(60),
    -- Quantities with up to 3 decimals (metres, kg, litres); otherwise whole numbers only.
    ADD COLUMN decimal_quantity     BOOLEAN       NOT NULL DEFAULT FALSE,
    -- FIXED: selling_price as entered. MRP: selling_price = MRP less mrp_discount_percent. DAILY_RATE: selling_price is
    -- today's rate from product_daily_rates (an order keeps the rate it was placed at).
    ADD COLUMN pricing_mode         VARCHAR(20)   NOT NULL DEFAULT 'FIXED',
    ADD COLUMN mrp_discount_percent NUMERIC(5,2),
    ADD COLUMN track_batches        BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN track_serials        BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN warranty_months      INT,
    -- Variants: a group product (not sold, no stock) and its child products, one per attribute combination.
    ADD COLUMN variant_group        BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN parent_id            UUID REFERENCES products (id),
    ADD COLUMN variant_attributes   VARCHAR(500),
    ADD CONSTRAINT ck_products_pricing_mode CHECK (pricing_mode IN ('FIXED','MRP','DAILY_RATE')),
    ADD CONSTRAINT ck_products_mrp_discount CHECK (mrp_discount_percent IS NULL OR (mrp_discount_percent >= 0 AND mrp_discount_percent <= 100)),
    ADD CONSTRAINT ck_products_warranty CHECK (warranty_months IS NULL OR warranty_months BETWEEN 0 AND 240),
    ADD CONSTRAINT ck_products_tracking CHECK (NOT (track_batches AND track_serials));
UPDATE products SET decimal_quantity = TRUE WHERE unit IN ('KG','G','L','ML','M');
CREATE UNIQUE INDEX ux_products_barcode ON products (business_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX ix_products_parent ON products (parent_id);

-- Alternate units with an exact factor to the product's base unit (1 CASE = 12 PCS; 1 BAG = 50 KG).
CREATE TABLE product_units (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    product_id      UUID          NOT NULL REFERENCES products (id),
    unit            VARCHAR(20)   NOT NULL,
    factor          NUMERIC(14,4) NOT NULL CHECK (factor > 0),
    barcode         VARCHAR(60),
    created_at      TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ux_product_units UNIQUE (product_id, unit)
);

-- Effective-dated rate list (construction materials, steel, cement…).
CREATE TABLE product_daily_rates (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    product_id      UUID          NOT NULL REFERENCES products (id),
    effective_date  DATE          NOT NULL,
    rate            NUMERIC(14,2) NOT NULL CHECK (rate >= 0),
    created_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID,
    CONSTRAINT ux_product_daily_rates UNIQUE (product_id, effective_date)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Batch + expiry
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE stock_batches (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    product_id      UUID          NOT NULL REFERENCES products (id),
    batch_number    VARCHAR(60)   NOT NULL,
    mfg_date        DATE,
    expiry_date     DATE,
    on_hand         NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    unit_cost       NUMERIC(14,2),
    purchase_id     UUID REFERENCES purchases (id),
    created_at      TIMESTAMPTZ   NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ux_stock_batches UNIQUE (product_id, batch_number)
);
CREATE INDEX ix_stock_batches_expiry ON stock_batches (business_id, expiry_date) WHERE on_hand > 0;

-- Which batch every tracked stock movement used (traceability, returns go back to the batch they left).
CREATE TABLE batch_movements (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    batch_id            UUID          NOT NULL REFERENCES stock_batches (id),
    stock_movement_id   UUID          NOT NULL REFERENCES stock_movements (id),
    direction           VARCHAR(3)    NOT NULL CHECK (direction IN ('IN','OUT')),
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    reference_type      VARCHAR(30)   NOT NULL,
    reference_id        UUID          NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL
);
CREATE INDEX ix_batch_movements_reference ON batch_movements (reference_type, reference_id);
CREATE INDEX ix_batch_movements_batch ON batch_movements (batch_id);
CREATE TRIGGER no_delete_batch_movements BEFORE DELETE ON batch_movements FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ---------------------------------------------------------------------------------------------------------------
-- Serial / IMEI numbers
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE product_serials (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    product_id          UUID          NOT NULL REFERENCES products (id),
    serial_number       VARCHAR(80)   NOT NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'IN_STOCK',
    purchase_id         UUID REFERENCES purchases (id),
    invoice_id          UUID REFERENCES invoices (id),
    order_id            UUID REFERENCES orders (id),
    customer_id         UUID REFERENCES customers (id),
    sold_at             TIMESTAMPTZ,
    warranty_until      DATE,
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    version             BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_product_serials UNIQUE (business_id, product_id, serial_number),
    CONSTRAINT ck_product_serials_status CHECK (status IN ('IN_STOCK','SOLD','RETURNED_TO_SUPPLIER','REMOVED'))
);
CREATE INDEX ix_product_serials_search ON product_serials (business_id, serial_number);
CREATE INDEX ix_product_serials_product ON product_serials (product_id, status);

-- ---------------------------------------------------------------------------------------------------------------
-- Schemes (calculated by the backend pricing only)
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE schemes (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    name                VARCHAR(120)  NOT NULL,
    -- BUY_X_GET_Y: buy buy_quantity, get free_quantity of the same product free.
    -- QUANTITY_SLAB: min_quantity or more of a product/category ⇒ discount_percent.
    -- VALUE_SLAB: line value at least min_value ⇒ discount_percent.
    scheme_type         VARCHAR(20)   NOT NULL,
    product_id          UUID REFERENCES products (id),
    category_id         UUID REFERENCES categories (id),
    buy_quantity        NUMERIC(14,3),
    free_quantity       NUMERIC(14,3),
    min_quantity        NUMERIC(14,3),
    min_value           NUMERIC(14,2),
    discount_percent    NUMERIC(5,2),
    valid_from          DATE,
    valid_to            DATE,
    active              BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    created_by          UUID,
    version             BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_schemes_type CHECK (scheme_type IN ('BUY_X_GET_Y','QUANTITY_SLAB','VALUE_SLAB')),
    CONSTRAINT ck_schemes_scope CHECK (product_id IS NOT NULL OR category_id IS NOT NULL),
    CONSTRAINT ck_schemes_values CHECK (
        (scheme_type = 'BUY_X_GET_Y' AND buy_quantity > 0 AND free_quantity > 0 AND product_id IS NOT NULL)
     OR (scheme_type = 'QUANTITY_SLAB' AND min_quantity > 0 AND discount_percent > 0 AND discount_percent <= 100)
     OR (scheme_type = 'VALUE_SLAB' AND min_value > 0 AND discount_percent > 0 AND discount_percent <= 100)),
    CONSTRAINT ck_schemes_dates CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
);
CREATE INDEX ix_schemes_active ON schemes (business_id, active);

-- ---------------------------------------------------------------------------------------------------------------
-- Line tables: chosen unit and its factor to the base unit; free (scheme) lines; captured batches/serials
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE cart_items ADD COLUMN unit VARCHAR(20), ADD COLUMN unit_factor NUMERIC(14,4) NOT NULL DEFAULT 1;
ALTER TABLE cart_items DROP CONSTRAINT ux_cart_items_product;
CREATE UNIQUE INDEX ux_cart_items_product_unit ON cart_items (cart_id, product_id, coalesce(unit, ''));

ALTER TABLE order_items
    ADD COLUMN unit_factor  NUMERIC(14,4) NOT NULL DEFAULT 1,
    ADD COLUMN free_item    BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN scheme_id    UUID REFERENCES schemes (id),
    ADD COLUMN scheme_name  VARCHAR(120);

ALTER TABLE invoice_items
    ADD COLUMN unit_factor     NUMERIC(14,4) NOT NULL DEFAULT 1,
    ADD COLUMN free_item       BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN scheme_id       UUID REFERENCES schemes (id),
    ADD COLUMN scheme_name     VARCHAR(120),
    -- Serial numbers chosen for this line (comma separated), and batch details shown on the invoice.
    ADD COLUMN serial_numbers  TEXT,
    ADD COLUMN batch_details   VARCHAR(500);

ALTER TABLE purchase_items
    ADD COLUMN unit_factor     NUMERIC(14,4) NOT NULL DEFAULT 1,
    ADD COLUMN batch_number    VARCHAR(60),
    ADD COLUMN mfg_date        DATE,
    ADD COLUMN expiry_date     DATE,
    ADD COLUMN serial_numbers  TEXT;

-- Invoice-level charges (transport, loading/unloading, cutting…) with their own GST.
CREATE TABLE invoice_charges (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    invoice_id      UUID          NOT NULL REFERENCES invoices (id),
    line_number     INT           NOT NULL,
    charge_type     VARCHAR(30)   NOT NULL,
    description     VARCHAR(200),
    sac_code        VARCHAR(8),
    amount          NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    tax_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
    cgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT ck_invoice_charges_type CHECK (charge_type IN ('TRANSPORT','LOADING','UNLOADING','CUTTING','PACKING','INSURANCE','OTHER')),
    CONSTRAINT ux_invoice_charges_line UNIQUE (invoice_id, line_number)
);
ALTER TABLE invoices ADD COLUMN charges_total NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Expiry rules (business settings).
ALTER TABLE business_settings
    ADD COLUMN block_expired_sales BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN near_expiry_days    INT     NOT NULL DEFAULT 30 CHECK (near_expiry_days BETWEEN 1 AND 365);

-- New movement type for stock written off when a batch expires.
ALTER TABLE stock_movements DROP CONSTRAINT ck_stock_movement_type;
ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movement_type CHECK (movement_type IN ('OPENING','PURCHASE_IN','SALE_OUT',
    'SALES_RETURN_IN','PURCHASE_RETURN_OUT','DAMAGE_OUT','LOSS_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT','EXPIRY_OUT'));

-- ---------------------------------------------------------------------------------------------------------------
-- Tenant isolation for the new tables (same policy as V8) and business_id fill-in triggers
-- ---------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['product_units','product_daily_rates','stock_batches','batch_movements','product_serials',
                             'schemes','invoice_charges'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_platform_access() OR business_id = app_current_tenant()) '
                       'WITH CHECK (app_platform_access() OR business_id = app_current_tenant())', t);
    END LOOP;
END $$;
CREATE TRIGGER fill_business_id BEFORE INSERT ON product_units FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('products', 'product_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON product_daily_rates FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('products', 'product_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON stock_batches FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('products', 'product_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON batch_movements FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('stock_batches', 'batch_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON product_serials FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('products', 'product_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON schemes FOR EACH ROW EXECUTE FUNCTION app_fill_business_id();
CREATE TRIGGER fill_business_id BEFORE INSERT ON invoice_charges FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('invoices', 'invoice_id');
