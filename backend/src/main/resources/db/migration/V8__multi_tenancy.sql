-- Multi-tenant SaaS (architecture §0B, D-031…D-035): one shared schema, business_id on every tenant-owned row and
-- PostgreSQL row-level security (RLS) keyed on the session settings app.tenant_id / app.platform_access, which the
-- application sets on every pooled connection (TenantAwareDataSource).
--
-- NOTE for every later migration: tables are FORCE ROW LEVEL SECURITY, so a migration that reads or changes tenant
-- rows must first run  SELECT set_config('app.platform_access', 'on', false);  (as this one does).

SELECT set_config('app.platform_access', 'on', false);

-- ---------------------------------------------------------------------------------------------------------------
-- Session helpers used by every policy and by the business_id fill trigger.
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION app_current_tenant() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE FUNCTION app_platform_access() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.platform_access', true), '') = 'on'
$$;

-- Fills business_id on insert when the application did not: from the parent row (TG_ARGV = parent table, FK column)
-- or, for tables without a parent, from the session's tenant. RLS WITH CHECK then rejects any cross-tenant row.
CREATE FUNCTION app_fill_business_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent_id uuid;
    bid       uuid;
BEGIN
    IF NEW.business_id IS NULL THEN
        IF TG_NARGS = 2 THEN
            parent_id := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
            IF parent_id IS NOT NULL THEN
                EXECUTE format('SELECT business_id FROM %I WHERE id = $1', TG_ARGV[0]) INTO bid USING parent_id;
            END IF;
        END IF;
        NEW.business_id := coalesce(bid, app_current_tenant());
    END IF;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Tenants = businesses.
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE businesses
    ADD COLUMN tenant_code    VARCHAR(40),
    ADD COLUMN status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN industry       VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    ADD COLUMN owner_name     VARCHAR(200),
    ADD COLUMN owner_mobile   VARCHAR(16),
    ADD COLUMN status_reason  VARCHAR(500),
    ADD COLUMN created_by     UUID;
