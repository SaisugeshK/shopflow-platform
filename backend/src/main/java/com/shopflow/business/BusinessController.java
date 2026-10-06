package com.shopflow.business;

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
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.util.IndianStates;
import com.shopflow.files.FileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/business")
@Tag(name = "Business Settings", description = "Business profile, invoice/tax settings, bank accounts and operational rules")
@SecurityRequirement(name = "bearerAuth")
public class BusinessController {

    private static final String READ_SETTINGS = "hasAnyAuthority('SETTINGS_MANAGE','DASHBOARD_VIEW')";

    private final BusinessSettingsService service;
    private final FileService files;

    private final com.shopflow.tenancy.Vocabulary vocabulary;

    public BusinessController(BusinessSettingsService service, FileService files, com.shopflow.tenancy.Vocabulary vocabulary) {
        this.service = service;
        this.files = files;
        this.vocabulary = vocabulary;
    }

    @GetMapping
    @Operation(summary = "Get the business profile", description = "Available to every signed-in user (seller details shown on invoices).")
    public ApiResponse<BusinessProfileResponse> get() {
        return ApiResponse.ok(BusinessProfileResponse.of(service.business()));
    }

    @PatchMapping
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Update the business profile", description = "Only provided fields change. State code is derived from the state name when omitted.")
    public ApiResponse<BusinessProfileResponse> update(@Valid @RequestBody UpdateBusinessProfileRequest request) {
        return ApiResponse.ok(service.updateProfile(request));
    }

    @PostMapping(path = "/logo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Upload the business logo", description = "PNG, JPEG or WebP up to 5 MB.")
    public ApiResponse<BusinessProfileResponse> uploadLogo(@RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(service.setLogo(files.storeImage(file, "BUSINESS_LOGO").getId()));
    }

    @GetMapping("/settings")
    @PreAuthorize(READ_SETTINGS)
    @Operation(summary = "Get operational business rules", description = "Credit policy, cancellation window, partial-delivery invoicing, notifications, retention.")
    public ApiResponse<BusinessSettingsResponse> settings() {
        return ApiResponse.ok(BusinessSettingsResponse.of(service.settings()));
    }

    @PatchMapping("/settings")
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Update operational business rules")
    public ApiResponse<BusinessSettingsResponse> updateSettings(@Valid @RequestBody UpdateBusinessSettingsRequest request) {
        return ApiResponse.ok(service.updateSettings(request));
    }

    @GetMapping("/invoice-settings")
    @PreAuthorize(READ_SETTINGS)
    @Operation(summary = "Get invoice settings")
    public ApiResponse<InvoiceSettingsResponse> invoiceSettings() {
        return ApiResponse.ok(InvoiceSettingsResponse.of(service.invoiceSettings()));
    }

    @PatchMapping("/invoice-settings")
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Update invoice settings", description = "Numbering changes apply to sequences created for a new financial year; issued numbers never change.")
    public ApiResponse<InvoiceSettingsResponse> updateInvoiceSettings(@Valid @RequestBody UpdateInvoiceSettingsRequest request) {
        return ApiResponse.ok(service.updateInvoiceSettings(request));
    }

    @PostMapping(path = "/invoice-settings/signature", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Upload the authorized-signature image")
    public ApiResponse<InvoiceSettingsResponse> uploadSignature(@RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(service.setSignature(files.storeImage(file, "SIGNATURE").getId()));
    }

    @GetMapping("/tax-settings")
    @Operation(summary = "Get tax settings", description = "Available to every signed-in user; needed to render tax information.")
    public ApiResponse<TaxSettingsResponse> taxSettings() {
        return ApiResponse.ok(TaxSettingsResponse.of(service.taxSettings()));
    }

    @PatchMapping("/tax-settings")
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Update tax settings")
    public ApiResponse<TaxSettingsResponse> updateTaxSettings(@Valid @RequestBody UpdateTaxSettingsRequest request) {
        return ApiResponse.ok(service.updateTaxSettings(request));
    }

    @GetMapping("/bank-accounts")
    @PreAuthorize(READ_SETTINGS)
    @Operation(summary = "List bank accounts")
    public ApiResponse<List<BankAccountResponse>> bankAccounts() {
        return ApiResponse.ok(service.bankAccounts());
    }

    @PostMapping("/bank-accounts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Add a bank account", description = "The first account becomes the default printed on invoices.")
    public ApiResponse<BankAccountResponse> addBankAccount(@Valid @RequestBody BankAccountRequest request) {
        return ApiResponse.ok(service.addBankAccount(request));
    }

    @PatchMapping("/bank-accounts/{id}")
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Update a bank account")
    public ApiResponse<BankAccountResponse> updateBankAccount(@PathVariable UUID id, @Valid @RequestBody UpdateBankAccountRequest request) {
        return ApiResponse.ok(service.updateBankAccount(id, request));
    }

    @GetMapping("/states")
    @Operation(summary = "List Indian states with GST state codes")
    public ApiResponse<Map<String, String>> states() {
        return ApiResponse.ok(new TreeMap<>(IndianStates.all()));
    }

    /** Words and units for this business's screens (§0B.15): industry defaults plus the owner's changes. */
    @GetMapping("/vocabulary")
    @PreAuthorize(READ_SETTINGS)
    @Operation(summary = "Words and units used in the screens")
    public ApiResponse<com.shopflow.tenancy.Vocabulary.Effective> vocabulary() {
        return ApiResponse.ok(vocabulary.effective());
    }

    public record VocabularyRequest(java.util.Map<String, String> terms, java.util.List<String> units) {
    }

    @PutMapping("/vocabulary")
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Rename words and choose units", description = "Empty values go back to the industry defaults.")
    public ApiResponse<com.shopflow.tenancy.Vocabulary.Effective> saveVocabulary(@RequestBody VocabularyRequest request) {
        return ApiResponse.ok(vocabulary.save(request.terms(), request.units()));
    }
}
