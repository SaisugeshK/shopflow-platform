-- Trade documents (architecture §0B.9, Phase 4): customer quotations, delivery challans, e-way bill details, job work,
-- agent/broker commission and project (site) accounts. Each is behind its module (QUOTATIONS, DELIVERY_CHALLAN,
-- EWAY_BILL, JOB_WORK, COMMISSION, PROJECT_ACCOUNTS).
SELECT set_config('app.platform_access', 'on', false);

-- ---------------------------------------------------------------------------------------------------------------
-- Projects / sites of contractor customers
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE projects (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    customer_id     UUID          NOT NULL REFERENCES customers (id),
    name            VARCHAR(200)  NOT NULL,
    site_address    VARCHAR(500),
    budget          NUMERIC(14,2),
    status          VARCHAR(12)   NOT NULL DEFAULT 'ACTIVE',
    created_by      UUID,
    created_at      TIMESTAMPTZ   NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL,
    version         BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_projects_status CHECK (status IN ('ACTIVE','CLOSED'))
);
CREATE INDEX ix_projects_customer ON projects (customer_id);

-- ---------------------------------------------------------------------------------------------------------------
-- Agents / brokers and commission
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE agents (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    name                VARCHAR(200)  NOT NULL,
    mobile_number       VARCHAR(16),
    commission_percent  NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (commission_percent >= 0 AND commission_percent <= 100),
    active              BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    version             BIGINT        NOT NULL DEFAULT 0
);
ALTER TABLE customers ADD COLUMN agent_id UUID REFERENCES agents (id);
ALTER TABLE invoices
    ADD COLUMN project_id           UUID REFERENCES projects (id),
    ADD COLUMN agent_id             UUID REFERENCES agents (id),
    ADD COLUMN commission_percent   NUMERIC(5,2),
    ADD COLUMN commission_amount    NUMERIC(14,2),
    ADD COLUMN commission_paid_at   TIMESTAMPTZ,
    -- E-way bill (mock provider until a real GSP is configured; test numbers are flagged).
    ADD COLUMN eway_bill_number     VARCHAR(20),
    ADD COLUMN eway_bill_date       TIMESTAMPTZ,
    ADD COLUMN eway_valid_until     TIMESTAMPTZ,
    ADD COLUMN eway_distance_km     INT,
    ADD COLUMN eway_test_only       BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN delivery_challan_id  UUID;
ALTER TABLE orders ADD COLUMN project_id UUID REFERENCES projects (id);
ALTER TABLE invoices DROP CONSTRAINT ck_invoices_source;
ALTER TABLE invoices ADD CONSTRAINT ck_invoices_source CHECK (source IN ('ORDER','MANUAL','CHALLAN'));

-- ---------------------------------------------------------------------------------------------------------------
-- Customer quotations
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE quotations (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    quotation_number    VARCHAR(40)   NOT NULL,
    customer_id         UUID          NOT NULL REFERENCES customers (id),
    project_id          UUID REFERENCES projects (id),
    status              VARCHAR(12)   NOT NULL DEFAULT 'DRAFT',
    quote_date          DATE          NOT NULL,
    valid_until         DATE,
    notes               VARCHAR(2000),
    inter_state         BOOLEAN       NOT NULL DEFAULT FALSE,
    subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
    taxable_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
    order_id            UUID REFERENCES orders (id),
    sent_at             TIMESTAMPTZ,
    decided_at          TIMESTAMPTZ,
    decision_note       VARCHAR(500),
    created_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    version             BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_quotations_number UNIQUE (business_id, quotation_number),
    CONSTRAINT ck_quotations_status CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CONVERTED','CANCELLED'))
);
CREATE INDEX ix_quotations_customer ON quotations (customer_id, status);

