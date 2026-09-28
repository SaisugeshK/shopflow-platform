package com.shopflow.business;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface BusinessRepository extends JpaRepository<Business, UUID> {
}

interface BusinessBankAccountRepository extends JpaRepository<BusinessBankAccount, UUID> {
    List<BusinessBankAccount> findByBusinessIdOrderByCreatedAtAsc(UUID businessId);

    Optional<BusinessBankAccount> findFirstByBusinessIdAndDefaultAccountTrueAndActiveTrue(UUID businessId);

    Optional<BusinessBankAccount> findByIdAndBusinessId(UUID id, UUID businessId);
}

interface BusinessSettingsRepository extends JpaRepository<BusinessSettings, UUID> {
}

interface InvoiceSettingsRepository extends JpaRepository<InvoiceSettings, UUID> {
}

interface TaxSettingsRepository extends JpaRepository<TaxSettings, UUID> {
}
