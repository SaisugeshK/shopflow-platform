package com.shopflow.business;

import com.shopflow.business.BusinessSettings.CreditPolicy;
import com.shopflow.business.BusinessSettings.CustomerCancelUntil;
import com.shopflow.business.BusinessSettings.PartialDeliveryInvoicePolicy;
import com.shopflow.common.util.Validation;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public final class BusinessDtos {

    private BusinessDtos() {
    }

    public record BusinessProfileResponse(UUID id, String name, String legalName, UUID logoFileId, String addressLine1,
                                          String addressLine2, String city, String state, String stateCode,
                                          String pincode, String phone, String mobile, String email, String gstin,
                                          String pan, String timezone, String currency, int financialYearStartMonth,
                                          String termsAndConditions, String authorizedSignatory) {
        static BusinessProfileResponse of(Business b) {
            return new BusinessProfileResponse(b.getId(), b.getName(), b.getLegalName(), b.getLogoFileId(),
                    b.getAddressLine1(), b.getAddressLine2(), b.getCity(), b.getState(), b.getStateCode(),
                    b.getPincode(), b.getPhone(), b.getMobile(), b.getEmail(), b.getGstin(), b.getPan(),
                    b.getTimezone(), b.getCurrency(), b.getFinancialYearStartMonth(), b.getTermsAndConditions(),
                    b.getAuthorizedSignatory());
        }
    }

    /** PATCH semantics: null fields are left unchanged. */
    public record UpdateBusinessProfileRequest(
            @Size(max = 200) String name,
            @Size(max = 200) String legalName,
            @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @Size(max = 100) String city,
            @Size(max = 100) String state,
            @Pattern(regexp = Validation.STATE_CODE) String stateCode,
            @Pattern(regexp = Validation.PINCODE) String pincode,
            @Size(max = 20) String phone,
            @Size(max = 20) String mobile,
            @Email @Size(max = 200) String email,
            @Pattern(regexp = Validation.GSTIN) String gstin,
            @Pattern(regexp = Validation.PAN) String pan,
            @Min(1) @Max(12) Integer financialYearStartMonth,
            @Size(max = 4000) String termsAndConditions,
            @Size(max = 200) String authorizedSignatory) {
    }

    public record BusinessSettingsResponse(CreditPolicy creditPolicy, CustomerCancelUntil customerCancelAllowedUntil,
                                           boolean showStockToCustomers, boolean gstinRequiredForCustomers,
                                           boolean panRequiredForCustomers,
                                           PartialDeliveryInvoicePolicy partialDeliveryInvoicePolicy,
                                           int defaultCreditDays, BigDecimal defaultCreditLimit,
                                           boolean whatsappEnabled, String whatsappSender,
                                           String whatsappInvoiceTemplate, boolean notifyPush, boolean notifySms,
                                           boolean notifyEmail, boolean notifyWhatsapp, int dataRetentionYears) {
        static BusinessSettingsResponse of(BusinessSettings s) {
            return new BusinessSettingsResponse(s.getCreditPolicy(), s.getCustomerCancelAllowedUntil(),
                    s.isShowStockToCustomers(), s.isGstinRequiredForCustomers(), s.isPanRequiredForCustomers(),
                    s.getPartialDeliveryInvoicePolicy(), s.getDefaultCreditDays(), s.getDefaultCreditLimit(),
                    s.isWhatsappEnabled(), s.getWhatsappSender(), s.getWhatsappInvoiceTemplate(), s.isNotifyPush(),
                    s.isNotifySms(), s.isNotifyEmail(), s.isNotifyWhatsapp(), s.getDataRetentionYears());
        }
    }

    public record UpdateBusinessSettingsRequest(CreditPolicy creditPolicy, CustomerCancelUntil customerCancelAllowedUntil,
                                                Boolean showStockToCustomers, Boolean gstinRequiredForCustomers,
                                                Boolean panRequiredForCustomers,
                                                PartialDeliveryInvoicePolicy partialDeliveryInvoicePolicy,
                                                @Min(0) @Max(365) Integer defaultCreditDays,
                                                @DecimalMin("0") BigDecimal defaultCreditLimit,
                                                Boolean whatsappEnabled, @Size(max = 40) String whatsappSender,
                                                @Size(max = 100) String whatsappInvoiceTemplate, Boolean notifyPush,
                                                Boolean notifySms, Boolean notifyEmail, Boolean notifyWhatsapp,
                                                @Min(1) @Max(50) Integer dataRetentionYears) {
    }

    public record InvoiceSettingsResponse(String invoicePrefix, int numberPadding, long startingNumber,
                                          String defaultPaymentTerms, String defaultTerms, String defaultFooter,
                                          String declaration, UUID signatureFileId, String templateCode,
                                          boolean showBankDetails) {
        static InvoiceSettingsResponse of(InvoiceSettings s) {
            return new InvoiceSettingsResponse(s.getInvoicePrefix(), s.getNumberPadding(), s.getStartingNumber(),
                    s.getDefaultPaymentTerms(), s.getDefaultTerms(), s.getDefaultFooter(), s.getDeclaration(),
                    s.getSignatureFileId(), s.getTemplateCode(), s.isShowBankDetails());
        }
    }

    public record UpdateInvoiceSettingsRequest(
            @Pattern(regexp = "^[A-Z0-9]{1,10}$", message = "Prefix must be 1-10 uppercase letters or digits") String invoicePrefix,
            @Min(3) @Max(10) Integer numberPadding,
            @Min(1) Long startingNumber,
            @Size(max = 200) String defaultPaymentTerms,
            @Size(max = 4000) String defaultTerms,
            @Size(max = 500) String defaultFooter,
            @Size(max = 2000) String declaration,
            @Pattern(regexp = "^[A-Z0-9_]{1,40}$") String templateCode,
            Boolean showBankDetails) {
    }

    public record TaxSettingsResponse(String calculationMode, boolean roundOffEnabled, BigDecimal defaultGstRate,
                                      List<BigDecimal> allowedGstRates, String interStateTaxType,
                                      String intraStateTaxType) {
        static TaxSettingsResponse of(TaxSettings s) {
            return new TaxSettingsResponse(s.getCalculationMode(), s.isRoundOffEnabled(), s.getDefaultGstRate(),
                    s.allowedRates(), s.getInterStateTaxType(), s.getIntraStateTaxType());
        }
    }

    public record UpdateTaxSettingsRequest(Boolean roundOffEnabled,
                                           @DecimalMin("0") @DecimalMax("100") BigDecimal defaultGstRate,
                                           List<@DecimalMin("0") @DecimalMax("100") BigDecimal> allowedGstRates) {
    }

    public record BankAccountResponse(UUID id, String bankName, String accountName, String accountNumber, String ifsc,
                                      String branch, boolean isDefault, boolean active) {
        static BankAccountResponse of(BusinessBankAccount a) {
            return new BankAccountResponse(a.getId(), a.getBankName(), a.getAccountName(), a.getAccountNumber(),
                    a.getIfsc(), a.getBranch(), a.isDefaultAccount(), a.isActive());
        }
    }

    public record BankAccountRequest(@NotBlank @Size(max = 200) String bankName,
                                     @Size(max = 200) String accountName,
                                     @NotBlank @Pattern(regexp = "^[0-9]{6,20}$") String accountNumber,
                                     @NotBlank @Pattern(regexp = Validation.IFSC) String ifsc,
                                     @Size(max = 200) String branch,
                                     Boolean isDefault,
                                     Boolean active) {
    }

    public record UpdateBankAccountRequest(@Size(max = 200) String bankName,
                                           @Size(max = 200) String accountName,
                                           @Pattern(regexp = "^[0-9]{6,20}$") String accountNumber,
                                           @Pattern(regexp = Validation.IFSC) String ifsc,
                                           @Size(max = 200) String branch,
                                           Boolean isDefault,
                                           Boolean active) {
    }
}