UPDATE businesses SET tenant_code = 'main' WHERE id = '00000000-0000-0000-0000-000000000001';
UPDATE businesses SET tenant_code = 't' || substr(replace(id::text, '-', ''), 1, 10) WHERE tenant_code IS NULL;
ALTER TABLE businesses ALTER COLUMN tenant_code SET NOT NULL;
ALTER TABLE businesses ADD CONSTRAINT ux_businesses_tenant_code UNIQUE (tenant_code);
ALTER TABLE businesses ADD CONSTRAINT ck_businesses_tenant_code CHECK (tenant_code ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
ALTER TABLE businesses ADD CONSTRAINT ck_businesses_status CHECK (status IN ('ACTIVE','SUSPENDED'));
ALTER TABLE businesses ADD CONSTRAINT ck_businesses_industry CHECK (industry IN (
    'GENERAL','GROCERY','TEXTILE','CONSTRUCTION','ELECTRICAL','HARDWARE','PHARMACY','FMCG_DISTRIBUTION',
    'STATIONERY','AUTO_PARTS','FOOTWEAR','COSMETICS','AGRI_INPUTS','PAINTS','PLASTICS','FURNITURE','MOBILE_ELECTRONICS'));

-- Per-tenant module switches (§0B.6). A missing row means the module's default applies.
CREATE TABLE tenant_modules (
    business_id     UUID        NOT NULL REFERENCES businesses (id),
    module_code     VARCHAR(40) NOT NULL,
    enabled         BOOLEAN     NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    updated_by      UUID,
    PRIMARY KEY (business_id, module_code)
);

-- Platform operators (SUPER_ADMIN). Not tenant data: no business_id, no RLS.
CREATE TABLE platform_admins (
    id              UUID PRIMARY KEY,
    mobile_number   VARCHAR(16)  NOT NULL,
    full_name       VARCHAR(200) NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ux_platform_admins_mobile UNIQUE (mobile_number),
    CONSTRAINT ck_platform_admins_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

-- A session belongs either to a tenant user (membership) or to a platform admin.
ALTER TABLE user_sessions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE user_sessions
    ADD COLUMN platform_admin_id UUID REFERENCES platform_admins (id),
    ADD COLUMN business_id       UUID REFERENCES businesses (id);
UPDATE user_sessions s SET business_id = u.business_id FROM users u WHERE u.id = s.user_id;
ALTER TABLE user_sessions ADD CONSTRAINT ck_user_sessions_owner
    CHECK ((user_id IS NOT NULL AND platform_admin_id IS NULL) OR (user_id IS NULL AND platform_admin_id IS NOT NULL));
CREATE INDEX ix_user_sessions_platform_admin ON user_sessions (platform_admin_id);

-- Identity (D-032): a users row is one membership of a mobile number in one tenant.
ALTER TABLE users DROP CONSTRAINT ux_users_mobile;
ALTER TABLE users ADD CONSTRAINT ux_users_business_mobile UNIQUE (business_id, mobile_number);
CREATE INDEX ix_users_mobile ON users (mobile_number);

-- Suppliers can now sign in (supplier portal, Phase 3); the role exists from now on.
INSERT INTO roles (id, code, name, description) VALUES
 ('00000000-0000-0000-0001-000000000004', 'SUPPLIER', 'Supplier', 'Supplier of a business: answers purchase orders in the supplier portal');

-- ---------------------------------------------------------------------------------------------------------------
-- business_id on child tables, filled by trigger and backfilled from the parent.
-- ---------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
    spec text[];
    specs text[][] := ARRAY[
        ARRAY['user_roles',              'users',            'user_id'],
        ARRAY['user_permissions',        'users',            'user_id'],
        ARRAY['customer_addresses',      'customers',        'customer_id'],
        ARRAY['customer_credit_profiles','customers',        'customer_id'],
        ARRAY['customer_ledger_entries', 'customers',        'customer_id'],
        ARRAY['supplier_addresses',      'suppliers',        'supplier_id'],
        ARRAY['supplier_ledger_entries', 'suppliers',        'supplier_id'],
        ARRAY['product_prices',          'products',         'product_id'],
        ARRAY['product_images',          'products',         'product_id'],
        ARRAY['stock_balances',          'products',         'product_id'],
        ARRAY['stock_movements',         'products',         'product_id'],
        ARRAY['purchase_items',          'purchases',        'purchase_id'],
        ARRAY['purchase_payments',       'purchases',        'purchase_id'],
        ARRAY['purchase_return_items',   'purchase_returns', 'purchase_return_id'],
        ARRAY['carts',                   'customers',        'customer_id'],
        ARRAY['cart_items',              'carts',            'cart_id'],
        ARRAY['order_items',             'orders',           'order_id'],
        ARRAY['order_status_history',    'orders',           'order_id'],
        ARRAY['deliveries',              'orders',           'order_id'],
        ARRAY['invoice_items',           'invoices',         'invoice_id'],
        ARRAY['invoice_tax_summaries',   'invoices',         'invoice_id'],
        ARRAY['credit_note_items',       'credit_notes',     'credit_note_id'],
        ARRAY['payment_allocations',     'payments',         'payment_id'],
        ARRAY['payment_receipts',        'payments',         'payment_id'],
        ARRAY['sales_return_items',      'sales_returns',    'sales_return_id'],
        ARRAY['notification_events',     'users',            'recipient_user_id'],
        ARRAY['einvoice_requests',       'invoices',         'invoice_id']
    ];
BEGIN
    FOREACH spec SLICE 1 IN ARRAY specs LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN business_id UUID REFERENCES businesses (id)', spec[1]);
        EXECUTE format('UPDATE %I c SET business_id = p.business_id FROM %I p WHERE p.id = c.%I', spec[1], spec[2], spec[3]);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN business_id SET NOT NULL', spec[1]);
        EXECUTE format('CREATE INDEX ix_%s_business ON %I (business_id)', spec[1], spec[1]);
        EXECUTE format('CREATE TRIGGER fill_business_id BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION app_fill_business_id(%L, %L)',
                       spec[1], spec[2], spec[3]);
    END LOOP;
END $$;

-- Tables without a parent: filled from the session tenant. Platform-level rows (e.g. a super admin's audit entry)
-- keep business_id NULL and are visible to the platform only.
ALTER TABLE stored_files ADD COLUMN business_id UUID REFERENCES businesses (id);
ALTER TABLE audit_logs   ADD COLUMN business_id UUID REFERENCES businesses (id);
UPDATE stored_files SET business_id = '00000000-0000-0000-0000-000000000001';
UPDATE audit_logs   SET business_id = '00000000-0000-0000-0000-000000000001';
CREATE INDEX ix_stored_files_business ON stored_files (business_id);
CREATE INDEX ix_audit_logs_business_created ON audit_logs (business_id, created_at DESC);
CREATE TRIGGER fill_business_id BEFORE INSERT ON stored_files FOR EACH ROW EXECUTE FUNCTION app_fill_business_id();
CREATE TRIGGER fill_business_id BEFORE INSERT ON audit_logs   FOR EACH ROW EXECUTE FUNCTION app_fill_business_id();

-- Parent tables: the column already exists; the trigger only supplies it when the application left it empty.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['business_bank_accounts','document_sequences','users','customers','suppliers','categories',
                             'brands','products','stock_adjustments','purchases','purchase_returns','orders','invoices',
                             'credit_notes','debit_notes','payments','sales_returns','whatsapp_messages'] LOOP
        EXECUTE format('CREATE TRIGGER fill_business_id BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION app_fill_business_id()', t);
    END LOOP;
END $$;

-- Document numbers are per tenant (each tenant's sequences start at 1).
ALTER TABLE stock_adjustments DROP CONSTRAINT stock_adjustments_adjustment_number_key;
ALTER TABLE stock_adjustments ADD CONSTRAINT ux_stock_adjustments_number UNIQUE (business_id, adjustment_number);
ALTER TABLE purchase_payments DROP CONSTRAINT purchase_payments_payment_number_key;
ALTER TABLE purchase_payments ADD CONSTRAINT ux_purchase_payments_number UNIQUE (business_id, payment_number);
ALTER TABLE payment_receipts DROP CONSTRAINT payment_receipts_receipt_number_key;
ALTER TABLE payment_receipts ADD CONSTRAINT ux_payment_receipts_number UNIQUE (business_id, receipt_number);

-- ---------------------------------------------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'business_bank_accounts','business_settings','invoice_settings','tax_settings','document_sequences','users',
        'user_roles','user_permissions','stored_files','customers','customer_addresses','customer_credit_profiles',
        'customer_ledger_entries','suppliers','supplier_addresses','supplier_ledger_entries','categories','brands',
        'products','product_prices','product_images','stock_balances','stock_movements','stock_adjustments','purchases',
        'purchase_items','purchase_payments','purchase_returns','purchase_return_items','carts','cart_items','orders',
        'order_items','order_status_history','deliveries','invoices','invoice_items','invoice_tax_summaries',
        'credit_notes','credit_note_items','debit_notes','payments','payment_allocations','payment_receipts',
        'sales_returns','sales_return_items','whatsapp_messages','notification_events','einvoice_requests','audit_logs',
        'tenant_modules'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_platform_access() OR business_id = app_current_tenant()) '
                       'WITH CHECK (app_platform_access() OR business_id = app_current_tenant())', t);
    END LOOP;
END $$;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON businesses USING (app_platform_access() OR id = app_current_tenant())
    WITH CHECK (app_platform_access() OR id = app_current_tenant());

-- ---------------------------------------------------------------------------------------------------------------
-- When the application connects as a superuser (local development, tests), RLS would be bypassed. The application
-- then switches every pooled connection to this non-superuser role (SET ROLE) so the policies apply everywhere.
-- In production the application user is an ordinary owner role, for which FORCE ROW LEVEL SECURITY applies.
-- ---------------------------------------------------------------------------------------------------------------
DO $$
BEGIN
    IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shopflow_rls') THEN
            CREATE ROLE shopflow_rls NOLOGIN NOSUPERUSER NOBYPASSRLS;
        END IF;
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO shopflow_rls', current_schema());
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO shopflow_rls', current_schema());
        EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO shopflow_rls', current_schema());
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shopflow_rls', current_schema());
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO shopflow_rls', current_schema());
    END IF;
END $$;
