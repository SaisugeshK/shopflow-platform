-- Plans and usage limits are not used (product owner decision 2026-10-04, D-040 revised): every business works
-- without limits. Sign-up requests no longer carry a plan.
SELECT set_config('app.platform_access', 'on', false);

ALTER TABLE tenant_signups DROP COLUMN plan_code;
ALTER TABLE businesses DROP COLUMN plan_code, DROP COLUMN plan_changed_at;
DROP TABLE plans;
