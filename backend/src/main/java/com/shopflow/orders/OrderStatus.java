package com.shopflow.orders;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Canonical order state machine (§7.2, confirmed as the build choice over §110 — see DECISIONS.md).
 *
 * <pre>
 * PLACED → ACCEPTED → PACKING → READY_FOR_DELIVERY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
 * Terminal alternatives: CANCELLED, REJECTED, DELIVERY_FAILED
 * </pre>
 */
public enum OrderStatus {
    PLACED, ACCEPTED, PACKING, READY_FOR_DELIVERY, OUT_FOR_DELIVERY, DELIVERED, COMPLETED, CANCELLED, REJECTED, DELIVERY_FAILED;

    private static final Map<OrderStatus, Set<OrderStatus>> TRANSITIONS = Map.of(
            PLACED, EnumSet.of(ACCEPTED, REJECTED, CANCELLED),
            ACCEPTED, EnumSet.of(PACKING, CANCELLED),
            PACKING, EnumSet.of(READY_FOR_DELIVERY, CANCELLED),
            READY_FOR_DELIVERY, EnumSet.of(OUT_FOR_DELIVERY, CANCELLED),
            OUT_FOR_DELIVERY, EnumSet.of(DELIVERED, DELIVERY_FAILED, CANCELLED),
            DELIVERED, EnumSet.of(COMPLETED),
            COMPLETED, EnumSet.noneOf(OrderStatus.class),
            CANCELLED, EnumSet.noneOf(OrderStatus.class),
            REJECTED, EnumSet.noneOf(OrderStatus.class),
            DELIVERY_FAILED, EnumSet.noneOf(OrderStatus.class));

    public boolean canTransitionTo(OrderStatus next) {
        return TRANSITIONS.get(this).contains(next);
    }

    public boolean isTerminal() {
        return TRANSITIONS.get(this).isEmpty();
    }

    /** Open orders still hold stock reservations. */
    public boolean holdsReservation() {
        return this == PLACED || this == ACCEPTED || this == PACKING || this == READY_FOR_DELIVERY || this == OUT_FOR_DELIVERY;
    }

    /** Statuses from which an invoice may be generated for the order. */
    public boolean invoiceable() {
        return this == ACCEPTED || this == PACKING || this == READY_FOR_DELIVERY || this == OUT_FOR_DELIVERY
                || this == DELIVERED || this == COMPLETED;
    }
}
