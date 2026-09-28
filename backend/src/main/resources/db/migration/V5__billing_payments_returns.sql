-- Invoices, credit/debit notes, payments and sales returns.

CREATE TABLE invoices (
    id                      UUID PRIMARY KEY,
    business_id             UUID          NOT NULL REFERENCES businesses (id),
    invoice_number          VARCHAR(40),
    invoice_type            VARCHAR(20)   NOT NULL DEFAULT 'TAX_INVOICE',
    copy_label              VARCHAR(20)   NOT NULL DEFAULT 'ORIGINAL',
    source                  VARCHAR(20)   NOT NULL,
    status                  VARCHAR(20)   NOT NULL,
    customer_id             UUID          NOT NULL REFERENCES customers (id),
    order_id                UUID REFERENCES orders (id),
    invoice_date            DATE          NOT NULL,
    due_date                DATE,
    payment_type            VARCHAR(20)   NOT NULL,
    payment_terms           VARCHAR(200),
    buyer_order_number      VARCHAR(60),
    delivery_note           VARCHAR(200),
    dispatch_document       VARCHAR(200),
    transport               VARCHAR(200),
    vehicle_number          VARCHAR(20),
    destination             VARCHAR(200),
    notes                   VARCHAR(1000),
    inter_state             BOOLEAN       NOT NULL DEFAULT FALSE,
    -- Seller snapshot
    seller_name             VARCHAR(200),
    seller_address          VARCHAR(600),
    seller_phone            VARCHAR(40),
    seller_email            VARCHAR(200),
    seller_gstin            VARCHAR(15),
    seller_pan              VARCHAR(10),
    seller_state            VARCHAR(100),
    seller_state_code       VARCHAR(2),
    seller_logo_file_id     UUID,
    bank_name               VARCHAR(200),
    bank_account_number     VARCHAR(40),
    bank_ifsc               VARCHAR(11),
    bank_branch             VARCHAR(200),
    terms_and_conditions    TEXT,
    declaration             TEXT,
    authorized_signatory    VARCHAR(200),
    -- Buyer snapshot
    buyer_name              VARCHAR(200),
    buyer_contact_name      VARCHAR(200),
    buyer_address           VARCHAR(600),
    buyer_city              VARCHAR(100),
    buyer_state             VARCHAR(100),
    buyer_state_code        VARCHAR(2),
    buyer_pincode           VARCHAR(10),
    buyer_mobile            VARCHAR(16),
    buyer_gstin             VARCHAR(15),
    buyer_pan               VARCHAR(10),
    buyer_email             VARCHAR(200),
    -- Totals
    subtotal                NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
    taxable_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    cgst_total              NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_total              NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_total              NUMERIC(14,2) NOT NULL DEFAULT 0,
    round_off               NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total             NUMERIC(14,2) NOT NULL DEFAULT 0,
    paid_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
    credited_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount_in_words         VARCHAR(500),
    tax_amount_in_words     VARCHAR(500),
    -- E-invoice
    einvoice_status         VARCHAR(20)   NOT NULL DEFAULT 'NOT_APPLICABLE',
    irn                     VARCHAR(100),
    ack_number              VARCHAR(40),
    ack_date                TIMESTAMPTZ,
    signed_qr_data          TEXT,
    pdf_file_id             UUID REFERENCES stored_files (id),
    sent_at                 TIMESTAMPTZ,
    generated_at            TIMESTAMPTZ,
    generated_by            UUID,
    cancelled_at            TIMESTAMPTZ,
    cancelled_by            UUID,
    cancel_reason           VARCHAR(500),
    created_at              TIMESTAMPTZ   NOT NULL,
    updated_at              TIMESTAMPTZ   NOT NULL,
    created_by              UUID,
    updated_by              UUID,
    version                 BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_invoices_number UNIQUE (business_id, invoice_number),
    CONSTRAINT ck_invoices_status CHECK (status IN ('DRAFT','GENERATED','SENT','PARTIALLY_PAID','PAID','CREDIT','CANCELLED')),
    CONSTRAINT ck_invoices_source CHECK (source IN ('ORDER','MANUAL')),
    CONSTRAINT ck_invoices_payment_type CHECK (payment_type IN ('CASH','ONLINE','UPI','BANK_TRANSFER','CREDIT','OTHER')),
    CONSTRAINT ck_invoices_einvoice CHECK (einvoice_status IN ('REAL_IRN','TEST_IRN','NOT_APPLICABLE','PENDING','FAILED')),
    CONSTRAINT ck_invoices_number_when_generated CHECK (status = 'DRAFT' OR invoice_number IS NOT NULL)
);
CREATE INDEX ix_invoices_customer ON invoices (customer_id, invoice_date DESC);
CREATE INDEX ix_invoices_order ON invoices (order_id);
CREATE INDEX ix_invoices_date ON invoices (invoice_date);
CREATE INDEX ix_invoices_status ON invoices (status);

