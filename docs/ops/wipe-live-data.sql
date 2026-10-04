-- ShopFlow: delete ALL data from the live database and start from scratch.
--
-- What it does: empties every table in the "shopflow" database except the built-in reference data
-- (roles, permissions, role_permissions) and Flyway's migration history. Businesses, users, customers, products,
-- orders, invoices, payments, stock, files (rows), sessions, OTPs and audit logs are all removed.
-- The tables themselves stay, so the deployed app keeps working; the Super Admin login comes back automatically on
-- the next start from PLATFORM_SUPER_ADMIN_MOBILES.
--
-- THIS CANNOT BE UNDONE. Take a backup first.
--
-- How to run (Google Cloud Shell, project carservicev2 — touches only the "shopflow" database, never cab_db/sms_db):
--   gcloud sql connect cab-db-instance --user=shopflow_app --database=shopflow --project=carservicev2
--   \i wipe-live-data.sql          (or paste the statements below)
-- Then restart the Cloud Run service so cached data is dropped:
--   gcloud run services update shopflow --region asia-south1 --project erp-supermarket-2026 --update-labels wiped=yes

\set ON_ERROR_STOP on
SELECT current_database() AS database_being_wiped;   -- must say: shopflow

BEGIN;
DO $$
DECLARE
    list text;
BEGIN
    IF current_database() <> 'shopflow' THEN
        RAISE EXCEPTION 'Refusing to run: connected to %, not shopflow', current_database();
    END IF;
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO list
      FROM pg_tables
     WHERE schemaname = current_schema()
       AND tablename NOT IN ('flyway_schema_history', 'roles', 'permissions', 'role_permissions');
    EXECUTE 'TRUNCATE ' || list || ' RESTART IDENTITY CASCADE';
END $$;
COMMIT;

-- Check: every count below should be 0.
SELECT (SELECT count(*) FROM businesses) AS businesses, (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM products) AS products,
       (SELECT count(*) FROM invoices) AS invoices, (SELECT count(*) FROM platform_admins) AS platform_admins;
