package com.shopflow.suppliers;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.suppliers.SupplierDtos.SupplierLedgerResponse;
import com.shopflow.suppliers.SupplierDtos.SupplierRequest;
import com.shopflow.suppliers.SupplierDtos.SupplierResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
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

@RestController
@RequestMapping("/api/v1/suppliers")
@Tag(name = "Suppliers", description = "Supplier master data and supplier ledger")
@SecurityRequirement(name = "bearerAuth")
public class SupplierController {

    private final SupplierService service;

    public SupplierController(SupplierService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('SUPPLIER_READ')")
    @Operation(summary = "Search suppliers", description = "Sort: name, supplierCode, createdAt.")
    public ApiResponse<List<SupplierResponse>> list(@RequestParam(required = false) String q,
                                                    @RequestParam(required = false) Boolean active,
                                                    @RequestParam(required = false) Integer page,
                                                    @RequestParam(required = false) Integer pageSize,
                                                    @RequestParam(required = false) String sort) {
        var pageable = PageQuery.of(page, pageSize, sort, PageQuery.fields("name", "supplierCode", "createdAt"), Sort.by("name"));
        return ApiResponse.page(service.search(q, active, pageable), service::toResponse);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('SUPPLIER_READ')")
    @Operation(summary = "Get a supplier")
    public ApiResponse<SupplierResponse> get(@PathVariable UUID id) {
        return ApiResponse.ok(service.toResponse(service.get(id)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('SUPPLIER_WRITE')")
    @Operation(summary = "Create a supplier", description = "Supplier code is generated.")
    public ApiResponse<SupplierResponse> create(@Valid @RequestBody SupplierRequest request) {
        return ApiResponse.ok(service.toResponse(service.create(request)), "Supplier created");
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAuthority('SUPPLIER_WRITE')")
    @Operation(summary = "Update a supplier", description = "Set active=false to deactivate.")
    public ApiResponse<SupplierResponse> update(@PathVariable UUID id, @Valid @RequestBody SupplierRequest request) {
        return ApiResponse.ok(service.toResponse(service.update(id, request)));
    }

    @GetMapping("/{id}/ledger")
    @PreAuthorize("hasAuthority('SUPPLIER_READ')")
    @Operation(summary = "Supplier ledger", description = "Purchases (credit), payments and returns (debit) with running balance owed to the supplier.")
    public ApiResponse<List<SupplierLedgerResponse>> ledger(@PathVariable UUID id,
                                                            @RequestParam(required = false) Integer page,
                                                            @RequestParam(required = false) Integer pageSize) {
        service.get(id);
        var pageable = PageQuery.of(page, pageSize, null, java.util.Map.of(), Sort.by("createdAt", "id"));
        return ApiResponse.page(service.ledger(id, pageable), SupplierLedgerResponse::of);
    }
}
