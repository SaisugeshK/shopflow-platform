package com.shopflow.customers;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.customers.CustomerDtos.AddressRequest;
import com.shopflow.customers.CustomerDtos.AddressResponse;
import com.shopflow.customers.CustomerDtos.CustomerDetail;
import com.shopflow.customers.CustomerDtos.LedgerEntryResponse;
import com.shopflow.customers.CustomerDtos.UpdateCustomerRequest;
import com.shopflow.security.CurrentUser;
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
 * The signed-in customer's own profile, addresses, ledger and outstanding. The customer id always comes from the
 * access token, so a customer can never address another customer's data.
 */
@RestController
@RequestMapping("/api/v1/my")
@Tag(name = "My Account", description = "Customer self-service: business profile, addresses, statement and outstanding")
@SecurityRequirement(name = "bearerAuth")
@PreAuthorize("hasAuthority('CUSTOMER_SELF')")
public class MyAccountController {

    private final CustomerService service;
    private final CreditService creditService;

    public MyAccountController(CustomerService service, CreditService creditService) {
        this.service = service;
        this.creditService = creditService;
    }

    @GetMapping("/profile")
    @Operation(summary = "My business profile")
    public ApiResponse<CustomerDetail> profile() {
        return ApiResponse.ok(service.detail(CurrentUser.customerId()));
    }

    @PatchMapping("/profile")
    @Operation(summary = "Update my business profile")
    public ApiResponse<CustomerDetail> updateProfile(@Valid @RequestBody UpdateCustomerRequest request) {
        UUID id = CurrentUser.customerId();
        service.update(id, request, true);
        return ApiResponse.ok(service.detail(id));
    }

    @GetMapping("/addresses")
    @Operation(summary = "My addresses")
    public ApiResponse<List<AddressResponse>> addresses() {
        return ApiResponse.ok(service.listAddresses(CurrentUser.customerId()));
    }

    @PostMapping("/addresses")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add an address")
    public ApiResponse<AddressResponse> addAddress(@Valid @RequestBody AddressRequest request) {
        return ApiResponse.ok(service.addAddress(CurrentUser.customerId(), request));
    }

    @PatchMapping("/addresses/{addressId}")
    @Operation(summary = "Update an address")
    public ApiResponse<AddressResponse> updateAddress(@PathVariable UUID addressId, @Valid @RequestBody AddressRequest request) {
        return ApiResponse.ok(service.updateAddress(CurrentUser.customerId(), addressId, request));
    }

    @DeleteMapping("/addresses/{addressId}")
    @Operation(summary = "Remove an address")
    public ApiResponse<Void> removeAddress(@PathVariable UUID addressId) {
        service.removeAddress(CurrentUser.customerId(), addressId);
        return ApiResponse.ok(null);
    }

    @GetMapping("/outstanding")
    @Operation(summary = "My outstanding and credit balance")
    public ApiResponse<CreditService.Outstanding> outstanding() {
        return ApiResponse.ok(creditService.outstanding(CurrentUser.customerId()));
    }

    @GetMapping("/ledger")
    @Operation(summary = "My account statement")
    public ApiResponse<List<LedgerEntryResponse>> ledger(@RequestParam(required = false) Integer page,
                                                         @RequestParam(required = false) Integer pageSize) {
        var pageable = PageQuery.of(page, pageSize, null, java.util.Map.of(), Sort.by("createdAt", "id"));
        return ApiResponse.page(service.ledger(CurrentUser.customerId(), pageable), LedgerEntryResponse::of);
    }
}
