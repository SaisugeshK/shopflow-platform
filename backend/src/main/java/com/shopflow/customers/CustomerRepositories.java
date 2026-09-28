package com.shopflow.customers;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CustomerRepositories {

    interface CustomerRepository extends JpaRepository<Customer, UUID>, JpaSpecificationExecutor<Customer> {
        Optional<Customer> findByUserId(UUID userId);

        Optional<Customer> findByBusinessIdAndMobileNumber(UUID businessId, String mobileNumber);

        /** Serialises ledger postings for one customer. */
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT c FROM Customer c WHERE c.id = :id")
        Optional<Customer> findByIdForUpdate(@Param("id") UUID id);

        long countByStatus(Customer.CustomerStatus status);
    }

    interface CustomerAddressRepository extends JpaRepository<CustomerAddress, UUID> {
        List<CustomerAddress> findByCustomerIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(UUID customerId);

        Optional<CustomerAddress> findByIdAndCustomerId(UUID id, UUID customerId);
    }

    interface CustomerCreditProfileRepository extends JpaRepository<CustomerCreditProfile, UUID> {
    }

    interface CustomerLedgerRepository extends JpaRepository<CustomerLedgerEntry, UUID> {
        Page<CustomerLedgerEntry> findByCustomerId(UUID customerId, Pageable pageable);

        Optional<CustomerLedgerEntry> findFirstByCustomerIdOrderByCreatedAtDescIdDesc(UUID customerId);

        @Query("SELECT COALESCE(SUM(e.debit) - SUM(e.credit), 0) FROM CustomerLedgerEntry e WHERE e.customerId = :customerId")
        BigDecimal balance(@Param("customerId") UUID customerId);
    }
}
