-- Identity, business profile, settings and document sequences.
-- All timestamps are UTC (TIMESTAMPTZ). Money uses NUMERIC, never floating point.

CREATE TABLE businesses (
    id                      UUID PRIMARY KEY,
    name                    VARCHAR(200) NOT NULL,
    legal_name              VARCHAR(200),
    logo_file_id            UUID,
    address_line1           VARCHAR(200),
    address_line2           VARCHAR(200),
    city                    VARCHAR(100),
    state                   VARCHAR(100),
    state_code              VARCHAR(2),
    pincode                 VARCHAR(10),
    phone                   VARCHAR(20),
    mobile                  VARCHAR(20),
    email                   VARCHAR(200),
    gstin                   VARCHAR(15),
    pan                     VARCHAR(10),
    timezone                VARCHAR(64)  NOT NULL DEFAULT 'Asia/Kolkata',
    currency                VARCHAR(3)   NOT NULL DEFAULT 'INR',
    financial_year_start_month INT       NOT NULL DEFAULT 4 CHECK (financial_year_start_month BETWEEN 1 AND 12),
    terms_and_conditions    TEXT,
    authorized_signatory    VARCHAR(200),
    created_at              TIMESTAMPTZ  NOT NULL,
    updated_at              TIMESTAMPTZ  NOT NULL,
    version                 BIGINT       NOT NULL DEFAULT 0
);

CREATE TABLE business_bank_accounts (
    id              UUID PRIMARY KEY,
    business_id     UUID         NOT NULL REFERENCES businesses (id),
    bank_name       VARCHAR(200) NOT NULL,
    account_name    VARCHAR(200),
    account_number  VARCHAR(40)  NOT NULL,
    ifsc            VARCHAR(11)  NOT NULL,
    branch          VARCHAR(200),
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    version         BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_bank_accounts_default ON business_bank_accounts (business_id) WHERE is_default;

-- Operational business rules that must stay configurable (see DECISIONS.md).
CREATE TABLE business_settings (
    business_id                     UUID PRIMARY KEY REFERENCES businesses (id),
    credit_policy                   VARCHAR(30)  NOT NULL DEFAULT 'REQUIRE_ADMIN_APPROVAL',
    customer_cancel_allowed_until   VARCHAR(30)  NOT NULL DEFAULT 'ACCEPTED',
    show_stock_to_customers         BOOLEAN      NOT NULL DEFAULT TRUE,
    gstin_required_for_customers    BOOLEAN      NOT NULL DEFAULT FALSE,
    pan_required_for_customers      BOOLEAN      NOT NULL DEFAULT FALSE,
    partial_delivery_invoice_policy VARCHAR(30)  NOT NULL DEFAULT 'INVOICE_ACCEPTED_QUANTITY',
    default_credit_days             INT          NOT NULL DEFAULT 30,
    default_credit_limit            NUMERIC(14,2) NOT NULL DEFAULT 0,
    whatsapp_enabled                BOOLEAN      NOT NULL DEFAULT TRUE,
    whatsapp_sender                 VARCHAR(40),
    whatsapp_invoice_template       VARCHAR(100) NOT NULL DEFAULT 'invoice_created',
    notify_push                     BOOLEAN      NOT NULL DEFAULT FALSE,
    notify_sms                      BOOLEAN      NOT NULL DEFAULT FALSE,
    notify_email                    BOOLEAN      NOT NULL DEFAULT FALSE,
    notify_whatsapp                 BOOLEAN      NOT NULL DEFAULT TRUE,
    data_retention_years            INT          NOT NULL DEFAULT 8,
    updated_at                      TIMESTAMPTZ  NOT NULL,
    version                         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_settings_credit_policy CHECK (credit_policy IN ('BLOCK','REQUIRE_ADMIN_APPROVAL','ALLOW')),
    CONSTRAINT ck_settings_cancel_until CHECK (customer_cancel_allowed_until IN ('PLACED','ACCEPTED','NEVER')),
    CONSTRAINT ck_settings_partial_policy CHECK (partial_delivery_invoice_policy IN ('INVOICE_ACCEPTED_QUANTITY','INVOICE_DELIVERED_QUANTITY'))
);

CREATE TABLE invoice_settings (
    business_id         UUID PRIMARY KEY REFERENCES businesses (id),
    invoice_prefix      VARCHAR(20)  NOT NULL DEFAULT 'INV',
    number_padding      INT          NOT NULL DEFAULT 6 CHECK (number_padding BETWEEN 3 AND 10),
    starting_number     BIGINT       NOT NULL DEFAULT 1 CHECK (starting_number >= 1),
    default_payment_terms VARCHAR(200),
    default_terms       TEXT,
    default_footer      VARCHAR(500),
    declaration         TEXT,
    signature_file_id   UUID,
    template_code       VARCHAR(40)  NOT NULL DEFAULT 'STANDARD_A4',
    show_bank_details   BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at          TIMESTAMPTZ  NOT NULL,
    version             BIGINT       NOT NULL DEFAULT 0
);

CREATE TABLE tax_settings (
    business_id             UUID PRIMARY KEY REFERENCES businesses (id),
    calculation_mode        VARCHAR(20)  NOT NULL DEFAULT 'EXCLUSIVE',
    round_off_enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
    default_gst_rate        NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    allowed_gst_rates       VARCHAR(200) NOT NULL DEFAULT '0,5,12,18,28',
    inter_state_tax_type    VARCHAR(10)  NOT NULL DEFAULT 'IGST',
    intra_state_tax_type    VARCHAR(20)  NOT NULL DEFAULT 'CGST_SGST',
    updated_at              TIMESTAMPTZ  NOT NULL,
    version                 BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_tax_mode CHECK (calculation_mode IN ('EXCLUSIVE'))
);

-- Independent per-document-type, per-financial-year numbering. Rows are locked FOR UPDATE when a number is issued.
CREATE TABLE document_sequences (
    id              UUID PRIMARY KEY,
    business_id     UUID         NOT NULL REFERENCES businesses (id),
    document_type   VARCHAR(30)  NOT NULL,
    financial_year  VARCHAR(7)   NOT NULL,
    prefix          VARCHAR(20)  NOT NULL,
    next_number     BIGINT       NOT NULL,
    padding         INT          NOT NULL DEFAULT 6,
    updated_at      TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ux_document_sequences UNIQUE (business_id, document_type, financial_year)
);

CREATE TABLE users (
    id              UUID PRIMARY KEY,
    business_id     UUID         NOT NULL REFERENCES businesses (id),
    mobile_number   VARCHAR(16)  NOT NULL,
    full_name       VARCHAR(200) NOT NULL,
    email           VARCHAR(200),
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    created_by      UUID,
    updated_by      UUID,
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ux_users_mobile UNIQUE (mobile_number),
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE','INACTIVE','BLOCKED'))
);

CREATE TABLE roles (
    id          UUID PRIMARY KEY,
    code        VARCHAR(30)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(500)
);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY,
    code        VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(500)
);

