-- Cart, orders, order status history and deliveries.

CREATE TABLE carts (
    id              UUID PRIMARY KEY,
    customer_id     UUID        NOT NULL UNIQUE REFERENCES customers (id),
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    version         BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE cart_items (
    id          UUID PRIMARY KEY,
    cart_id     UUID          NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
    product_id  UUID          NOT NULL REFERENCES products (id),
    quantity    NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    created_at  TIMESTAMPTZ   NOT NULL,
    updated_at  TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ux_cart_items_product UNIQUE (cart_id, product_id)
);

CREATE TABLE orders (
    id                      UUID PRIMARY KEY,
    business_id             UUID          NOT NULL REFERENCES businesses (id),
    order_number            VARCHAR(40)   NOT NULL,
    customer_id             UUID          NOT NULL REFERENCES customers (id),
    status                  VARCHAR(30)   NOT NULL,
    payment_status          VARCHAR(20)   NOT NULL,
    payment_method          VARCHAR(20)   NOT NULL,
    credit_approval_status  VARCHAR(20)   NOT NULL DEFAULT 'NOT_REQUIRED',
    source                  VARCHAR(20)   NOT NULL DEFAULT 'CUSTOMER',
    -- Delivery address snapshot
    delivery_name           VARCHAR(200)  NOT NULL,
    delivery_line1          VARCHAR(200)  NOT NULL,
    delivery_line2          VARCHAR(200),
    delivery_city           VARCHAR(100)  NOT NULL,
    delivery_state          VARCHAR(100)  NOT NULL,
    delivery_state_code     VARCHAR(2)    NOT NULL,
    delivery_pincode        VARCHAR(10)   NOT NULL,
    contact_mobile          VARCHAR(16)   NOT NULL,
    order_note              VARCHAR(1000),
    inter_state             BOOLEAN       NOT NULL DEFAULT FALSE,
    subtotal                NUMERIC(14,2) NOT NULL,
    discount_total          NUMERIC(14,2) NOT NULL,
    taxable_total           NUMERIC(14,2) NOT NULL,
    cgst_total              NUMERIC(14,2) NOT NULL,
    sgst_total              NUMERIC(14,2) NOT NULL,
    igst_total              NUMERIC(14,2) NOT NULL,
    round_off               NUMERIC(14,2) NOT NULL,
    grand_total             NUMERIC(14,2) NOT NULL,
    paid_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
    placed_at               TIMESTAMPTZ   NOT NULL,
    placed_by               UUID,
    cancel_reason           VARCHAR(500),
    reject_reason           VARCHAR(500),
    created_at              TIMESTAMPTZ   NOT NULL,
    updated_at              TIMESTAMPTZ   NOT NULL,
    version                 BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_orders_number UNIQUE (business_id, order_number),
    CONSTRAINT ck_orders_status CHECK (status IN ('PLACED','ACCEPTED','PACKING','READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERED','COMPLETED','CANCELLED','REJECTED','DELIVERY_FAILED')),
    CONSTRAINT ck_orders_payment_status CHECK (payment_status IN ('PENDING','PAID','PARTIALLY_PAID','CREDIT','FAILED','REFUNDED','CANCELLED')),
    CONSTRAINT ck_orders_payment_method CHECK (payment_method IN ('CASH','ONLINE','UPI','BANK_TRANSFER','CREDIT','OTHER')),
    CONSTRAINT ck_orders_credit_approval CHECK (credit_approval_status IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED'))
);
CREATE INDEX ix_orders_customer ON orders (customer_id, placed_at DESC);
CREATE INDEX ix_orders_status ON orders (status);
CREATE INDEX ix_orders_placed_at ON orders (placed_at);

CREATE TABLE order_items (
    id                  UUID PRIMARY KEY,
    order_id            UUID          NOT NULL REFERENCES orders (id),
    line_number         INT           NOT NULL,
    product_id          UUID          NOT NULL REFERENCES products (id),
    product_name        VARCHAR(200)  NOT NULL,
    sku                 VARCHAR(60)   NOT NULL,
    hsn_code            VARCHAR(8),
    unit                VARCHAR(20)   NOT NULL,
    ordered_quantity    NUMERIC(14,3) NOT NULL CHECK (ordered_quantity > 0),
    accepted_quantity   NUMERIC(14,3) NOT NULL DEFAULT 0,
    packed_quantity     NUMERIC(14,3) NOT NULL DEFAULT 0,
    delivered_quantity  NUMERIC(14,3) NOT NULL DEFAULT 0,
    cancelled_quantity  NUMERIC(14,3) NOT NULL DEFAULT 0,
    returned_quantity   NUMERIC(14,3) NOT NULL DEFAULT 0,
    invoiced_quantity   NUMERIC(14,3) NOT NULL DEFAULT 0,
    reserved_quantity   NUMERIC(14,3) NOT NULL DEFAULT 0,
    rate                NUMERIC(14,2) NOT NULL,
    discount_percent    NUMERIC(5,2)  NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_rate            NUMERIC(5,2)  NOT NULL,
    gross_amount        NUMERIC(14,2) NOT NULL,
    taxable_amount      NUMERIC(14,2) NOT NULL,
    cgst_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total          NUMERIC(14,2) NOT NULL,
    CONSTRAINT ux_order_items_line UNIQUE (order_id, line_number)
);
CREATE INDEX ix_order_items_order ON order_items (order_id);

-- Immutable: rows are only ever inserted.
CREATE TABLE order_status_history (
    id              UUID PRIMARY KEY,
    order_id        UUID         NOT NULL REFERENCES orders (id),
    previous_status VARCHAR(30),
    new_status      VARCHAR(30)  NOT NULL,
    changed_by      UUID,
    changed_at      TIMESTAMPTZ  NOT NULL,
    note            VARCHAR(500)
);
CREATE INDEX ix_order_status_history_order ON order_status_history (order_id, changed_at);

CREATE TABLE deliveries (
    id                  UUID PRIMARY KEY,
    order_id            UUID         NOT NULL REFERENCES orders (id),
    attempt_number      INT          NOT NULL DEFAULT 1,
    delivery_person     VARCHAR(200),
    delivery_person_mobile VARCHAR(16),
    vehicle_number      VARCHAR(20),
    notes               VARCHAR(1000),
    dispatched_at       TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    failed_at           TIMESTAMPTZ,
    failure_reason      VARCHAR(500),
    proof_of_delivery   VARCHAR(500),
    received_by         VARCHAR(200),
    customer_confirmed  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL,
    updated_at          TIMESTAMPTZ  NOT NULL,
    version             BIGINT       NOT NULL DEFAULT 0
);
CREATE INDEX ix_deliveries_order ON deliveries (order_id);
