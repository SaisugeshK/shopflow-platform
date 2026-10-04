-- Purchase orders and the supplier portal (architecture §0B.8, Phase 3). Modules PURCHASE_ORDERS and SUPPLIER_PORTAL.
SELECT set_config('app.platform_access', 'on', false);

-- A supplier's portal login: a users row with role SUPPLIER in the tenant, linked here.
ALTER TABLE suppliers ADD COLUMN user_id UUID REFERENCES users (id);
CREATE UNIQUE INDEX ux_suppliers_user ON suppliers (user_id) WHERE user_id IS NOT NULL;

INSERT INTO permissions (id, code, description) VALUES
 (gen_random_uuid(), 'SUPPLIER_SELF', 'Supplier portal: own purchase orders, quotations and deliveries');
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000004', id FROM permissions WHERE code = 'SUPPLIER_SELF';

CREATE TABLE purchase_orders (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    po_number           VARCHAR(40)   NOT NULL,
    supplier_id         UUID          NOT NULL REFERENCES suppliers (id),
    status              VARCHAR(25)   NOT NULL DEFAULT 'DRAFT',
    order_date          DATE          NOT NULL,
    expected_date       DATE,
    quote_valid_until   DATE,
    notes               VARCHAR(2000),
    supplier_note       VARCHAR(2000),
    inter_state         BOOLEAN       NOT NULL DEFAULT FALSE,
    revision            INT           NOT NULL DEFAULT 0,
    subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,
    taxable_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
    sent_at             TIMESTAMPTZ,
    quoted_at           TIMESTAMPTZ,
    accepted_at         TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancel_reason       VARCHAR(500),
    created_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    version             BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_purchase_orders_number UNIQUE (business_id, po_number),
    CONSTRAINT ck_purchase_orders_status CHECK (status IN ('DRAFT','SENT','QUOTED','COUNTERED','ACCEPTED',
        'PARTIALLY_RECEIVED','RECEIVED','CLOSED','REJECTED','CANCELLED','EXPIRED'))
);
CREATE INDEX ix_purchase_orders_supplier ON purchase_orders (supplier_id, status);
CREATE INDEX ix_purchase_orders_business_status ON purchase_orders (business_id, status, order_date DESC);

CREATE TABLE purchase_order_lines (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    purchase_order_id   UUID          NOT NULL REFERENCES purchase_orders (id),
    line_number         INT           NOT NULL,
    product_id          UUID REFERENCES products (id),
    description         VARCHAR(300)  NOT NULL,
    hsn_code            VARCHAR(8),
    unit                VARCHAR(20)   NOT NULL,
    unit_factor         NUMERIC(14,4) NOT NULL DEFAULT 1,
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity >= 0),
    rate                NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
    discount_percent    NUMERIC(5,2)  NOT NULL DEFAULT 0,
    tax_rate            NUMERIC(5,2)  NOT NULL DEFAULT 0,
    taxable_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- Supplier's answer.
    availability        VARCHAR(20)   NOT NULL DEFAULT 'AVAILABLE',
    delivery_date       DATE,
    line_note           VARCHAR(500),
    substitute_note     VARCHAR(500),
    added_by            VARCHAR(10)   NOT NULL DEFAULT 'BUSINESS',
    status              VARCHAR(12)   NOT NULL DEFAULT 'OPEN',
    received_quantity   NUMERIC(14,3) NOT NULL DEFAULT 0,
    CONSTRAINT ux_purchase_order_lines UNIQUE (purchase_order_id, line_number),
    CONSTRAINT ck_po_lines_availability CHECK (availability IN ('AVAILABLE','PARTIAL','UNAVAILABLE')),
    CONSTRAINT ck_po_lines_added_by CHECK (added_by IN ('BUSINESS','SUPPLIER')),
    CONSTRAINT ck_po_lines_status CHECK (status IN ('OPEN','ACCEPTED','REJECTED'))
);

