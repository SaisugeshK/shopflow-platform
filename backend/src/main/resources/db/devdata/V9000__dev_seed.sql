-- DEVELOPMENT ONLY seed data (loaded only by the "dev" profile). All people, numbers and GSTINs are fictitious.
-- Sign in with the mock OTP provider; the OTP is shown in backend logs and via GET /api/v1/dev/otp/latest.
--   Owner    +919000000001
--   Admin    +919000000002
--   Customer +919000000003 (approved, credit enabled)
--   Customer +919000000004 (pending approval)

UPDATE businesses SET
    name = 'Demo Wholesale Traders', legal_name = 'Demo Wholesale Traders',
    address_line1 = '12 Market Street', address_line2 = 'Near Bus Stand', city = 'Chennai', state = 'Tamil Nadu',
    state_code = '33', pincode = '600001', phone = '044-00000000', mobile = '+919000000001',
    email = 'accounts@example.com', gstin = '33ABCDE1234F1Z5', pan = 'ABCDE1234F',
    terms_and_conditions = 'Goods once sold will not be taken back without approval. Subject to Chennai jurisdiction.',
    authorized_signatory = 'For Demo Wholesale Traders', updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO business_bank_accounts (id, business_id, bank_name, account_name, account_number, ifsc, branch, is_default, created_at, updated_at)
VALUES ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 'Example Bank', 'Demo Wholesale Traders',
        '000000000000', 'EXMP0000001', 'Chennai Main', TRUE, now(), now());

INSERT INTO users (id, business_id, mobile_number, full_name, email, status, created_at, updated_at) VALUES
 ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', '+919000000001', 'Demo Owner', 'owner@example.com', 'ACTIVE', now(), now()),
 ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000001', '+919000000002', 'Demo Admin', 'admin@example.com', 'ACTIVE', now(), now()),
 ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000001', '+919000000003', 'Ravi Kumar', NULL, 'ACTIVE', now(), now()),
 ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', '+919000000004', 'Priya S', NULL, 'ACTIVE', now(), now());

INSERT INTO user_roles (user_id, role_id) VALUES
 ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0001-000000000001'),
 ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0001-000000000002'),
 ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0001-000000000003'),
 ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0001-000000000003');

INSERT INTO customers (id, business_id, user_id, customer_code, shop_name, contact_name, mobile_number, gstin, status, status_changed_at, created_at, updated_at) VALUES
 ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000003',
  'CUST-000001', 'Ravi General Stores', 'Ravi Kumar', '+919000000003', '33AAAAA0000A1Z5', 'APPROVED', now(), now(), now()),
 ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000004',
  'CUST-000002', 'Priya Mini Mart', 'Priya S', '+919000000004', NULL, 'PENDING_APPROVAL', now(), now(), now());

INSERT INTO customer_addresses (id, customer_id, label, address_line1, city, state, state_code, pincode, is_default, created_at, updated_at) VALUES
 (gen_random_uuid(), '00000000-0000-0000-0004-000000000001', 'Shop', '45 Gandhi Road', 'Chennai', 'Tamil Nadu', '33', '600017', TRUE, now(), now()),
 (gen_random_uuid(), '00000000-0000-0000-0004-000000000002', 'Shop', '8 Lake View', 'Bengaluru', 'Karnataka', '29', '560001', TRUE, now(), now());

INSERT INTO customer_credit_profiles (customer_id, credit_enabled, credit_limit, credit_days, updated_at) VALUES
 ('00000000-0000-0000-0004-000000000001', TRUE, 50000.00, 30, now()),
 ('00000000-0000-0000-0004-000000000002', FALSE, 0, 0, now());

INSERT INTO suppliers (id, business_id, supplier_code, name, contact_person, mobile_number, gstin, payment_terms, credit_days, created_at, updated_at) VALUES
 ('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0000-000000000001', 'SUP-000001', 'Sample Distributors Pvt Ltd', 'Arun', '+919000000010', '33BBBBB1111B1Z5', 'Net 30', 30, now(), now());
INSERT INTO supplier_addresses (id, supplier_id, address_line1, city, state, state_code, pincode, created_at, updated_at) VALUES
 (gen_random_uuid(), '00000000-0000-0000-0005-000000000001', '3 Industrial Estate', 'Chennai', 'Tamil Nadu', '33', '600032', now(), now());

