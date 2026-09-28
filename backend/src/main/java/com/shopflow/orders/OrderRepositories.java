package com.shopflow.orders;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepositories {

    interface OrderRepository extends JpaRepository<Order, UUID>, JpaSpecificationExecutor<Order> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT o FROM SalesOrder o WHERE o.id = :id")
        Optional<Order> findByIdForUpdate(@Param("id") UUID id);

        long countByStatus(OrderStatus status);
    }

    interface OrderStatusHistoryRepository extends JpaRepository<OrderStatusHistory, UUID> {
        List<OrderStatusHistory> findByOrderIdOrderByChangedAtAsc(UUID orderId);
    }

    interface DeliveryRepository extends JpaRepository<Delivery, UUID> {
        Optional<Delivery> findFirstByOrderIdOrderByAttemptNumberDesc(UUID orderId);
    }

    interface CartRepository extends JpaRepository<Cart, UUID> {
        Optional<Cart> findByCustomerId(UUID customerId);
    }
}