-- Every round is immutable: who changed what, with a full snapshot of the lines (JSON).
CREATE TABLE purchase_order_revisions (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    purchase_order_id   UUID          NOT NULL REFERENCES purchase_orders (id),
    revision            INT           NOT NULL,
    actor_type          VARCHAR(10)   NOT NULL,
    actor_user_id       UUID,
    actor_name          VARCHAR(200),
    action              VARCHAR(20)   NOT NULL,
    note                VARCHAR(2000),
    grand_total         NUMERIC(14,2) NOT NULL,
    snapshot            TEXT          NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ux_po_revisions UNIQUE (purchase_order_id, revision),
    CONSTRAINT ck_po_revisions_actor CHECK (actor_type IN ('BUSINESS','SUPPLIER','SYSTEM'))
);
CREATE TRIGGER no_delete_po_revisions BEFORE DELETE ON purchase_order_revisions FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TABLE purchase_order_attachments (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    purchase_order_id   UUID          NOT NULL REFERENCES purchase_orders (id),
    file_id             UUID          NOT NULL REFERENCES stored_files (id),
    file_name           VARCHAR(300),
    uploaded_by_type    VARCHAR(10)   NOT NULL,
    uploaded_by         UUID,
    created_at          TIMESTAMPTZ   NOT NULL
);

-- Goods receipt (GRN): what actually arrived against accepted lines; posting it creates the purchase (stock in +
-- supplier ledger) through the existing purchase posting.
CREATE TABLE goods_receipts (
    id                      UUID PRIMARY KEY,
    business_id             UUID          NOT NULL REFERENCES businesses (id),
    grn_number              VARCHAR(40)   NOT NULL,
    purchase_order_id       UUID          NOT NULL REFERENCES purchase_orders (id),
    supplier_id             UUID          NOT NULL REFERENCES suppliers (id),
    receipt_date            DATE          NOT NULL,
    supplier_invoice_number VARCHAR(60),
    supplier_invoice_date   DATE,
    file_id                 UUID REFERENCES stored_files (id),
    purchase_id             UUID REFERENCES purchases (id),
    notes                   VARCHAR(2000),
    has_mismatch            BOOLEAN       NOT NULL DEFAULT FALSE,
    created_by              UUID,
    created_at              TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ux_goods_receipts_number UNIQUE (business_id, grn_number)
);

CREATE TABLE goods_receipt_lines (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    goods_receipt_id    UUID          NOT NULL REFERENCES goods_receipts (id),
    po_line_id          UUID          NOT NULL REFERENCES purchase_order_lines (id),
    product_id          UUID          NOT NULL REFERENCES products (id),
    received_quantity   NUMERIC(14,3) NOT NULL CHECK (received_quantity >= 0),
    damaged_quantity    NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
    rate                NUMERIC(14,2) NOT NULL,
    batch_number        VARCHAR(60),
    mfg_date            DATE,
    expiry_date         DATE,
    serial_numbers      TEXT,
    mismatch_note       VARCHAR(300)
);

-- Tenant isolation and business_id fill-in for the new tables (same rules as V8).
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['purchase_orders','purchase_order_lines','purchase_order_revisions',
                             'purchase_order_attachments','goods_receipts','goods_receipt_lines'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_platform_access() OR business_id = app_current_tenant()) '
                       'WITH CHECK (app_platform_access() OR business_id = app_current_tenant())', t);
    END LOOP;
END $$;
CREATE TRIGGER fill_business_id BEFORE INSERT ON purchase_orders FOR EACH ROW EXECUTE FUNCTION app_fill_business_id();
CREATE TRIGGER fill_business_id BEFORE INSERT ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('purchase_orders', 'purchase_order_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON purchase_order_revisions FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('purchase_orders', 'purchase_order_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON purchase_order_attachments FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('purchase_orders', 'purchase_order_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON goods_receipts FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('purchase_orders', 'purchase_order_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('goods_receipts', 'goods_receipt_id');
