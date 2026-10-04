-- SaaS operations (architecture §0B.14, Phase 5): plans with limits, self-signup requests approved by the Super Admin,
-- custom domains, and branches/warehouses with stock per location and stock transfers.
SELECT set_config('app.platform_access', 'on', false);

-- ---------------------------------------------------------------------------------------------------------------
-- Plans (platform catalogue; NULL limit = unlimited)
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE plans (
    code                    VARCHAR(30)   PRIMARY KEY,
    name                    VARCHAR(100)  NOT NULL,
    description             VARCHAR(500),
    price_monthly           NUMERIC(10,2),
    max_staff               INT,
    max_products            INT,
    max_customers           INT,
    max_invoices_per_month  INT,
    max_branches            INT,
    max_storage_mb          INT,
    active                  BOOLEAN       NOT NULL DEFAULT TRUE,
    sort_order              INT           NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);
INSERT INTO plans (code, name, description, price_monthly, max_staff, max_products, max_customers, max_invoices_per_month, max_branches, max_storage_mb, sort_order) VALUES
 ('FREE',       'Free',       'Try ShopFlow with a small catalogue',          0,       2,   100,   100,   100, 1,   200, 1),
 ('STARTER',    'Starter',    'One shop with a few staff',                  999,       5,  2000,  1000,  1000, 2,  2048, 2),
 ('GROWTH',     'Growth',     'Growing wholesaler with branches',          2499,      15, 20000, 10000, 10000, 5, 10240, 3),
 ('ENTERPRISE', 'Enterprise', 'No limits; priced per agreement',           NULL,    NULL,  NULL,  NULL,  NULL, NULL, NULL, 4);

-- Existing businesses keep working without limits; new ones start on Starter unless the Super Admin chooses.
ALTER TABLE businesses
    ADD COLUMN plan_code        VARCHAR(30)  NOT NULL DEFAULT 'ENTERPRISE' REFERENCES plans (code),
    ADD COLUMN plan_changed_at  TIMESTAMPTZ,
    ADD COLUMN custom_domain    VARCHAR(253);
ALTER TABLE businesses ALTER COLUMN plan_code SET DEFAULT 'STARTER';
CREATE UNIQUE INDEX ux_businesses_custom_domain ON businesses (lower(custom_domain)) WHERE custom_domain IS NOT NULL;

-- ---------------------------------------------------------------------------------------------------------------
-- Self-signup requests (platform table: no tenant yet)
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE tenant_signups (
    id              UUID PRIMARY KEY,
    business_name   VARCHAR(200)  NOT NULL,
    legal_name      VARCHAR(200),
    owner_name      VARCHAR(200)  NOT NULL,
    owner_mobile    VARCHAR(16)   NOT NULL,
    email           VARCHAR(200),
    state           VARCHAR(100)  NOT NULL,
    state_code      VARCHAR(2)    NOT NULL,
    city            VARCHAR(100),
    gstin           VARCHAR(15),
    industry        VARCHAR(30)   NOT NULL,
    plan_code       VARCHAR(30)   NOT NULL REFERENCES plans (code),
    message         VARCHAR(1000),
    status          VARCHAR(12)   NOT NULL DEFAULT 'PENDING',
    decision_reason VARCHAR(500),
    business_id     UUID REFERENCES businesses (id),
    decided_by      UUID,
    decided_at      TIMESTAMPTZ,
    client_ip       VARCHAR(64),
    created_at      TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_tenant_signups_status CHECK (status IN ('PENDING','APPROVED','REJECTED'))
);
CREATE INDEX ix_tenant_signups_status ON tenant_signups (status, created_at DESC);
CREATE UNIQUE INDEX ux_tenant_signups_pending_mobile ON tenant_signups (owner_mobile) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------------------------------------------
-- Branches / warehouses. The default (main) branch holds whatever stock is not in another branch, so only
-- non-default branches have branch_stock rows: total on hand (stock_balances) = main + other branches.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE branches (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    code            VARCHAR(20)   NOT NULL,
    name            VARCHAR(200)  NOT NULL,
    kind            VARCHAR(12)   NOT NULL DEFAULT 'BRANCH',
    address_line1   VARCHAR(300),
    city            VARCHAR(100),
    state           VARCHAR(100),
    state_code      VARCHAR(2),
    phone           VARCHAR(20),
    is_default      BOOLEAN       NOT NULL DEFAULT FALSE,
    active          BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL,
    version         BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_branches_code UNIQUE (business_id, code),
    CONSTRAINT ck_branches_kind CHECK (kind IN ('BRANCH','WAREHOUSE'))
);
CREATE UNIQUE INDEX ux_branches_default ON branches (business_id) WHERE is_default;

CREATE TABLE branch_stock (
    branch_id       UUID          NOT NULL REFERENCES branches (id),
    product_id      UUID          NOT NULL REFERENCES products (id),
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    on_hand         NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    updated_at      TIMESTAMPTZ   NOT NULL,
    PRIMARY KEY (branch_id, product_id)
);
CREATE INDEX ix_branch_stock_product ON branch_stock (product_id);

ALTER TABLE stock_movements ADD COLUMN branch_id UUID REFERENCES branches (id);

CREATE TABLE stock_transfers (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    transfer_number VARCHAR(40)   NOT NULL,
    from_branch_id  UUID          NOT NULL REFERENCES branches (id),
    to_branch_id    UUID          NOT NULL REFERENCES branches (id),
    transfer_date   DATE          NOT NULL,
    notes           VARCHAR(1000),
    created_by      UUID,
    created_at      TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ux_stock_transfers_number UNIQUE (business_id, transfer_number),
    CONSTRAINT ck_stock_transfers_branches CHECK (from_branch_id <> to_branch_id)
);
CREATE TABLE stock_transfer_items (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    transfer_id     UUID          NOT NULL REFERENCES stock_transfers (id),
    product_id      UUID          NOT NULL REFERENCES products (id),
    product_name    VARCHAR(200)  NOT NULL,
    unit            VARCHAR(20)   NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    batch_details   VARCHAR(500)
);

ALTER TABLE stock_movements DROP CONSTRAINT ck_stock_movement_type;
ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movement_type CHECK (movement_type IN ('OPENING','PURCHASE_IN','SALE_OUT',
    'SALES_RETURN_IN','PURCHASE_RETURN_OUT','DAMAGE_OUT','LOSS_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT','EXPIRY_OUT',
    'CHALLAN_OUT','CHALLAN_RETURN_IN','JOB_WORK_OUT','JOB_WORK_IN','TRANSFER_OUT','TRANSFER_IN'));

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['branches','branch_stock','stock_transfers','stock_transfer_items'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_platform_access() OR business_id = app_current_tenant()) '
                       'WITH CHECK (app_platform_access() OR business_id = app_current_tenant())', t);
    END LOOP;
END $$;
CREATE TRIGGER fill_business_id BEFORE INSERT ON branches FOR EACH ROW EXECUTE FUNCTION app_fill_business_id();
CREATE TRIGGER fill_business_id BEFORE INSERT ON branch_stock FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('branches', 'branch_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON stock_transfers FOR EACH ROW EXECUTE FUNCTION app_fill_business_id();
CREATE TRIGGER fill_business_id BEFORE INSERT ON stock_transfer_items FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('stock_transfers', 'transfer_id');
