-- WhatsApp delivery history, in-app notifications, e-invoice log and audit trail.

CREATE TABLE whatsapp_messages (
    id                  UUID PRIMARY KEY,
    business_id         UUID          NOT NULL REFERENCES businesses (id),
    invoice_id          UUID REFERENCES invoices (id),
    customer_id         UUID REFERENCES customers (id),
    message_type        VARCHAR(40)   NOT NULL,
    recipient_number    VARCHAR(16)   NOT NULL,
    provider            VARCHAR(30)   NOT NULL,
    template_id         VARCHAR(100),
    media_id            VARCHAR(200),
    provider_message_id VARCHAR(200),
    status              VARCHAR(20)   NOT NULL,
    failure_reason      VARCHAR(500),
    retry_count         INT           NOT NULL DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,
    last_webhook_event_id VARCHAR(200),
    queued_at           TIMESTAMPTZ   NOT NULL,
    sent_at             TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    read_at             TIMESTAMPTZ,
    failed_at           TIMESTAMPTZ,
    requested_by        UUID,
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    version             BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_whatsapp_status CHECK (status IN ('QUEUED','SENDING','SENT','DELIVERED','READ','FAILED'))
);
CREATE INDEX ix_whatsapp_messages_invoice ON whatsapp_messages (invoice_id);
CREATE INDEX ix_whatsapp_messages_retry ON whatsapp_messages (status, next_retry_at);
CREATE UNIQUE INDEX ux_whatsapp_provider_message ON whatsapp_messages (provider, provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE whatsapp_webhook_events (
    id              UUID PRIMARY KEY,
    provider        VARCHAR(30)  NOT NULL,
    event_id        VARCHAR(200) NOT NULL,
    signature_valid BOOLEAN      NOT NULL,
    payload         TEXT         NOT NULL,
    received_at     TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ux_whatsapp_webhook_events UNIQUE (provider, event_id)
);

CREATE TABLE notification_events (
    id                  UUID PRIMARY KEY,
    recipient_user_id   UUID         NOT NULL REFERENCES users (id),
    channel             VARCHAR(20)  NOT NULL DEFAULT 'IN_APP',
    event_type          VARCHAR(60)  NOT NULL,
    title               VARCHAR(200) NOT NULL,
    body                VARCHAR(1000),
    entity_type         VARCHAR(40),
    entity_id           UUID,
    read_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ck_notification_channel CHECK (channel IN ('IN_APP','PUSH','WHATSAPP','SMS','EMAIL'))
);
CREATE INDEX ix_notification_events_recipient ON notification_events (recipient_user_id, created_at DESC);

CREATE TABLE einvoice_requests (
    id              UUID PRIMARY KEY,
    invoice_id      UUID         NOT NULL REFERENCES invoices (id),
    provider        VARCHAR(30)  NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    irn             VARCHAR(100),
    ack_number      VARCHAR(40),
    error_message   VARCHAR(500),
    test_only       BOOLEAN      NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL
);

-- Append-only audit trail. Sensitive values are redacted before insert.
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY,
    actor_user_id   UUID,
    actor_role      VARCHAR(30),
    action          VARCHAR(50)  NOT NULL,
    entity_type     VARCHAR(50)  NOT NULL,
    entity_id       UUID,
    old_value       TEXT,
    new_value       TEXT,
    ip_address      VARCHAR(64),
    user_agent      VARCHAR(300),
    request_id      VARCHAR(64),
    created_at      TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX ix_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX ix_audit_logs_actor ON audit_logs (actor_user_id);

-- Financial and audit history must never be deleted (DB-level guard in addition to application rules).
CREATE FUNCTION prevent_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Deleting rows from % is not allowed', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_delete_audit_logs BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER no_delete_stock_movements BEFORE DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER no_delete_customer_ledger BEFORE DELETE ON customer_ledger_entries FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER no_delete_supplier_ledger BEFORE DELETE ON supplier_ledger_entries FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER no_delete_invoices BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER no_delete_payments BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER no_delete_order_status_history BEFORE DELETE ON order_status_history FOR EACH ROW EXECUTE FUNCTION prevent_delete();
