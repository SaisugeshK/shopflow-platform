package com.shopflow.suppliers;

import com.shopflow.common.util.Validation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class SupplierDtos {

    private SupplierDtos() {
    }

    public record SupplierAddressDto(@NotBlank @Size(max = 200) String addressLine1, @Size(max = 200) String addressLine2,
                                     @NotBlank @Size(max = 100) String city, @NotBlank @Size(max = 100) String state,
                                     @Pattern(regexp = Validation.STATE_CODE) String stateCode,
                                     @NotBlank @Pattern(regexp = Validation.PINCODE) String pincode) {
    }

    /** Used for create (name required) and PATCH (null fields unchanged). */
    public record SupplierRequest(@Size(max = 200) String name, @Size(max = 200) String contactPerson,
                                  String mobileNumber, @Email @Size(max = 200) String email,
                                  @Pattern(regexp = Validation.GSTIN, message = "Enter a valid GSTIN") String gstin,
                                  @Pattern(regexp = Validation.PAN, message = "Enter a valid PAN") String pan,
                                  @Size(max = 200) String paymentTerms, @Min(0) @Max(365) Integer creditDays,
                                  Boolean active, @Valid SupplierAddressDto address) {
    }

    public record SupplierResponse(UUID id, String supplierCode, String name, String contactPerson, String mobileNumber,
                                   String email, String gstin, String pan, String paymentTerms, int creditDays,
                                   boolean active, SupplierAddressDto address, BigDecimal outstanding, Instant createdAt) {
    }

    public record SupplierLedgerResponse(UUID id, LocalDate date, String entryType, String referenceType, UUID referenceId,
                                         String referenceNumber, BigDecimal debit, BigDecimal credit, BigDecimal balance,
                                         String narration) {
        static SupplierLedgerResponse of(SupplierLedgerEntry e) {
            return new SupplierLedgerResponse(e.getId(), e.getEntryDate(), e.getEntryType().name(), e.getReferenceType(),
                    e.getReferenceId(), e.getReferenceNumber(), e.getDebit(), e.getCredit(), e.getBalanceAfter(), e.getNarration());
        }
    }
}
