package com.shopflow.customers;

import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Money;
import com.shopflow.customers.CustomerLedgerEntry.EntryType;
import com.shopflow.customers.CustomerRepositories.CustomerLedgerRepository;
import com.shopflow.customers.CustomerRepositories.CustomerRepository;
import com.shopflow.security.CurrentUser;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * The only writer of customer ledger entries. Positive balance = customer owes the business.
 * Postings lock the customer row so running balances are consistent under concurrency.
 */
@Service
public class CustomerLedgerService {

    private final CustomerLedgerRepository ledger;
    private final CustomerRepository customers;
    private final BusinessContext businessContext;

    public CustomerLedgerService(CustomerLedgerRepository ledger, CustomerRepository customers, BusinessContext businessContext) {
        this.ledger = ledger;
        this.customers = customers;
        this.businessContext = businessContext;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public CustomerLedgerEntry debit(UUID customerId, EntryType type, String referenceType, UUID referenceId,
                                     String referenceNumber, BigDecimal amount, String narration) {
        return post(customerId, type, referenceType, referenceId, referenceNumber, Money.of(amount), Money.ZERO, narration);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public CustomerLedgerEntry credit(UUID customerId, EntryType type, String referenceType, UUID referenceId,
                                      String referenceNumber, BigDecimal amount, String narration) {
        return post(customerId, type, referenceType, referenceId, referenceNumber, Money.ZERO, Money.of(amount), narration);
    }

    private CustomerLedgerEntry post(UUID customerId, EntryType type, String referenceType, UUID referenceId,
                                     String referenceNumber, BigDecimal debit, BigDecimal credit, String narration) {
        if (debit.signum() == 0 && credit.signum() == 0) {
            throw new IllegalArgumentException("Ledger entry amount must be positive");
        }
        customers.findByIdForUpdate(customerId)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.CUSTOMER_NOT_FOUND, "Customer"));
        BigDecimal balance = Money.of(ledger.balance(customerId)).add(debit).subtract(credit);
        CustomerLedgerEntry entry = new CustomerLedgerEntry(customerId, businessContext.today(), type, referenceType,
                referenceId, referenceNumber, debit, credit, balance, narration, CurrentUser.idIfPresent().orElse(null));
        return ledger.save(entry);
    }

    public BigDecimal balance(UUID customerId) {
        return Money.of(ledger.balance(customerId));
    }

    public Page<CustomerLedgerEntry> entries(UUID customerId, Pageable pageable) {
        return ledger.findByCustomerId(customerId, pageable);
    }
}
