package com.shopflow.billing;

/** Invoice status (§30). Generated invoices are never deleted; they can only be cancelled. */
public enum InvoiceStatus {
    DRAFT, GENERATED, SENT, PARTIALLY_PAID, PAID, CREDIT, CANCELLED;

    public boolean isPosted() {
        return this != DRAFT && this != CANCELLED;
    }
}
