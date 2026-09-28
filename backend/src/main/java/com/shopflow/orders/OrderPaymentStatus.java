package com.shopflow.orders;

/**
 * Order/invoice-level payment status (§8). Kept separate from order status and from the gateway transaction status
 * on individual payments (§110) — the two-level split recorded in DECISIONS.md.
 */
public enum OrderPaymentStatus {
    PENDING, PAID, PARTIALLY_PAID, CREDIT, FAILED, REFUNDED, CANCELLED
}