CREATE TABLE invoice_items (
    id                  UUID PRIMARY KEY,
    invoice_id          UUID          NOT NULL REFERENCES invoices (id),
    line_number         INT           NOT NULL,
    product_id          UUID          NOT NULL REFERENCES products (id),
    order_item_id       UUID REFERENCES order_items (id),
    product_name        VARCHAR(200)  NOT NULL,
    description         VARCHAR(500),
    sku                 VARCHAR(60),
    hsn_code            VARCHAR(8),
    unit                VARCHAR(20)   NOT NULL,
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    rate                NUMERIC(14,2) NOT NULL CHECK (rate >= 0),
    discount_percent    NUMERIC(5,2)  NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_rate            NUMERIC(5,2)  NOT NULL,
    gross_amount        NUMERIC(14,2) NOT NULL,
    taxable_amount      NUMERIC(14,2) NOT NULL,
    cgst_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total          NUMERIC(14,2) NOT NULL,
    -- Internal cost snapshot for profit reporting. Never exposed to customers.
    unit_cost           NUMERIC(14,2) NOT NULL DEFAULT 0,
    returned_quantity   NUMERIC(14,3) NOT NULL DEFAULT 0,
    CONSTRAINT ux_invoice_items_line UNIQUE (invoice_id, line_number)
);
CREATE INDEX ix_invoice_items_invoice ON invoice_items (invoice_id);
CREATE INDEX ix_invoice_items_product ON invoice_items (product_id);

CREATE TABLE invoice_tax_summaries (
    id              UUID PRIMARY KEY,
    invoice_id      UUID          NOT NULL REFERENCES invoices (id),
    hsn_code        VARCHAR(8),
    tax_rate        NUMERIC(5,2)  NOT NULL,
    taxable_amount  NUMERIC(14,2) NOT NULL,
    cgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_tax       NUMERIC(14,2) NOT NULL
);
CREATE INDEX ix_invoice_tax_summaries_invoice ON invoice_tax_summaries (invoice_id);

CREATE TABLE credit_notes (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    credit_note_number  VARCHAR(40)   NOT NULL,
    invoice_id          UUID          NOT NULL REFERENCES invoices (id),
    customer_id         UUID          NOT NULL REFERENCES customers (id),
    reason_type         VARCHAR(30)   NOT NULL,
    reason              VARCHAR(500)  NOT NULL,
    reference_type      VARCHAR(30),
    reference_id        UUID,
    note_date           DATE          NOT NULL,
    taxable_total       NUMERIC(14,2) NOT NULL,
    cgst_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
    round_off           NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total         NUMERIC(14,2) NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL,
    created_by          UUID,
    CONSTRAINT ux_credit_notes_number UNIQUE (business_id, credit_note_number),
    CONSTRAINT ck_credit_notes_reason CHECK (reason_type IN ('SALES_RETURN','SHORT_DELIVERY','DELIVERY_FAILED','PRICE_ADJUSTMENT','OTHER'))
);
CREATE INDEX ix_credit_notes_invoice ON credit_notes (invoice_id);

CREATE TABLE credit_note_items (
    id              UUID PRIMARY KEY,
    credit_note_id  UUID          NOT NULL REFERENCES credit_notes (id),
    invoice_item_id UUID          NOT NULL REFERENCES invoice_items (id),
    product_id      UUID          NOT NULL REFERENCES products (id),
    product_name    VARCHAR(200)  NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    rate            NUMERIC(14,2) NOT NULL,
    tax_rate        NUMERIC(5,2)  NOT NULL,
    taxable_amount  NUMERIC(14,2) NOT NULL,
    cgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total      NUMERIC(14,2) NOT NULL
);

-- Foundation only: debit notes are recorded against an invoice and post to the ledger.
CREATE TABLE debit_notes (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    debit_note_number   VARCHAR(40)   NOT NULL,
    invoice_id          UUID          NOT NULL REFERENCES invoices (id),
    customer_id         UUID          NOT NULL REFERENCES customers (id),
    reason              VARCHAR(500)  NOT NULL,
    note_date           DATE          NOT NULL,
    taxable_total       NUMERIC(14,2) NOT NULL,
    tax_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total         NUMERIC(14,2) NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL,
    created_by          UUID,
    CONSTRAINT ux_debit_notes_number UNIQUE (business_id, debit_note_number)
);

