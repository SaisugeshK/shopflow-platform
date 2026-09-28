package com.shopflow.orders;

import org.junit.jupiter.api.Test;

import java.util.EnumSet;

import static org.assertj.core.api.Assertions.assertThat;

class OrderStatusTest {

    @Test
    void happyPathTransitions() {
        assertThat(OrderStatus.PLACED.canTransitionTo(OrderStatus.ACCEPTED)).isTrue();
        assertThat(OrderStatus.ACCEPTED.canTransitionTo(OrderStatus.PACKING)).isTrue();
        assertThat(OrderStatus.PACKING.canTransitionTo(OrderStatus.READY_FOR_DELIVERY)).isTrue();
        assertThat(OrderStatus.READY_FOR_DELIVERY.canTransitionTo(OrderStatus.OUT_FOR_DELIVERY)).isTrue();
        assertThat(OrderStatus.OUT_FOR_DELIVERY.canTransitionTo(OrderStatus.DELIVERED)).isTrue();
        assertThat(OrderStatus.DELIVERED.canTransitionTo(OrderStatus.COMPLETED)).isTrue();
    }

    @Test
    void cannotSkipOrGoBackwards() {
        assertThat(OrderStatus.PLACED.canTransitionTo(OrderStatus.PACKING)).isFalse();
        assertThat(OrderStatus.PACKING.canTransitionTo(OrderStatus.ACCEPTED)).isFalse();
        assertThat(OrderStatus.DELIVERED.canTransitionTo(OrderStatus.CANCELLED)).isFalse();
        assertThat(OrderStatus.PLACED.canTransitionTo(OrderStatus.DELIVERY_FAILED)).isFalse();
    }

    @Test
    void terminalStatesHaveNoTransitions() {
        for (OrderStatus s : EnumSet.of(OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.DELIVERY_FAILED)) {
            assertThat(s.isTerminal()).isTrue();
            for (OrderStatus next : OrderStatus.values()) {
                assertThat(s.canTransitionTo(next)).isFalse();
            }
        }
    }

    @Test
    void onlyPlacedCanBeRejected() {
        for (OrderStatus s : OrderStatus.values()) {
            assertThat(s.canTransitionTo(OrderStatus.REJECTED)).isEqualTo(s == OrderStatus.PLACED);
        }
    }
}
