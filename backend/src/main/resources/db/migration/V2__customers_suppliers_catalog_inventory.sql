-- Customers, suppliers, product catalog and inventory.

CREATE TABLE customers (
    id                  UUID PRIMARY KEY,
    business_id         UUID         NOT NULL REFERENCES businesses (id),
    user_id             UUID REFERENCES users (id),
    customer_code       VARCHAR(30)  NOT NULL,
    shop_name           VARCHAR(200) NOT NULL,
    contact_name        VARCHAR(200) NOT NULL,
    mobile_number       VARCHAR(16)  NOT NULL,
    alternate_mobile    VARCHAR(16),
    email               VARCHAR(200),
    gstin               VARCHAR(15),
    pan                 VARCHAR(10),
    status              VARCHAR(30)  NOT NULL,
    status_reason       VARCHAR(500),
    status_changed_at   TIMESTAMPTZ,
    status_changed_by   UUID REFERENCES users (id),
    notes               TEXT,
    created_at          TIMESTAMPTZ  NOT NULL,
    updated_at          TIMESTAMPTZ  NOT NULL,
    created_by          UUID,
    updated_by          UUID,
    version             BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ux_customers_code UNIQUE (business_id, customer_code),
    CONSTRAINT ux_customers_mobile UNIQUE (business_id, mobile_number),
    CONSTRAINT ux_customers_user UNIQUE (user_id),
    CONSTRAINT ck_customers_status CHECK (status IN ('PENDING_APPROVAL','APPROVED','REJECTED','BLOCKED'))
);
CREATE INDEX ix_customers_status ON customers (status);
CREATE INDEX ix_customers_shop_name ON customers (lower(shop_name));

CREATE TABLE customer_addresses (
    id              UUID PRIMARY KEY,
    customer_id     UUID         NOT NULL REFERENCES customers (id),
    label           VARCHAR(60),
    address_line1   VARCHAR(200) NOT NULL,
    address_line2   VARCHAR(200),
    city            VARCHAR(100) NOT NULL,
    state           VARCHAR(100) NOT NULL,
    state_code      VARCHAR(2)   NOT NULL,
    pincode         VARCHAR(10)  NOT NULL,
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    version         BIGINT       NOT NULL DEFAULT 0
);
CREATE INDEX ix_customer_addresses_customer ON customer_addresses (customer_id);

CREATE TABLE customer_credit_profiles (
    customer_id     UUID PRIMARY KEY REFERENCES customers (id),
    credit_enabled  BOOLEAN       NOT NULL DEFAULT FALSE,
    credit_limit    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
    credit_days     INT           NOT NULL DEFAULT 0 CHECK (credit_days >= 0),
    -- NULL = use business_settings.credit_policy
    credit_policy   VARCHAR(30),
    updated_at      TIMESTAMPTZ   NOT NULL,
    updated_by      UUID,
    version         BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_credit_profile_policy CHECK (credit_policy IS NULL OR credit_policy IN ('BLOCK','REQUIRE_ADMIN_APPROVAL','ALLOW'))
);

-- Append-only customer ledger. Positive balance = customer owes the business.
CREATE TABLE customer_ledger_entries (
    id              UUID PRIMARY KEY,
    customer_id     UUID          NOT NULL REFERENCES customers (id),
    entry_date      DATE          NOT NULL,
    entry_type      VARCHAR(30)   NOT NULL,
    reference_type  VARCHAR(30)   NOT NULL,
    reference_id    UUID          NOT NULL,
    reference_number VARCHAR(40)  NOT NULL,
    debit           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    balance_after   NUMERIC(14,2) NOT NULL,
    narration       VARCHAR(300),
    created_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID,
    CONSTRAINT ck_ledger_one_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
    CONSTRAINT ck_ledger_entry_type CHECK (entry_type IN ('OPENING','INVOICE','PAYMENT','CREDIT_NOTE','DEBIT_NOTE','INVOICE_CANCELLATION','PAYMENT_REVERSAL','ADJUSTMENT'))
);
CREATE INDEX ix_customer_ledger_customer ON customer_ledger_entries (customer_id, created_at);

CREATE TABLE suppliers (
    id              UUID PRIMARY KEY,
    business_id     UUID         NOT NULL REFERENCES businesses (id),
    supplier_code   VARCHAR(30)  NOT NULL,
    name            VARCHAR(200) NOT NULL,
    contact_person  VARCHAR(200),
    mobile_number   VARCHAR(16),
    email           VARCHAR(200),
    gstin           VARCHAR(15),
    pan             VARCHAR(10),
    payment_terms   VARCHAR(200),
    credit_days     INT          NOT NULL DEFAULT 0,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    created_by      UUID,
    updated_by      UUID,
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ux_suppliers_code UNIQUE (business_id, supplier_code)
);
CREATE INDEX ix_suppliers_name ON suppliers (lower(name));

CREATE TABLE supplier_addresses (
    id              UUID PRIMARY KEY,
    supplier_id     UUID         NOT NULL REFERENCES suppliers (id),
    address_line1   VARCHAR(200) NOT NULL,
    address_line2   VARCHAR(200),
    city            VARCHAR(100) NOT NULL,
    state           VARCHAR(100) NOT NULL,
    state_code      VARCHAR(2)   NOT NULL,
    pincode         VARCHAR(10)  NOT NULL,
    is_default      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    version         BIGINT       NOT NULL DEFAULT 0
);
CREATE INDEX ix_supplier_addresses_supplier ON supplier_addresses (supplier_id);

