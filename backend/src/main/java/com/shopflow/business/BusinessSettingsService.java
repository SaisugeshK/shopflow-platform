package com.shopflow.business;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.business.BusinessDtos.BankAccountRequest;
import com.shopflow.business.BusinessDtos.BankAccountResponse;
import com.shopflow.business.BusinessDtos.BusinessProfileResponse;
import com.shopflow.business.BusinessDtos.BusinessSettingsResponse;
import com.shopflow.business.BusinessDtos.InvoiceSettingsResponse;
import com.shopflow.business.BusinessDtos.TaxSettingsResponse;
import com.shopflow.business.BusinessDtos.UpdateBankAccountRequest;
import com.shopflow.business.BusinessDtos.UpdateBusinessProfileRequest;
import com.shopflow.business.BusinessDtos.UpdateBusinessSettingsRequest;
import com.shopflow.business.BusinessDtos.UpdateInvoiceSettingsRequest;
import com.shopflow.business.BusinessDtos.UpdateTaxSettingsRequest;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.IndianStates;
import com.shopflow.common.util.Validation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/**
 * Business profile and configurable settings. Every change is audited as SETTINGS_CHANGED with before/after values.
 */
@Service
public class BusinessSettingsService {

    private final BusinessRepository businesses;
    private final BusinessSettingsRepository settingsRepo;
    private final InvoiceSettingsRepository invoiceSettingsRepo;
    private final TaxSettingsRepository taxSettingsRepo;
    private final BusinessBankAccountRepository bankAccounts;
    private final BusinessContext context;
    private final AuditService audit;

    BusinessSettingsService(BusinessRepository businesses, BusinessSettingsRepository settingsRepo,
                            InvoiceSettingsRepository invoiceSettingsRepo, TaxSettingsRepository taxSettingsRepo,
                            BusinessBankAccountRepository bankAccounts, BusinessContext context, AuditService audit) {
        this.businesses = businesses;
        this.settingsRepo = settingsRepo;
        this.invoiceSettingsRepo = invoiceSettingsRepo;
        this.taxSettingsRepo = taxSettingsRepo;
        this.bankAccounts = bankAccounts;
        this.context = context;
        this.audit = audit;
    }

    public Business business() {
        return businesses.findById(context.businessId()).orElseThrow();
    }

    public BusinessSettings settings() {
        return settingsRepo.findById(context.businessId()).orElseThrow();
    }

    public InvoiceSettings invoiceSettings() {
        return invoiceSettingsRepo.findById(context.businessId()).orElseThrow();
    }

    public TaxSettings taxSettings() {
        return taxSettingsRepo.findById(context.businessId()).orElseThrow();
    }

    public Optional<BusinessBankAccount> defaultBankAccount() {
        return bankAccounts.findFirstByBusinessIdAndDefaultAccountTrueAndActiveTrue(context.businessId());
    }

    @Transactional
    public BusinessProfileResponse updateProfile(UpdateBusinessProfileRequest r) {
        Business b = business();
        BusinessProfileResponse before = BusinessProfileResponse.of(b);
        set(r.name(), b::setName);
        set(r.legalName(), b::setLegalName);
        set(r.addressLine1(), b::setAddressLine1);
        set(r.addressLine2(), b::setAddressLine2);
        set(r.city(), b::setCity);
        if (r.state() != null || r.stateCode() != null) {
            String state = r.state() != null ? r.state().trim() : b.getState();
            b.setState(state);
            b.setStateCode(IndianStates.resolve(state, r.stateCode()));
        }
        set(r.pincode(), b::setPincode);
        set(r.phone(), b::setPhone);
        set(r.mobile(), b::setMobile);
        set(r.email(), b::setEmail);
        if (r.gstin() != null) {
            b.setGstin(Validation.upper(r.gstin()));
        }
        if (r.pan() != null) {
            b.setPan(Validation.upper(r.pan()));
        }
        if (r.financialYearStartMonth() != null) {
            b.setFinancialYearStartMonth(r.financialYearStartMonth());
        }
        set(r.termsAndConditions(), b::setTermsAndConditions);
        set(r.authorizedSignatory(), b::setAuthorizedSignatory);
        businesses.saveAndFlush(b);
        context.evict();
        BusinessProfileResponse after = BusinessProfileResponse.of(b);
        audit.record(AuditAction.SETTINGS_CHANGED, "BUSINESS", b.getId(), before, after);
        return after;
    }