CREATE TABLE role_permissions (
    role_id         UUID NOT NULL REFERENCES roles (id),
    permission_id   UUID NOT NULL REFERENCES permissions (id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id     UUID NOT NULL REFERENCES users (id),
    role_id     UUID NOT NULL REFERENCES roles (id),
    PRIMARY KEY (user_id, role_id)
);

-- Fine-grained grants on top of the role (e.g. give one ADMIN USER_MANAGE).
CREATE TABLE user_permissions (
    user_id         UUID NOT NULL REFERENCES users (id),
    permission_id   UUID NOT NULL REFERENCES permissions (id),
    granted_by      UUID REFERENCES users (id),
    granted_at      TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, permission_id)
);

-- OTPs are never stored in plaintext: otp_hash = HMAC-SHA256(secret, id || otp).
CREATE TABLE otp_requests (
    id              UUID PRIMARY KEY,
    mobile_number   VARCHAR(16)  NOT NULL,
    otp_hash        VARCHAR(128) NOT NULL,
    expires_at      TIMESTAMPTZ  NOT NULL,
    attempts        INT          NOT NULL DEFAULT 0,
    max_attempts    INT          NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    requested_ip    VARCHAR(64),
    provider        VARCHAR(40)  NOT NULL,
    provider_ref    VARCHAR(200),
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL,
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_otp_status CHECK (status IN ('ACTIVE','CONSUMED','INVALIDATED','LOCKED','EXPIRED','DELIVERY_FAILED'))
);
CREATE INDEX ix_otp_requests_mobile_created ON otp_requests (mobile_number, created_at DESC);

CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY,
    user_id         UUID         NOT NULL REFERENCES users (id),
    device_info     VARCHAR(300),
    ip_address      VARCHAR(64),
    created_at      TIMESTAMPTZ  NOT NULL,
    last_used_at    TIMESTAMPTZ  NOT NULL,
    revoked_at      TIMESTAMPTZ,
    revoke_reason   VARCHAR(100)
);
CREATE INDEX ix_user_sessions_user ON user_sessions (user_id);

CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY,
    session_id      UUID         NOT NULL REFERENCES user_sessions (id),
    token_hash      VARCHAR(128) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    revoked_at      TIMESTAMPTZ,
    replaced_by_id  UUID
);
CREATE INDEX ix_refresh_tokens_session ON refresh_tokens (session_id);

CREATE TABLE stored_files (
    id              UUID PRIMARY KEY,
    storage_key     VARCHAR(500) NOT NULL UNIQUE,
    original_name   VARCHAR(300),
    content_type    VARCHAR(100) NOT NULL,
    size_bytes      BIGINT       NOT NULL,
    checksum_sha256 VARCHAR(64)  NOT NULL,
    purpose         VARCHAR(40)  NOT NULL,
    created_by      UUID,
    created_at      TIMESTAMPTZ  NOT NULL
);

CREATE TABLE idempotency_keys (
    id              UUID PRIMARY KEY,
    scope           VARCHAR(60)  NOT NULL,
    idem_key        VARCHAR(200) NOT NULL,
    user_id         UUID,
    resource_id     UUID,
    created_at      TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ux_idempotency UNIQUE (scope, idem_key)
);