-- Append-only supplier ledger. Positive balance = business owes the supplier.
CREATE TABLE supplier_ledger_entries (
    id              UUID PRIMARY KEY,
    supplier_id     UUID          NOT NULL REFERENCES suppliers (id),
    entry_date      DATE          NOT NULL,
    entry_type      VARCHAR(30)   NOT NULL,
    reference_type  VARCHAR(30)   NOT NULL,
    reference_id    UUID          NOT NULL,
    reference_number VARCHAR(40)  NOT NULL,
    debit           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    balance_after   NUMERIC(14,2) NOT NULL,
    narration       VARCHAR(300),
    created_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID,
    CONSTRAINT ck_supplier_ledger_one_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
    CONSTRAINT ck_supplier_ledger_type CHECK (entry_type IN ('PURCHASE','PURCHASE_PAYMENT','PURCHASE_RETURN','PURCHASE_CANCELLATION','ADJUSTMENT'))
);
CREATE INDEX ix_supplier_ledger_supplier ON supplier_ledger_entries (supplier_id, created_at);

CREATE TABLE categories (
    id          UUID PRIMARY KEY,
    business_id UUID         NOT NULL REFERENCES businesses (id),
    parent_id   UUID REFERENCES categories (id),
    name        VARCHAR(120) NOT NULL,
    description VARCHAR(500),
    sort_order  INT          NOT NULL DEFAULT 0,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    version     BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_categories_name ON categories (business_id, lower(name));

CREATE TABLE brands (
    id          UUID PRIMARY KEY,
    business_id UUID         NOT NULL REFERENCES businesses (id),
    name        VARCHAR(120) NOT NULL,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    version     BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_brands_name ON brands (business_id, lower(name));

CREATE TABLE products (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    sku             VARCHAR(60)   NOT NULL,
    name            VARCHAR(200)  NOT NULL,
    category_id     UUID          NOT NULL REFERENCES categories (id),
    brand_id        UUID REFERENCES brands (id),
    description     TEXT,
    hsn_code        VARCHAR(8),
    unit            VARCHAR(20)   NOT NULL,
    purchase_price  NUMERIC(14,2) NOT NULL CHECK (purchase_price >= 0),
    selling_price   NUMERIC(14,2) NOT NULL CHECK (selling_price >= 0),
    mrp             NUMERIC(14,2) CHECK (mrp IS NULL OR mrp >= 0),
    gst_rate        NUMERIC(5,2)  NOT NULL CHECK (gst_rate >= 0 AND gst_rate <= 100),
    minimum_stock   NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
    active          BOOLEAN       NOT NULL DEFAULT TRUE,
    featured        BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID,
    updated_by      UUID,
    version         BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_products_sku UNIQUE (business_id, sku),
    CONSTRAINT ck_products_unit CHECK (unit IN ('PCS','BOX','PACK','KG','G','L','ML','M','DOZEN','SET','CARTON','BAG'))
);
CREATE INDEX ix_products_category ON products (category_id);
CREATE INDEX ix_products_name ON products (lower(name));

-- Customer-specific pricing. Default price lives on products.selling_price.
CREATE TABLE product_prices (
    id              UUID PRIMARY KEY,
    product_id      UUID          NOT NULL REFERENCES products (id),
    customer_id     UUID          NOT NULL REFERENCES customers (id),
    price           NUMERIC(14,2) NOT NULL CHECK (price >= 0),
    active          BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID,
    version         BIGINT        NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_product_prices_active ON product_prices (product_id, customer_id) WHERE active;

CREATE TABLE product_images (
    id          UUID PRIMARY KEY,
    product_id  UUID        NOT NULL REFERENCES products (id),
    file_id     UUID        NOT NULL REFERENCES stored_files (id),
    sort_order  INT         NOT NULL DEFAULT 0,
    is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_product_images_product ON product_images (product_id);

-- Materialised balance maintained in the same transaction as every stock movement.
CREATE TABLE stock_balances (
    product_id      UUID PRIMARY KEY REFERENCES products (id),
    on_hand         NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved        NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    updated_at      TIMESTAMPTZ   NOT NULL,
    version         BIGINT        NOT NULL DEFAULT 0
);

-- Immutable stock journal; current stock = SUM(IN) - SUM(OUT).
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY,
    product_id      UUID          NOT NULL REFERENCES products (id),
    movement_type   VARCHAR(30)   NOT NULL,
    direction       VARCHAR(3)    NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    unit_cost       NUMERIC(14,2),
    balance_after   NUMERIC(14,3) NOT NULL,
    reference_type  VARCHAR(30)   NOT NULL,
    reference_id    UUID          NOT NULL,
    reference_number VARCHAR(40),
    reason          VARCHAR(300),
    created_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID,
    CONSTRAINT ck_stock_direction CHECK (direction IN ('IN','OUT')),
    CONSTRAINT ck_stock_movement_type CHECK (movement_type IN ('OPENING','PURCHASE_IN','SALE_OUT','SALES_RETURN_IN','PURCHASE_RETURN_OUT','DAMAGE_OUT','LOSS_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT'))
);
CREATE INDEX ix_stock_movements_product ON stock_movements (product_id, created_at);
CREATE INDEX ix_stock_movements_reference ON stock_movements (reference_type, reference_id);

CREATE TABLE stock_adjustments (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    adjustment_number   VARCHAR(40)   NOT NULL UNIQUE,
    product_id          UUID          NOT NULL REFERENCES products (id),
    adjustment_type     VARCHAR(20)   NOT NULL,
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    reason              VARCHAR(300)  NOT NULL,
    stock_movement_id   UUID          NOT NULL REFERENCES stock_movements (id),
    created_at          TIMESTAMPTZ   NOT NULL,
    created_by          UUID,
    CONSTRAINT ck_adjustment_type CHECK (adjustment_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','DAMAGE_OUT','LOSS_OUT'))
);