    @Transactional
    public BusinessProfileResponse setLogo(UUID fileId) {
        Business b = business();
        UUID old = b.getLogoFileId();
        b.setLogoFileId(fileId);
        businesses.saveAndFlush(b);
        context.evict();
        audit.record(AuditAction.SETTINGS_CHANGED, "BUSINESS", b.getId(),
                java.util.Map.of("logoFileId", String.valueOf(old)), java.util.Map.of("logoFileId", fileId));
        return BusinessProfileResponse.of(b);
    }

    @Transactional
    public BusinessSettingsResponse updateSettings(UpdateBusinessSettingsRequest r) {
        BusinessSettings s = settings();
        BusinessSettingsResponse before = BusinessSettingsResponse.of(s);
        set(r.creditPolicy(), s::setCreditPolicy);
        set(r.customerCancelAllowedUntil(), s::setCustomerCancelAllowedUntil);
        set(r.showStockToCustomers(), s::setShowStockToCustomers);
        set(r.gstinRequiredForCustomers(), s::setGstinRequiredForCustomers);
        set(r.panRequiredForCustomers(), s::setPanRequiredForCustomers);
        set(r.partialDeliveryInvoicePolicy(), s::setPartialDeliveryInvoicePolicy);
        set(r.defaultCreditDays(), s::setDefaultCreditDays);
        set(r.defaultCreditLimit(), s::setDefaultCreditLimit);
        set(r.whatsappEnabled(), s::setWhatsappEnabled);
        set(r.whatsappSender(), s::setWhatsappSender);
        set(r.whatsappInvoiceTemplate(), s::setWhatsappInvoiceTemplate);
        set(r.notifyPush(), s::setNotifyPush);
        set(r.notifySms(), s::setNotifySms);
        set(r.notifyEmail(), s::setNotifyEmail);
        set(r.notifyWhatsapp(), s::setNotifyWhatsapp);
        set(r.dataRetentionYears(), s::setDataRetentionYears);
        set(r.blockExpiredSales(), s::setBlockExpiredSales);
        set(r.nearExpiryDays(), s::setNearExpiryDays);
        settingsRepo.saveAndFlush(s);
        BusinessSettingsResponse after = BusinessSettingsResponse.of(s);
        audit.record(AuditAction.SETTINGS_CHANGED, "BUSINESS_SETTINGS", context.businessId(), before, after);
        return after;
    }

    /**
     * Prefix/padding/starting number changes apply to sequences created afterwards (the next financial year).
     * Issued numbers are never renumbered (§92.23).
     */
    @Transactional
    public InvoiceSettingsResponse updateInvoiceSettings(UpdateInvoiceSettingsRequest r) {
        InvoiceSettings s = invoiceSettings();
        InvoiceSettingsResponse before = InvoiceSettingsResponse.of(s);
        set(r.invoicePrefix(), s::setInvoicePrefix);
        set(r.numberPadding(), s::setNumberPadding);
        set(r.startingNumber(), s::setStartingNumber);
        set(r.defaultPaymentTerms(), s::setDefaultPaymentTerms);
        set(r.defaultTerms(), s::setDefaultTerms);
        set(r.defaultFooter(), s::setDefaultFooter);
        set(r.declaration(), s::setDeclaration);
        set(r.templateCode(), s::setTemplateCode);
        set(r.showBankDetails(), s::setShowBankDetails);
        invoiceSettingsRepo.saveAndFlush(s);
        InvoiceSettingsResponse after = InvoiceSettingsResponse.of(s);
        audit.record(AuditAction.SETTINGS_CHANGED, "INVOICE_SETTINGS", context.businessId(), before, after);
        return after;
    }

