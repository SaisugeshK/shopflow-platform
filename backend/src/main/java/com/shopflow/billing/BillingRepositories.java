package com.shopflow.billing;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BillingRepositories {

    interface InvoiceRepository extends JpaRepository<Invoice, UUID>, JpaSpecificationExecutor<Invoice> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT i FROM Invoice i WHERE i.id = :id")
        Optional<Invoice> findByIdForUpdate(@Param("id") UUID id);

        List<Invoice> findByOrderIdAndStatusNot(UUID orderId, InvoiceStatus status);

        @Query("SELECT i FROM Invoice i WHERE i.customerId = :customerId AND i.status IN :statuses ORDER BY i.invoiceDate, i.createdAt")
        List<Invoice> findOpenForCustomer(@Param("customerId") UUID customerId, @Param("statuses") List<InvoiceStatus> statuses);
    }

    interface CreditNoteRepository extends JpaRepository<CreditNote, UUID> {
        List<CreditNote> findByInvoiceIdOrderByCreatedAtAsc(UUID invoiceId);
    }

    interface DebitNoteRepository extends JpaRepository<DebitNote, UUID> {
        List<DebitNote> findByInvoiceIdOrderByCreatedAtAsc(UUID invoiceId);
    }
}