CREATE TABLE quotation_items (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    quotation_id        UUID          NOT NULL REFERENCES quotations (id),
    line_number         INT           NOT NULL,
    product_id          UUID          NOT NULL REFERENCES products (id),
    product_name        VARCHAR(200)  NOT NULL,
    hsn_code            VARCHAR(8),
    unit                VARCHAR(20)   NOT NULL,
    unit_factor         NUMERIC(14,4) NOT NULL DEFAULT 1,
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    rate                NUMERIC(14,2) NOT NULL CHECK (rate >= 0),
    discount_percent    NUMERIC(5,2)  NOT NULL DEFAULT 0,
    tax_rate            NUMERIC(5,2)  NOT NULL,
    taxable_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT ux_quotation_items UNIQUE (quotation_id, line_number)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Delivery challans: goods leave before the invoice; the invoice made from a challan does not move stock again.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE delivery_challans (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    challan_number      VARCHAR(40)   NOT NULL,
    customer_id         UUID          NOT NULL REFERENCES customers (id),
    project_id          UUID REFERENCES projects (id),
    challan_date        DATE          NOT NULL,
    status              VARCHAR(12)   NOT NULL DEFAULT 'ISSUED',
    purpose             VARCHAR(20)   NOT NULL DEFAULT 'SUPPLY',
    vehicle_number      VARCHAR(20),
    transport           VARCHAR(200),
    destination         VARCHAR(200),
    notes               VARCHAR(2000),
    invoice_id          UUID REFERENCES invoices (id),
    total_value         NUMERIC(14,2) NOT NULL DEFAULT 0,
    cancel_reason       VARCHAR(500),
    created_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    version             BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_delivery_challans_number UNIQUE (business_id, challan_number),
    CONSTRAINT ck_delivery_challans_status CHECK (status IN ('ISSUED','INVOICED','CANCELLED')),
    CONSTRAINT ck_delivery_challans_purpose CHECK (purpose IN ('SUPPLY','APPROVAL','JOB_WORK','OTHER'))
);
CREATE INDEX ix_delivery_challans_customer ON delivery_challans (customer_id, status);
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_challan FOREIGN KEY (delivery_challan_id) REFERENCES delivery_challans (id);

CREATE TABLE delivery_challan_items (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    delivery_challan_id UUID          NOT NULL REFERENCES delivery_challans (id),
    line_number         INT           NOT NULL,
    product_id          UUID          NOT NULL REFERENCES products (id),
    product_name        VARCHAR(200)  NOT NULL,
    hsn_code            VARCHAR(8),
    unit                VARCHAR(20)   NOT NULL,
    unit_factor         NUMERIC(14,4) NOT NULL DEFAULT 1,
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    rate                NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_rate            NUMERIC(5,2)  NOT NULL DEFAULT 0,
    batch_details       VARCHAR(500),
    serial_numbers      TEXT,
    CONSTRAINT ux_delivery_challan_items UNIQUE (delivery_challan_id, line_number)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Job work: material issued to a job worker and processed goods received back.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE job_work_orders (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    job_number          VARCHAR(40)   NOT NULL,
    supplier_id         UUID REFERENCES suppliers (id),
    job_worker_name     VARCHAR(200)  NOT NULL,
    process             VARCHAR(300)  NOT NULL,
    issue_date          DATE          NOT NULL,
    expected_date       DATE,
    status              VARCHAR(12)   NOT NULL DEFAULT 'OPEN',
    notes               VARCHAR(2000),
    charges             NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    version             BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_job_work_number UNIQUE (business_id, job_number),
    CONSTRAINT ck_job_work_status CHECK (status IN ('OPEN','PARTIAL','CLOSED','CANCELLED'))
);

CREATE TABLE job_work_lines (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    job_work_order_id   UUID          NOT NULL REFERENCES job_work_orders (id),
    direction           VARCHAR(8)    NOT NULL,
    product_id          UUID          NOT NULL REFERENCES products (id),
    product_name        VARCHAR(200)  NOT NULL,
    unit                VARCHAR(20)   NOT NULL,
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    -- For ISSUE lines: how much came back unused and how much was used up in the finished goods.
    returned_quantity   NUMERIC(14,3) NOT NULL DEFAULT 0,
    consumed_quantity   NUMERIC(14,3) NOT NULL DEFAULT 0,
    line_date           DATE          NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_job_work_direction CHECK (direction IN ('ISSUE','RECEIVE'))
);

ALTER TABLE stock_movements DROP CONSTRAINT ck_stock_movement_type;
ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movement_type CHECK (movement_type IN ('OPENING','PURCHASE_IN','SALE_OUT',
    'SALES_RETURN_IN','PURCHASE_RETURN_OUT','DAMAGE_OUT','LOSS_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT','EXPIRY_OUT',
    'CHALLAN_OUT','CHALLAN_RETURN_IN','JOB_WORK_OUT','JOB_WORK_IN'));

-- ---------------------------------------------------------------------------------------------------------------
-- Tenant isolation for the new tables
-- ---------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['projects','agents','quotations','quotation_items','delivery_challans','delivery_challan_items',
                             'job_work_orders','job_work_lines'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_platform_access() OR business_id = app_current_tenant()) '
                       'WITH CHECK (app_platform_access() OR business_id = app_current_tenant())', t);
    END LOOP;
END $$;
CREATE TRIGGER fill_business_id BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('customers', 'customer_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON agents FOR EACH ROW EXECUTE FUNCTION app_fill_business_id();
CREATE TRIGGER fill_business_id BEFORE INSERT ON quotations FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('customers', 'customer_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON quotation_items FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('quotations', 'quotation_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON delivery_challans FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('customers', 'customer_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON delivery_challan_items FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('delivery_challans', 'delivery_challan_id');
CREATE TRIGGER fill_business_id BEFORE INSERT ON job_work_orders FOR EACH ROW EXECUTE FUNCTION app_fill_business_id();
CREATE TRIGGER fill_business_id BEFORE INSERT ON job_work_lines FOR EACH ROW EXECUTE FUNCTION app_fill_business_id('job_work_orders', 'job_work_order_id');
