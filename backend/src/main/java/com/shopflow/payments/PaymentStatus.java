package com.shopflow.payments;

import java.util.EnumSet;
import java.util.Set;

/**
 * Payment transaction status (§110). UNPAID = intent created and awaiting the customer. CANCELLED marks a manually
 * recorded payment voided by staff. Transitions only move forward, so an out-of-order webhook (e.g. AUTHORIZED
 * arriving after CAPTURED) is ignored.
 */
public enum PaymentStatus {
    UNPAID, PENDING, AUTHORIZED, CAPTURED, PARTIALLY_PAID, FAILED, REFUNDED, CANCELLED;

    private static final Set<PaymentStatus> FINAL = EnumSet.of(FAILED, REFUNDED, CANCELLED);

    public boolean isFinal() {
        return FINAL.contains(this);
    }

    public int rank() {
        return switch (this) {
            case UNPAID -> 0;
            case PENDING -> 1;
            case AUTHORIZED -> 2;
            case CAPTURED, PARTIALLY_PAID -> 3;
            case FAILED, CANCELLED -> 4;
            case REFUNDED -> 5;
        };
    }
}
