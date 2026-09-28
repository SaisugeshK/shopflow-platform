-- Purchases, purchase payments and purchase returns.

CREATE TABLE purchases (
    id                      UUID PRIMARY KEY,
    business_id             UUID          NOT NULL REFERENCES businesses (id),
    purchase_number         VARCHAR(40)   NOT NULL,
    purchase_date           DATE          NOT NULL,
    supplier_id             UUID          NOT NULL REFERENCES suppliers (id),
    supplier_invoice_number VARCHAR(60),
    supplier_invoice_date   DATE,
    status                  VARCHAR(20)   NOT NULL,
    payment_status          VARCHAR(20)   NOT NULL DEFAULT 'UNPAID',
    inter_state             BOOLEAN       NOT NULL DEFAULT FALSE,
    subtotal                NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
    taxable_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    cgst_total              NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_total              NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_total              NUMERIC(14,2) NOT NULL DEFAULT 0,
    round_off               NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total             NUMERIC(14,2) NOT NULL DEFAULT 0,
    paid_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes                   TEXT,
    posted_at               TIMESTAMPTZ,
    posted_by               UUID,
    cancelled_at            TIMESTAMPTZ,
    cancelled_by            UUID,
    cancel_reason           VARCHAR(500),
    created_at              TIMESTAMPTZ   NOT NULL,
    updated_at              TIMESTAMPTZ   NOT NULL,
    created_by              UUID,
    updated_by              UUID,
    version                 BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_purchases_number UNIQUE (business_id, purchase_number),
    CONSTRAINT ck_purchases_status CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
    CONSTRAINT ck_purchases_payment_status CHECK (payment_status IN ('UNPAID','PARTIALLY_PAID','PAID'))
);
CREATE INDEX ix_purchases_supplier ON purchases (supplier_id);
CREATE INDEX ix_purchases_date ON purchases (purchase_date);

CREATE TABLE purchase_items (
    id              UUID PRIMARY KEY,
    purchase_id     UUID          NOT NULL REFERENCES purchases (id),
    line_number     INT           NOT NULL,
    product_id      UUID          NOT NULL REFERENCES products (id),
    product_name    VARCHAR(200)  NOT NULL,
    hsn_code        VARCHAR(8),
    unit            VARCHAR(20)   NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    rate            NUMERIC(14,2) NOT NULL CHECK (rate >= 0),
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_rate        NUMERIC(5,2)  NOT NULL,
    gross_amount    NUMERIC(14,2) NOT NULL,
    taxable_amount  NUMERIC(14,2) NOT NULL,
    cgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total      NUMERIC(14,2) NOT NULL,
    returned_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
    CONSTRAINT ux_purchase_items_line UNIQUE (purchase_id, line_number)
);

CREATE TABLE purchase_payments (
    id              UUID PRIMARY KEY,
    purchase_id     UUID          NOT NULL REFERENCES purchases (id),
    payment_number  VARCHAR(40)   NOT NULL UNIQUE,
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    method          VARCHAR(20)   NOT NULL,
    reference_number VARCHAR(100),
    paid_at         TIMESTAMPTZ   NOT NULL,
    notes           VARCHAR(500),
    created_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID
);

CREATE TABLE purchase_returns (
    id              UUID PRIMARY KEY,
    business_id     UUID          NOT NULL REFERENCES businesses (id),
    return_number   VARCHAR(40)   NOT NULL,
    purchase_id     UUID          NOT NULL REFERENCES purchases (id),
    supplier_id     UUID          NOT NULL REFERENCES suppliers (id),
    return_date     DATE          NOT NULL,
    status          VARCHAR(20)   NOT NULL,
    reason          VARCHAR(500)  NOT NULL,
    taxable_total   NUMERIC(14,2) NOT NULL DEFAULT 0,
    cgst_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
    round_off       NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
    posted_at       TIMESTAMPTZ,
    posted_by       UUID,
    created_at      TIMESTAMPTZ   NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID,
    version         BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_purchase_returns_number UNIQUE (business_id, return_number),
    CONSTRAINT ck_purchase_returns_status CHECK (status IN ('DRAFT','POSTED'))
);

CREATE TABLE purchase_return_items (
    id                  UUID PRIMARY KEY,
    purchase_return_id  UUID          NOT NULL REFERENCES purchase_returns (id),
    purchase_item_id    UUID          NOT NULL REFERENCES purchase_items (id),
    product_id          UUID          NOT NULL REFERENCES products (id),
    product_name        VARCHAR(200)  NOT NULL,
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    rate                NUMERIC(14,2) NOT NULL,
    tax_rate            NUMERIC(5,2)  NOT NULL,
    taxable_amount      NUMERIC(14,2) NOT NULL,
    cgst_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total          NUMERIC(14,2) NOT NULL
);
