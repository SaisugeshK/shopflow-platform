-- DEVELOPMENT ONLY: trade documents (§0B.9) for the demo tenant "main": quotations, delivery challans, e-way bill,
-- job work, agent commission and project accounts are switched on; one agent and one project for Ravi General Stores.
SELECT set_config('app.platform_access', 'on', false);

INSERT INTO tenant_modules (business_id, module_code, enabled, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000001', 'QUOTATIONS', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'DELIVERY_CHALLAN', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'EWAY_BILL', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'JOB_WORK', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'COMMISSION', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'PROJECT_ACCOUNTS', TRUE, now())
ON CONFLICT (business_id, module_code) DO UPDATE SET enabled = TRUE;

INSERT INTO agents (id, business_id, name, mobile_number, commission_percent, active, created_at, updated_at) VALUES
 ('00000000-0000-0000-0009-000000000001', '00000000-0000-0000-0000-000000000001', 'Suresh Brokers', '+919000000011', 2.00, TRUE, now(), now());
UPDATE customers SET agent_id = '00000000-0000-0000-0009-000000000001' WHERE id = '00000000-0000-0000-0004-000000000001';

INSERT INTO projects (id, business_id, customer_id, name, site_address, budget, status, created_at, updated_at) VALUES
 ('00000000-0000-0000-0009-000000000101', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001',
  'New branch fit-out', 'Plot 12, Anna Nagar, Chennai', 250000.00, 'ACTIVE', now(), now());
