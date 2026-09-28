package com.shopflow.orders;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/** Immutable status-change record (§7.2). */
@Entity
@Table(name = "order_status_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderStatusHistory {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID orderId;
    @Enumerated(EnumType.STRING)
    private OrderStatus previousStatus;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus newStatus;
    private UUID changedBy;
    @Column(nullable = false)
    private Instant changedAt;
    private String note;

    OrderStatusHistory(UUID orderId, OrderStatus previous, OrderStatus next, UUID changedBy, String note) {
        this.id = UUID.randomUUID();
        this.orderId = orderId;
        this.previousStatus = previous;
        this.newStatus = next;
        this.changedBy = changedBy;
        this.changedAt = Instant.now();
        this.note = note;
    }
}
