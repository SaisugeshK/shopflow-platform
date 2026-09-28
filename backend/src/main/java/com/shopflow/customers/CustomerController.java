package com.shopflow.customers;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.customers.CustomerDtos.AddressRequest;
import com.shopflow.customers.CustomerDtos.AddressResponse;
import com.shopflow.customers.CustomerDtos.CreateCustomerRequest;
import com.shopflow.customers.CustomerDtos.CreditProfileRequest;
import com.shopflow.customers.CustomerDtos.CreditProfileResponse;
import com.shopflow.customers.CustomerDtos.CustomerDetail;
import com.shopflow.customers.CustomerDtos.CustomerSummary;
import com.shopflow.customers.CustomerDtos.LedgerEntryResponse;
import com.shopflow.customers.CustomerDtos.StatusChangeRequest;
import com.shopflow.customers.CustomerDtos.UpdateCustomerRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Staff-facing customer management. Customers use {@code /api/v1/my/**} for their own data.
 * Orders, invoices and payments per customer are served by those modules' controllers.
 */
@RestController
@RequestMapping("/api/v1/customers")
@Tag(name = "Customers", description = "Customer management, approval, credit and ledger")
@SecurityRequirement(name = "bearerAuth")
public class CustomerController {

    private final CustomerService service;
    private final CreditService creditService;

    public CustomerController(CustomerService service, CreditService creditService) {
        this.service = service;
        this.creditService = creditService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    @Operation(summary = "Search customers", description = "Filter by text (shop, contact, mobile, code, GSTIN), status and outstanding. Sort: shopName, customerCode, createdAt.")
    public ApiResponse<List<CustomerSummary>> list(@RequestParam(required = false) String q,
                                                   @RequestParam(required = false) Customer.CustomerStatus status,
                                                   @RequestParam(required = false) Boolean hasOutstanding,
                                                   @RequestParam(required = false) Integer page,
                                                   @RequestParam(required = false) Integer pageSize,
                                                   @RequestParam(required = false) String sort) {
        var pageable = PageQuery.of(page, pageSize, sort, PageQuery.fields("shopName", "customerCode", "createdAt"),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        return ApiResponse.page(service.search(q, status, hasOutstanding, pageable));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    @Operation(summary = "Get customer detail", description = "Profile, addresses, credit profile and outstanding summary.")
    public ApiResponse<CustomerDetail> get(@PathVariable UUID id) {
        return ApiResponse.ok(service.detail(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Create a customer", description = "Staff-created customers are APPROVED immediately and can sign in with their mobile number.")
    public ApiResponse<CustomerDetail> create(@Valid @RequestBody CreateCustomerRequest request) {
        return ApiResponse.ok(service.detail(service.create(request).getId()), "Customer created");
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Update a customer")
    public ApiResponse<CustomerDetail> update(@PathVariable UUID id, @Valid @RequestBody UpdateCustomerRequest request) {
        service.update(id, request, false);
        return ApiResponse.ok(service.detail(id));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Approve a customer", description = "Also used to unblock a blocked customer.")
    public ApiResponse<CustomerDetail> approve(@PathVariable UUID id, @Valid @RequestBody(required = false) StatusChangeRequest request) {
        service.approve(id, request == null ? null : request.reason());
        return ApiResponse.ok(service.detail(id));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Reject a pending registration")
    public ApiResponse<CustomerDetail> reject(@PathVariable UUID id, @Valid @RequestBody(required = false) StatusChangeRequest request) {
        service.reject(id, request == null ? null : request.reason());
        return ApiResponse.ok(service.detail(id));
    }

    @PostMapping("/{id}/block")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Block a customer", description = "Revokes the customer's sessions immediately.")
    public ApiResponse<CustomerDetail> block(@PathVariable UUID id, @Valid @RequestBody(required = false) StatusChangeRequest request) {
        service.block(id, request == null ? null : request.reason());
        return ApiResponse.ok(service.detail(id));
    }

    @PatchMapping("/{id}/credit")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Update the credit profile", description = "Credit limit, credit days, enable/disable. Policy overrides require CREDIT_OVERRIDE.")
    public ApiResponse<CreditProfileResponse> updateCredit(@PathVariable UUID id, @Valid @RequestBody CreditProfileRequest request) {
        return ApiResponse.ok(service.updateCredit(id, request));
    }

    @GetMapping("/{id}/ledger")
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    @Operation(summary = "Customer ledger (statement)", description = "Debit/credit entries with running balance, oldest first.")
    public ApiResponse<List<LedgerEntryResponse>> ledger(@PathVariable UUID id,
                                                         @RequestParam(required = false) Integer page,
                                                         @RequestParam(required = false) Integer pageSize) {
        var pageable = PageQuery.of(page, pageSize, null, java.util.Map.of(), Sort.by("createdAt", "id"));
        service.get(id);
        return ApiResponse.page(service.ledger(id, pageable), LedgerEntryResponse::of);
    }

    @GetMapping("/{id}/outstanding")
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    @Operation(summary = "Outstanding and credit summary")
    public ApiResponse<CreditService.Outstanding> outstanding(@PathVariable UUID id) {
        service.get(id);
        return ApiResponse.ok(creditService.outstanding(id));
    }

    @GetMapping("/{id}/addresses")
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    @Operation(summary = "List customer addresses")
    public ApiResponse<List<AddressResponse>> addresses(@PathVariable UUID id) {
        return ApiResponse.ok(service.listAddresses(id));
    }

    @PostMapping("/{id}/addresses")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Add a customer address")
    public ApiResponse<AddressResponse> addAddress(@PathVariable UUID id, @Valid @RequestBody AddressRequest request) {
        return ApiResponse.ok(service.addAddress(id, request));
    }

    @PatchMapping("/{id}/addresses/{addressId}")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Update a customer address")
    public ApiResponse<AddressResponse> updateAddress(@PathVariable UUID id, @PathVariable UUID addressId,
                                                      @Valid @RequestBody AddressRequest request) {
        return ApiResponse.ok(service.updateAddress(id, addressId, request));
    }

    @DeleteMapping("/{id}/addresses/{addressId}")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Remove a customer address", description = "Soft delete; past orders keep their address snapshot.")
    public ApiResponse<Void> removeAddress(@PathVariable UUID id, @PathVariable UUID addressId) {
        service.removeAddress(id, addressId);
        return ApiResponse.ok(null);
    }
}
