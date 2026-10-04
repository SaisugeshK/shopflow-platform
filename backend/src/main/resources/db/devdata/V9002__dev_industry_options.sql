-- DEVELOPMENT ONLY: industry options (§0B.7) switched on for the demo tenants, with a few sample products.
SELECT set_config('app.platform_access', 'on', false);

-- Demo Wholesale Traders ("main", grocery): units, batches, serials, schemes, charges, labels.
INSERT INTO tenant_modules (business_id, module_code, enabled, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000001', 'UOM_CONVERSIONS', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'BATCH_EXPIRY', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'SERIAL_NUMBERS', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'SCHEMES', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'CHARGES', TRUE, now()),
 ('00000000-0000-0000-0000-000000000001', 'BARCODE_LABELS', TRUE, now())
ON CONFLICT (business_id, module_code) DO UPDATE SET enabled = TRUE;

-- Assam Tea is also sold by the case of 12 packs.
INSERT INTO product_units (id, business_id, product_id, unit, factor, created_at) VALUES
 ('00000000-0000-0000-0009-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0007-000000000003', 'CASE', 12, now());

-- Kaveri Building Materials (construction): cement by the bag (also by the tonne = 20 bags), TMT steel by kg.
INSERT INTO products (id, business_id, sku, name, category_id, description, hsn_code, unit, purchase_price, selling_price,
                      gst_rate, minimum_stock, pricing_mode, decimal_quantity, created_at, updated_at) VALUES
 ('00000000-0000-0000-0007-000000000301', '00000000-0000-0000-0000-000000000003', 'CEM-OPC53', 'OPC 53 Grade Cement 50kg',
  '00000000-0000-0000-0004-000000000301', 'Ordinary Portland cement, 50 kg bag', '2523', 'BAG', 340.00, 385.00, 28.00, 50, 'DAILY_RATE', FALSE, now(), now()),
 ('00000000-0000-0000-0007-000000000302', '00000000-0000-0000-0000-000000000003', 'TMT-12MM', 'TMT Bar 12mm Fe550',
  '00000000-0000-0000-0004-000000000302', 'Thermo-mechanically treated steel bar', '7214', 'KG', 58.00, 66.00, 18.00, 500, 'DAILY_RATE', TRUE, now(), now());
INSERT INTO product_units (id, business_id, product_id, unit, factor, created_at) VALUES
 ('00000000-0000-0000-0009-000000000301', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0007-000000000301', 'TONNE', 20, now()),
 ('00000000-0000-0000-0009-000000000302', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0007-000000000302', 'TONNE', 1000, now());
INSERT INTO product_daily_rates (id, business_id, product_id, effective_date, rate, created_at) VALUES
 ('00000000-0000-0000-0010-000000000301', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0007-000000000301', current_date, 385.00, now()),
 ('00000000-0000-0000-0010-000000000302', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0007-000000000302', current_date, 66.00, now());
INSERT INTO stock_balances (product_id, on_hand, reserved, updated_at) VALUES
 ('00000000-0000-0000-0007-000000000301', 0, 0, now()),
 ('00000000-0000-0000-0007-000000000302', 0, 0, now());

-- Sri Lakshmi Textiles: a shirt sold in sizes (variant group with three variants).
INSERT INTO products (id, business_id, sku, name, category_id, hsn_code, unit, purchase_price, selling_price, gst_rate,
                      variant_group, created_at, updated_at) VALUES
 ('00000000-0000-0000-0007-000000000201', '00000000-0000-0000-0000-000000000002', 'SHIRT-OXF', 'Oxford Cotton Shirt',
  '00000000-0000-0000-0004-000000000201', '6205', 'PCS', 420.00, 599.00, 5.00, TRUE, now(), now());
INSERT INTO products (id, business_id, sku, name, category_id, hsn_code, unit, purchase_price, selling_price, gst_rate,
                      parent_id, variant_attributes, created_at, updated_at) VALUES
 ('00000000-0000-0000-0007-000000000202', '00000000-0000-0000-0000-000000000002', 'SHIRT-OXF-M', 'Oxford Cotton Shirt - M',
  '00000000-0000-0000-0004-000000000201', '6205', 'PCS', 420.00, 599.00, 5.00, '00000000-0000-0000-0007-000000000201', 'Size: M', now(), now()),
 ('00000000-0000-0000-0007-000000000203', '00000000-0000-0000-0000-000000000002', 'SHIRT-OXF-L', 'Oxford Cotton Shirt - L',
  '00000000-0000-0000-0004-000000000201', '6205', 'PCS', 420.00, 599.00, 5.00, '00000000-0000-0000-0007-000000000201', 'Size: L', now(), now()),
 ('00000000-0000-0000-0007-000000000204', '00000000-0000-0000-0000-000000000002', 'SHIRT-OXF-XL', 'Oxford Cotton Shirt - XL',
  '00000000-0000-0000-0004-000000000201', '6205', 'PCS', 420.00, 649.00, 5.00, '00000000-0000-0000-0007-000000000201', 'Size: XL', now(), now());
INSERT INTO stock_balances (product_id, on_hand, reserved, updated_at) VALUES
 ('00000000-0000-0000-0007-000000000201', 0, 0, now()),
 ('00000000-0000-0000-0007-000000000202', 25, 0, now()),
 ('00000000-0000-0000-0007-000000000203', 30, 0, now()),
 ('00000000-0000-0000-0007-000000000204', 15, 0, now());
INSERT INTO stock_movements (id, product_id, movement_type, direction, quantity, unit_cost, balance_after, reference_type, reference_id, reference_number, created_at) VALUES
 ('00000000-0000-0000-0011-000000000202', '00000000-0000-0000-0007-000000000202', 'OPENING', 'IN', 25, 420.00, 25, 'OPENING_STOCK', '00000000-0000-0000-0007-000000000202', 'OPENING', now()),
 ('00000000-0000-0000-0011-000000000203', '00000000-0000-0000-0007-000000000203', 'OPENING', 'IN', 30, 420.00, 30, 'OPENING_STOCK', '00000000-0000-0000-0007-000000000203', 'OPENING', now()),
 ('00000000-0000-0000-0011-000000000204', '00000000-0000-0000-0007-000000000204', 'OPENING', 'IN', 15, 420.00, 15, 'OPENING_STOCK', '00000000-0000-0000-0007-000000000204', 'OPENING', now());
