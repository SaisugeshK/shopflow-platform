-- Industry words and units (architecture §0B.15). NULL = use the business's industry defaults; otherwise the owner's
-- own words ({"product": "Article", ...}) and the product unit codes offered in the screens ("PCS,BOX,M,KG").
SELECT set_config('app.platform_access', 'on', false);

ALTER TABLE business_settings
    ADD COLUMN custom_terms JSONB,
    ADD COLUMN units        VARCHAR(400);
