package com.shopflow.customers;

import com.shopflow.business.BusinessSettings.CreditPolicy;
import com.shopflow.common.util.Validation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class CustomerDtos {

    private CustomerDtos() {
    }

    public record AddressRequest(
            @Size(max = 60) String label,
            @NotBlank @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @NotBlank @Size(max = 100) String city,
            @NotBlank @Size(max = 100) String state,
            @Pattern(regexp = Validation.STATE_CODE) String stateCode,
            @NotBlank @Pattern(regexp = Validation.PINCODE, message = "Enter a valid 6-digit pincode") String pincode,
            Boolean isDefault) {
    }

    /** Submitted after OTP verification with a registration token (§4.2). */
    public record RegistrationRequest(
            @NotBlank @Size(max = 200) String shopName,
            @NotBlank @Size(max = 200) String contactName,
            @NotNull @Valid AddressRequest address,
            @Pattern(regexp = Validation.GSTIN, message = "Enter a valid GSTIN") String gstin,
            @Pattern(regexp = Validation.PAN, message = "Enter a valid PAN") String pan,
            @Email @Size(max = 200) String email,
            String alternateMobile) {
    }

    public record CreateCustomerRequest(
            @NotBlank String mobileNumber,
            @NotBlank @Size(max = 200) String shopName,
            @NotBlank @Size(max = 200) String contactName,
            @NotNull @Valid AddressRequest address,
            @Pattern(regexp = Validation.GSTIN, message = "Enter a valid GSTIN") String gstin,
            @Pattern(regexp = Validation.PAN, message = "Enter a valid PAN") String pan,
            @Email @Size(max = 200) String email,
            String alternateMobile,
            @Size(max = 2000) String notes,
            @Valid CreditProfileRequest credit) {
    }

    public record UpdateCustomerRequest(
            @Size(max = 200) String shopName,
            @Size(max = 200) String contactName,
            @Pattern(regexp = Validation.GSTIN, message = "Enter a valid GSTIN") String gstin,
            @Pattern(regexp = Validation.PAN, message = "Enter a valid PAN") String pan,
            @Email @Size(max = 200) String email,
            String alternateMobile,
            @Size(max = 2000) String notes) {
    }

    public record CreditProfileRequest(
            Boolean creditEnabled,
            @DecimalMin("0") BigDecimal creditLimit,
            @Min(0) @Max(365) Integer creditDays,
            CreditPolicy creditPolicy,
            Boolean clearCreditPolicy) {
    }

    public record StatusChangeRequest(@Size(max = 500) String reason) {
    }

    public record AddressResponse(UUID id, String label, String addressLine1, String addressLine2, String city,
                                  String state, String stateCode, String pincode, boolean isDefault) {
        static AddressResponse of(CustomerAddress a) {
            return new AddressResponse(a.getId(), a.getLabel(), a.getAddressLine1(), a.getAddressLine2(), a.getCity(),
                    a.getState(), a.getStateCode(), a.getPincode(), a.isDefaultAddress());
        }
    }

    public record CreditProfileResponse(boolean creditEnabled, BigDecimal creditLimit, int creditDays,
                                        CreditPolicy creditPolicyOverride) {
        static CreditProfileResponse of(CustomerCreditProfile p) {
            return new CreditProfileResponse(p.isCreditEnabled(), p.getCreditLimit(), p.getCreditDays(), p.getCreditPolicy());
        }
    }

    public record CustomerSummary(UUID id, String customerCode, String shopName, String contactName, String mobileNumber,
                                  String gstin, String status, String city, BigDecimal outstanding,
                                  BigDecimal creditLimit, int creditDays, BigDecimal totalSales,
                                  Instant lastTransactionAt, Instant createdAt) {
    }

    public record CustomerDetail(UUID id, String customerCode, String shopName, String contactName, String mobileNumber,
                                 String alternateMobile, String email, String gstin, String pan, String status,
                                 String statusReason, Instant statusChangedAt, String notes, boolean hasLogin,
                                 List<AddressResponse> addresses, CreditProfileResponse credit,
                                 CreditService.Outstanding outstanding, Instant createdAt, Instant updatedAt,
                                 /* Agent / broker for commission (§0B.9); staff only. */
                                 UUID agentId) {
    }

    public record LedgerEntryResponse(UUID id, LocalDate date, String entryType, String referenceType, UUID referenceId,
                                      String referenceNumber, BigDecimal debit, BigDecimal credit,
                                      BigDecimal balance, String narration, Instant createdAt) {
        static LedgerEntryResponse of(CustomerLedgerEntry e) {
            return new LedgerEntryResponse(e.getId(), e.getEntryDate(), e.getEntryType().name(), e.getReferenceType(),
                    e.getReferenceId(), e.getReferenceNumber(), e.getDebit(), e.getCredit(), e.getBalanceAfter(),
                    e.getNarration(), e.getCreatedAt());
        }
    }

    public record RegistrationStatusResponse(UUID customerId, String customerCode, String status, String reason) {
    }
}