    @Transactional
    public InvoiceSettingsResponse setSignature(UUID fileId) {
        InvoiceSettings s = invoiceSettings();
        s.setSignatureFileId(fileId);
        audit.record(AuditAction.SETTINGS_CHANGED, "INVOICE_SETTINGS", context.businessId(), null,
                java.util.Map.of("signatureFileId", fileId));
        return InvoiceSettingsResponse.of(s);
    }

    @Transactional
    public TaxSettingsResponse updateTaxSettings(UpdateTaxSettingsRequest r) {
        TaxSettings s = taxSettings();
        TaxSettingsResponse before = TaxSettingsResponse.of(s);
        set(r.roundOffEnabled(), s::setRoundOffEnabled);
        if (r.allowedGstRates() != null) {
            if (r.allowedGstRates().isEmpty()) {
                throw BusinessException.validation("allowedGstRates", "At least one GST rate is required");
            }
            s.setAllowedGstRates(r.allowedGstRates().stream().map(BigDecimal::stripTrailingZeros)
                    .map(BigDecimal::toPlainString).distinct().collect(Collectors.joining(",")));
        }
        if (r.defaultGstRate() != null) {
            s.setDefaultGstRate(r.defaultGstRate());
        }
        if (!s.isAllowedRate(s.getDefaultGstRate())) {
            throw BusinessException.validation("defaultGstRate", "Default GST rate must be one of the allowed rates");
        }
        taxSettingsRepo.saveAndFlush(s);
        TaxSettingsResponse after = TaxSettingsResponse.of(s);
        audit.record(AuditAction.SETTINGS_CHANGED, "TAX_SETTINGS", context.businessId(), before, after);
        return after;
    }

    public List<BankAccountResponse> bankAccounts() {
        return bankAccounts.findByBusinessIdOrderByCreatedAtAsc(context.businessId()).stream().map(BankAccountResponse::of).toList();
    }

    @Transactional
    public BankAccountResponse addBankAccount(BankAccountRequest r) {
        BusinessBankAccount a = new BusinessBankAccount();
        a.setBusinessId(context.businessId());
        a.setBankName(r.bankName().trim());
        a.setAccountName(Validation.trim(r.accountName()));
        a.setAccountNumber(r.accountNumber());
        a.setIfsc(r.ifsc());
        a.setBranch(Validation.trim(r.branch()));
        a.setActive(r.active() == null || r.active());
        boolean makeDefault = Boolean.TRUE.equals(r.isDefault()) || defaultBankAccount().isEmpty();
        if (makeDefault) {
            clearDefault();
        }
        a.setDefaultAccount(makeDefault);
        bankAccounts.saveAndFlush(a);
        audit.record(AuditAction.SETTINGS_CHANGED, "BANK_ACCOUNT", a.getId(), null, BankAccountResponse.of(a));
        return BankAccountResponse.of(a);
    }

    @Transactional
    public BankAccountResponse updateBankAccount(UUID id, UpdateBankAccountRequest r) {
        BusinessBankAccount a = bankAccounts.findByIdAndBusinessId(id, context.businessId())
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Bank account"));
        BankAccountResponse before = BankAccountResponse.of(a);
        set(r.bankName(), a::setBankName);
        set(r.accountName(), a::setAccountName);
        set(r.accountNumber(), a::setAccountNumber);
        set(r.ifsc(), a::setIfsc);
        set(r.branch(), a::setBranch);
        set(r.active(), a::setActive);
        if (Boolean.TRUE.equals(r.isDefault()) && !a.isDefaultAccount()) {
            clearDefault();
            a.setDefaultAccount(true);
        }
        bankAccounts.saveAndFlush(a);
        audit.record(AuditAction.SETTINGS_CHANGED, "BANK_ACCOUNT", a.getId(), before, BankAccountResponse.of(a));
        return BankAccountResponse.of(a);
    }

    private void clearDefault() {
        defaultBankAccount().ifPresent(existing -> {
            existing.setDefaultAccount(false);
            bankAccounts.saveAndFlush(existing);
        });
    }

    @SuppressWarnings("unchecked")
    private static <T> void set(T value, Consumer<T> setter) {
        if (value != null) {
            setter.accept(value instanceof String s ? (T) s.trim() : value);
        }
    }
}
