package com.shopflow.payments;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRepositories {

    interface PaymentRepository extends JpaRepository<Payment, UUID>, JpaSpecificationExecutor<Payment> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT p FROM Payment p WHERE p.id = :id")
        Optional<Payment> findByIdForUpdate(@Param("id") UUID id);

        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT p FROM Payment p WHERE p.provider = :provider AND p.providerOrderId = :providerOrderId")
        Optional<Payment> findByProviderOrderForUpdate(@Param("provider") String provider, @Param("providerOrderId") String providerOrderId);

        List<Payment> findByOrderIdOrderByCreatedAtAsc(UUID orderId);

        List<Payment> findByInvoiceIdOrderByCreatedAtAsc(UUID invoiceId);

        @Query("""
                SELECT p FROM Payment p WHERE p.customerId = :customerId AND p.status IN (com.shopflow.payments.PaymentStatus.CAPTURED, com.shopflow.payments.PaymentStatus.PARTIALLY_PAID)
                AND p.amount > p.allocatedAmount + p.refundedAmount ORDER BY p.paidAt, p.createdAt
                """)
        List<Payment> findUnallocatedForCustomer(@Param("customerId") UUID customerId);
    }

    interface PaymentAllocationRepository extends JpaRepository<PaymentAllocation, UUID> {
        List<PaymentAllocation> findByInvoiceIdAndReversedFalse(UUID invoiceId);

        List<PaymentAllocation> findByPaymentIdAndReversedFalse(UUID paymentId);
    }

    interface PaymentReceiptRepository extends JpaRepository<PaymentReceipt, UUID> {
        Optional<PaymentReceipt> findByPaymentId(UUID paymentId);
    }

    interface PaymentGatewayEventRepository extends JpaRepository<PaymentGatewayEvent, UUID> {
        boolean existsByProviderAndEventId(String provider, String eventId);
    }
}
