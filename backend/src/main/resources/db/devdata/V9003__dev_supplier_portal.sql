-- DEVELOPMENT ONLY: purchase orders + supplier portal (§0B.8) for the demo tenant "main".
--   Supplier login  +919000000010  (Sample Distributors Pvt Ltd)
SELECT set_config('app.platform_access', 'on', false);

INSERT INTO tenant_modules (business_id, module_code, enabled, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000001', 'PURCHASE_ORDERS', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'SUPPLIER_PORTAL', TRUE, now())
ON CONFLICT (business_id, module_code) DO UPDATE SET enabled = TRUE;

INSERT INTO users (id, business_id, mobile_number, full_name, status, created_at, updated_at) VALUES
 ('00000000-0000-0000-0003-000000000010', '00000000-0000-0000-0000-000000000001', '+919000000010', 'Arun (Sample Distributors)', 'ACTIVE', now(), now());
INSERT INTO user_roles (user_id, role_id) VALUES
 ('00000000-0000-0000-0003-000000000010', '00000000-0000-0000-0001-000000000004');
UPDATE suppliers SET user_id = '00000000-0000-0000-0003-000000000010' WHERE id = '00000000-0000-0000-0005-000000000001';