-- A payment is money received from a customer. Only CAPTURED payments post to the ledger.
CREATE TABLE payments (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    payment_number      VARCHAR(40)   NOT NULL,
    customer_id         UUID          NOT NULL REFERENCES customers (id),
    invoice_id          UUID REFERENCES invoices (id),
    order_id            UUID REFERENCES orders (id),
    amount              NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    method              VARCHAR(20)   NOT NULL,
    status              VARCHAR(20)   NOT NULL,
    reference_number    VARCHAR(100),
    paid_at             TIMESTAMPTZ,
    collected_by        UUID REFERENCES users (id),
    notes               VARCHAR(500),
    provider            VARCHAR(30),
    provider_order_id   VARCHAR(100),
    provider_payment_id VARCHAR(100),
    failure_reason      VARCHAR(500),
    allocated_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    refunded_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    cancelled_at        TIMESTAMPTZ,
    cancelled_by        UUID,
    cancel_reason       VARCHAR(500),
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    created_by          UUID,
    version             BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_payments_number UNIQUE (business_id, payment_number),
    CONSTRAINT ux_payments_provider_order UNIQUE (provider, provider_order_id),
    CONSTRAINT ck_payments_method CHECK (method IN ('CASH','ONLINE','UPI','BANK_TRANSFER','CREDIT','OTHER')),
    CONSTRAINT ck_payments_status CHECK (status IN ('UNPAID','PENDING','AUTHORIZED','CAPTURED','PARTIALLY_PAID','FAILED','REFUNDED','CANCELLED'))
);
CREATE INDEX ix_payments_customer ON payments (customer_id, created_at DESC);
CREATE INDEX ix_payments_invoice ON payments (invoice_id);
CREATE INDEX ix_payments_order ON payments (order_id);

CREATE TABLE payment_allocations (
    id          UUID PRIMARY KEY,
    payment_id  UUID          NOT NULL REFERENCES payments (id),
    invoice_id  UUID          NOT NULL REFERENCES invoices (id),
    amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    reversed    BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ   NOT NULL,
    reversed_at TIMESTAMPTZ
);
CREATE INDEX ix_payment_allocations_payment ON payment_allocations (payment_id);
CREATE INDEX ix_payment_allocations_invoice ON payment_allocations (invoice_id);

CREATE TABLE payment_receipts (
    id              UUID PRIMARY KEY,
    payment_id      UUID        NOT NULL UNIQUE REFERENCES payments (id),
    receipt_number  VARCHAR(40) NOT NULL UNIQUE,
    file_id         UUID REFERENCES stored_files (id),
    issued_at       TIMESTAMPTZ NOT NULL
);

-- Raw provider webhook events, used for signature audit and idempotency.
CREATE TABLE payment_gateway_events (
    id              UUID PRIMARY KEY,
    provider        VARCHAR(30)  NOT NULL,
    event_id        VARCHAR(120) NOT NULL,
    event_type      VARCHAR(60)  NOT NULL,
    provider_order_id VARCHAR(100),
    provider_payment_id VARCHAR(100),
    signature_valid BOOLEAN      NOT NULL,
    payload         TEXT         NOT NULL,
    processing_status VARCHAR(20) NOT NULL,
    processing_note VARCHAR(500),
    received_at     TIMESTAMPTZ  NOT NULL,
    processed_at    TIMESTAMPTZ,
    CONSTRAINT ux_payment_gateway_events UNIQUE (provider, event_id)
);

CREATE TABLE sales_returns (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    return_number   VARCHAR(40)   NOT NULL,
    invoice_id      UUID          NOT NULL REFERENCES invoices (id),
    order_id        UUID REFERENCES orders (id),
    customer_id     UUID          NOT NULL REFERENCES customers (id),
    status          VARCHAR(20)   NOT NULL,
    reason          VARCHAR(500)  NOT NULL,
    review_note     VARCHAR(500),
    requested_at    TIMESTAMPTZ   NOT NULL,
    requested_by    UUID,
    reviewed_at     TIMESTAMPTZ,
    reviewed_by     UUID,
    credit_note_id  UUID REFERENCES credit_notes (id),
    created_at      TIMESTAMPTZ   NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL,
    version         BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_sales_returns_number UNIQUE (business_id, return_number),
    CONSTRAINT ck_sales_returns_status CHECK (status IN ('REQUESTED','APPROVED','REJECTED'))
);
CREATE INDEX ix_sales_returns_customer ON sales_returns (customer_id);

CREATE TABLE sales_return_items (
    id              UUID PRIMARY KEY,
    sales_return_id UUID          NOT NULL REFERENCES sales_returns (id),
    invoice_item_id UUID          NOT NULL REFERENCES invoice_items (id),
    product_id      UUID          NOT NULL REFERENCES products (id),
    product_name    VARCHAR(200)  NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    reason          VARCHAR(300)
);