INSERT INTO categories (id, business_id, name, description, sort_order, created_at, updated_at) VALUES
 ('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000001', 'Groceries', 'Staples and packaged food', 1, now(), now()),
 ('00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000001', 'Beverages', 'Tea, coffee and soft drinks', 2, now(), now()),
 ('00000000-0000-0000-0006-000000000003', '00000000-0000-0000-0000-000000000001', 'Personal Care', 'Soaps, shampoo and toiletries', 3, now(), now());

INSERT INTO products (id, business_id, sku, name, category_id, description, hsn_code, unit, purchase_price, selling_price, mrp, gst_rate, minimum_stock, featured, created_at, updated_at) VALUES
 ('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0000-000000000001', 'GRC-RICE-25', 'Premium Basmati Rice 25kg', '00000000-0000-0000-0006-000000000001', 'Long grain basmati rice, 25kg bag', '1006', 'BAG', 1800.00, 2150.00, 2400.00, 5.00, 10, TRUE, now(), now()),
 ('00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0000-000000000001', 'GRC-OIL-15', 'Sunflower Oil 15L Tin', '00000000-0000-0000-0006-000000000001', 'Refined sunflower oil', '1512', 'PCS', 1900.00, 2250.00, 2500.00, 5.00, 5, TRUE, now(), now()),
 ('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0000-000000000001', 'BEV-TEA-1K', 'Assam Tea 1kg', '00000000-0000-0000-0006-000000000002', 'Strong CTC tea', '0902', 'PACK', 320.00, 395.00, 450.00, 5.00, 20, FALSE, now(), now()),
 ('00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0000-000000000001', 'BEV-COF-500', 'Filter Coffee 500g', '00000000-0000-0000-0006-000000000002', 'Chicory blend filter coffee', '0901', 'PACK', 210.00, 265.00, 300.00, 5.00, 20, FALSE, now(), now()),
 ('00000000-0000-0000-0007-000000000005', '00000000-0000-0000-0000-000000000001', 'PC-SOAP-12', 'Herbal Soap (Box of 12)', '00000000-0000-0000-0006-000000000003', 'Herbal bathing soap, 12 x 100g', '3401', 'BOX', 360.00, 450.00, 540.00, 18.00, 15, TRUE, now(), now()),
 ('00000000-0000-0000-0007-000000000006', '00000000-0000-0000-0000-000000000001', 'PC-SHMP-1L', 'Shampoo 1L', '00000000-0000-0000-0006-000000000003', 'Everyday care shampoo', '3305', 'PCS', 240.00, 310.00, 375.00, 18.00, 10, FALSE, now(), now());

-- Opening stock is posted as OPENING stock movements so the balance is derived from the journal.
INSERT INTO stock_movements (id, product_id, movement_type, direction, quantity, unit_cost, balance_after, reference_type, reference_id, reference_number, reason, created_at)
SELECT gen_random_uuid(), p.id, 'OPENING', 'IN', s.qty, p.purchase_price, s.qty, 'OPENING_STOCK', p.id, 'OPENING', 'Development seed opening stock', now()
FROM products p JOIN (VALUES
  ('00000000-0000-0000-0007-000000000001'::uuid, 60), ('00000000-0000-0000-0007-000000000002'::uuid, 40),
  ('00000000-0000-0000-0007-000000000003'::uuid, 150), ('00000000-0000-0000-0007-000000000004'::uuid, 120),
  ('00000000-0000-0000-0007-000000000005'::uuid, 80), ('00000000-0000-0000-0007-000000000006'::uuid, 8)) AS s(pid, qty) ON s.pid = p.id;

INSERT INTO stock_balances (product_id, on_hand, reserved, updated_at)
SELECT product_id, SUM(quantity), 0, now() FROM stock_movements GROUP BY product_id;

-- Keep code sequences ahead of the seeded master data.
INSERT INTO document_sequences (id, business_id, document_type, financial_year, prefix, next_number, padding, updated_at) VALUES
 (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'CUSTOMER', 'ALL', 'CUST', 3, 6, now()),
 (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'SUPPLIER', 'ALL', 'SUP', 2, 6, now());
