-- Reference data required in every environment: the business row, default settings, roles and permissions.
-- Business profile values are placeholders to be edited in Settings; they are not real business data.

INSERT INTO businesses (id, name, state, state_code, timezone, currency, financial_year_start_month, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'Shop Management Platform', 'Tamil Nadu', '33', 'Asia/Kolkata', 'INR', 4, now(), now());

INSERT INTO business_settings (business_id, updated_at) VALUES ('00000000-0000-0000-0000-000000000001', now());
INSERT INTO invoice_settings (business_id, default_payment_terms, default_terms, default_footer, declaration, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001',
        'As per agreed credit terms',
        '1. Goods once sold will not be taken back without prior approval.' || chr(10) || '2. Interest may be charged on overdue amounts.',
        'This is a Computer Generated Invoice',
        'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
        now());
INSERT INTO tax_settings (business_id, updated_at) VALUES ('00000000-0000-0000-0000-000000000001', now());

INSERT INTO roles (id, code, name, description) VALUES
 ('00000000-0000-0000-0001-000000000001', 'OWNER', 'Owner', 'Full business visibility and configuration access'),
 ('00000000-0000-0000-0001-000000000002', 'ADMIN', 'Admin', 'Operational business user'),
 ('00000000-0000-0000-0001-000000000003', 'CUSTOMER', 'Customer', 'Retail-shop customer purchasing from the business');

INSERT INTO permissions (id, code, description) VALUES
 (gen_random_uuid(), 'DASHBOARD_VIEW',       'View the operational dashboard'),
 (gen_random_uuid(), 'DASHBOARD_OWNER_VIEW', 'View the owner dashboard (profit and financial KPIs)'),
 (gen_random_uuid(), 'PRODUCT_READ',         'View products and categories'),
 (gen_random_uuid(), 'PRODUCT_WRITE',        'Create and edit products and categories'),
 (gen_random_uuid(), 'STOCK_READ',           'View stock and stock movements'),
 (gen_random_uuid(), 'STOCK_WRITE',          'Adjust stock'),
 (gen_random_uuid(), 'PURCHASE_READ',        'View purchases and purchase returns'),
 (gen_random_uuid(), 'PURCHASE_WRITE',       'Create and post purchases and purchase returns'),
 (gen_random_uuid(), 'SUPPLIER_READ',        'View suppliers and supplier ledger'),
 (gen_random_uuid(), 'SUPPLIER_WRITE',       'Create and edit suppliers'),
 (gen_random_uuid(), 'CUSTOMER_READ',        'View customers, ledgers and outstanding'),
 (gen_random_uuid(), 'CUSTOMER_WRITE',       'Create, edit, approve and block customers'),
 (gen_random_uuid(), 'CREDIT_OVERRIDE',      'Override credit limit rules'),
 (gen_random_uuid(), 'ORDER_READ',           'View orders'),
 (gen_random_uuid(), 'ORDER_WRITE',          'Accept, progress and cancel orders'),
 (gen_random_uuid(), 'INVOICE_READ',         'View invoices'),
 (gen_random_uuid(), 'INVOICE_WRITE',        'Create, generate, cancel and send invoices'),
 (gen_random_uuid(), 'PAYMENT_READ',         'View payments'),
 (gen_random_uuid(), 'PAYMENT_WRITE',        'Record and cancel payments'),
 (gen_random_uuid(), 'RETURN_READ',          'View sales returns'),
 (gen_random_uuid(), 'RETURN_WRITE',         'Approve or reject sales returns'),
 (gen_random_uuid(), 'REPORT_READ',          'View operational reports'),
 (gen_random_uuid(), 'REPORT_FINANCIAL',     'View profit and GST/tax reports'),
 (gen_random_uuid(), 'USER_MANAGE',          'Manage admin users and permissions'),
 (gen_random_uuid(), 'SETTINGS_MANAGE',      'Change business, invoice, tax and integration settings'),
 (gen_random_uuid(), 'AUDIT_READ',           'View audit logs'),
 (gen_random_uuid(), 'CATALOG_BROWSE',       'Browse the customer catalog'),
 (gen_random_uuid(), 'CUSTOMER_SELF',        'Access own customer account, cart, orders, invoices and payments');

-- OWNER: every staff permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000001', id FROM permissions WHERE code NOT IN ('CATALOG_BROWSE', 'CUSTOMER_SELF');

-- ADMIN: operational permissions; no owner dashboard, financial reports, user management, settings or audit by default.
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000002', id FROM permissions WHERE code IN (
 'DASHBOARD_VIEW','PRODUCT_READ','PRODUCT_WRITE','STOCK_READ','STOCK_WRITE','PURCHASE_READ','PURCHASE_WRITE',
 'SUPPLIER_READ','SUPPLIER_WRITE','CUSTOMER_READ','CUSTOMER_WRITE','ORDER_READ','ORDER_WRITE','INVOICE_READ',
 'INVOICE_WRITE','PAYMENT_READ','PAYMENT_WRITE','RETURN_READ','RETURN_WRITE','REPORT_READ');

-- CUSTOMER: own data only (object-level checks are enforced in services).
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000003', id FROM permissions WHERE code IN ('CATALOG_BROWSE','CUSTOMER_SELF');
