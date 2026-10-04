-- DEVELOPMENT ONLY: SaaS operations (§0B.14) for the demo: branches on for tenant "main" with a warehouse, and one
-- sign-up request waiting for the Super Admin (+919000000009).
SELECT set_config('app.platform_access', 'on', false);

INSERT INTO tenant_modules (business_id, module_code, enabled, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000001', 'BRANCHES', TRUE, now())
ON CONFLICT (business_id, module_code) DO UPDATE SET enabled = TRUE;

INSERT INTO branches (id, business_id, code, name, kind, city, state, state_code, is_default, active, created_at, updated_at) VALUES
 ('00000000-0000-0000-000a-000000000001', '00000000-0000-0000-0000-000000000001', 'MAIN', 'Main branch', 'BRANCH', 'Chennai', 'Tamil Nadu', '33', TRUE, TRUE, now(), now()),
 ('00000000-0000-0000-000a-000000000002', '00000000-0000-0000-0000-000000000001', 'GODOWN', 'Central Godown', 'WAREHOUSE', 'Chennai', 'Tamil Nadu', '33', FALSE, TRUE, now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO tenant_signups (id, business_name, owner_name, owner_mobile, state, state_code, city, industry, message, status, created_at) VALUES
 ('00000000-0000-0000-000b-000000000001', 'Lakshmi Paints & Hardware', 'Lakshmi N', '+919000000012', 'Tamil Nadu', '33', 'Madurai',
  'PAINTS', 'Two shops in Madurai; want to start with one.', 'PENDING', now());
