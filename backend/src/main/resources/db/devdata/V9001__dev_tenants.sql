-- DEVELOPMENT ONLY: extra tenants for trying multi-tenancy (§0B). All names and numbers are fictitious.
--   Super Admin      +919000000009 (seeded at startup from PLATFORM_SUPER_ADMIN_MOBILES, dev default)
--   Textile owner    +919000000011  (tenant "sri-textiles")
--   Builder owner    +919000000012  (tenant "kaveri-build")
--   Two businesses   +919000000005  (ADMIN in "main", OWNER of "sri-textiles": shows the business chooser)
SELECT set_config('app.platform_access', 'on', false);

INSERT INTO businesses (id, name, legal_name, address_line1, city, state, state_code, pincode, mobile, email, gstin,
                        timezone, currency, financial_year_start_month, tenant_code, status, industry, owner_name,
                        owner_mobile, authorized_signatory, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000002', 'Sri Lakshmi Textiles', 'Sri Lakshmi Textiles', '4 Silk Bazaar', 'Erode',
  'Tamil Nadu', '33', '638001', '+919000000011', 'textiles@example.com', '33AAAAA1111A1Z5', 'Asia/Kolkata', 'INR', 4,
  'sri-textiles', 'ACTIVE', 'TEXTILE', 'Lakshmi Narayanan', '+919000000011', 'For Sri Lakshmi Textiles', now(), now()),
 ('00000000-0000-0000-0000-000000000003', 'Kaveri Building Materials', 'Kaveri Building Materials', '22 Ring Road', 'Mysuru',
  'Karnataka', '29', '570001', '+919000000012', 'kaveri@example.com', '29BBBBB2222B1Z5', 'Asia/Kolkata', 'INR', 4,
  'kaveri-build', 'ACTIVE', 'CONSTRUCTION', 'Arun Gowda', '+919000000012', 'For Kaveri Building Materials', now(), now());

INSERT INTO business_settings (business_id, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000002', now()), ('00000000-0000-0000-0000-000000000003', now());
INSERT INTO invoice_settings (business_id, invoice_prefix, default_payment_terms, default_footer, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000002', 'SLT', 'Payment within 30 days', 'This is a Computer Generated Invoice', now()),
 ('00000000-0000-0000-0000-000000000003', 'KBM', 'Payment within 15 days', 'This is a Computer Generated Invoice', now());
INSERT INTO tax_settings (business_id, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000002', now()), ('00000000-0000-0000-0000-000000000003', now());

INSERT INTO users (id, business_id, mobile_number, full_name, email, status, created_at, updated_at) VALUES
 ('00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0000-000000000002', '+919000000011', 'Lakshmi Narayanan', NULL, 'ACTIVE', now(), now()),
 ('00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0000-000000000003', '+919000000012', 'Arun Gowda', NULL, 'ACTIVE', now(), now()),
 ('00000000-0000-0000-0003-000000000051', '00000000-0000-0000-0000-000000000001', '+919000000005', 'Meena Raj', NULL, 'ACTIVE', now(), now()),
 ('00000000-0000-0000-0003-000000000052', '00000000-0000-0000-0000-000000000002', '+919000000005', 'Meena Raj', NULL, 'ACTIVE', now(), now());
INSERT INTO user_roles (user_id, role_id) VALUES
 ('00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0001-000000000001'),
 ('00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0001-000000000001'),
 ('00000000-0000-0000-0003-000000000051', '00000000-0000-0000-0001-000000000002'),
 ('00000000-0000-0000-0003-000000000052', '00000000-0000-0000-0001-000000000001');

INSERT INTO categories (id, business_id, name, sort_order, created_at, updated_at) VALUES
 ('00000000-0000-0000-0004-000000000201', '00000000-0000-0000-0000-000000000002', 'Shirting', 0, now(), now()),
 ('00000000-0000-0000-0004-000000000202', '00000000-0000-0000-0000-000000000002', 'Sarees', 1, now(), now()),
 ('00000000-0000-0000-0004-000000000203', '00000000-0000-0000-0000-000000000002', 'Dress material', 2, now(), now()),
 ('00000000-0000-0000-0004-000000000301', '00000000-0000-0000-0000-000000000003', 'Cement', 0, now(), now()),
 ('00000000-0000-0000-0004-000000000302', '00000000-0000-0000-0000-000000000003', 'Steel / TMT', 1, now(), now()),
 ('00000000-0000-0000-0004-000000000303', '00000000-0000-0000-0000-000000000003', 'Sand & aggregates', 2, now(), now());

INSERT INTO tenant_modules (business_id, module_code, enabled, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000002', 'VARIANTS', TRUE, now()),
 ('00000000-0000-0000-0000-000000000002', 'UOM_CONVERSIONS', TRUE, now()),
 ('00000000-0000-0000-0000-000000000002', 'JOB_WORK', TRUE, now()),
 ('00000000-0000-0000-0000-000000000002', 'COMMISSION', TRUE, now()),
 ('00000000-0000-0000-0000-000000000002', 'BARCODE_LABELS', TRUE, now()),
 ('00000000-0000-0000-0000-000000000002', 'PURCHASE_ORDERS', TRUE, now()),
 ('00000000-0000-0000-0000-000000000002', 'SUPPLIER_PORTAL', TRUE, now()),
 ('00000000-0000-0000-0000-000000000003', 'UOM_CONVERSIONS', TRUE, now()),
 ('00000000-0000-0000-0000-000000000003', 'DAILY_RATES', TRUE, now()),
 ('00000000-0000-0000-0000-000000000003', 'DELIVERY_CHALLAN', TRUE, now()),
 ('00000000-0000-0000-0000-000000000003', 'CHARGES', TRUE, now()),
 ('00000000-0000-0000-0000-000000000003', 'EWAY_BILL', TRUE, now()),
 ('00000000-0000-0000-0000-000000000003', 'PROJECT_ACCOUNTS', TRUE, now());
