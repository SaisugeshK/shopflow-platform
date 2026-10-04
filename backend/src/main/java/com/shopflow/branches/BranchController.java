package com.shopflow.branches;

import com.shopflow.branches.BranchService.BranchRequest;
import com.shopflow.branches.BranchService.BranchResponse;
import com.shopflow.branches.BranchService.BranchStockRow;
import com.shopflow.branches.BranchService.TransferRequest;
import com.shopflow.branches.BranchService.TransferResponse;
import com.shopflow.common.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Branches / warehouses and stock transfers (§0B.14, BRANCHES module). Staff choose their working branch in the app;
 * the clients send it as the {@code X-Branch-Id} header and every stock movement happens at that branch.
 */
@RestController
@RequestMapping("/api/v1")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Branches", description = "Branches / warehouses, stock per branch and stock transfers")
public class BranchController {

    private final BranchService service;

    public BranchController(BranchService service) {
        this.service = service;
    }

    @GetMapping("/branches")
    @PreAuthorize("hasAnyAuthority('STOCK_READ','DASHBOARD_VIEW','ORDER_READ','INVOICE_READ')")
    @Operation(summary = "List branches", description = "The main branch is listed first and created on first use.")
    public ApiResponse<List<BranchResponse>> list() {
        return ApiResponse.ok(service.list());
    }

    @PostMapping("/branches")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Add a branch or warehouse", description = "Errors: PLAN_LIMIT_REACHED.")
    public ApiResponse<BranchResponse> create(@Valid @RequestBody BranchRequest request) {
        return ApiResponse.ok(service.create(request));
    }

    @PutMapping("/branches/{id}")
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "Update or close a branch")
    public ApiResponse<BranchResponse> update(@PathVariable UUID id, @Valid @RequestBody BranchRequest request) {
        return ApiResponse.ok(service.update(id, request));
    }

    @GetMapping("/branches/{id}/stock")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "Stock at a branch")
    public ApiResponse<List<BranchStockRow>> stock(@PathVariable UUID id, @RequestParam(required = false) String q) {
        return ApiResponse.ok(service.stock(id, q));
    }

    @GetMapping("/stock-transfers")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "Stock transfers")
    public ApiResponse<List<TransferResponse>> transfers() {
        return ApiResponse.ok(service.transfers());
    }

    @GetMapping("/stock-transfers/{id}")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "Stock transfer detail")
    public ApiResponse<TransferResponse> transfer(@PathVariable UUID id) {
        return ApiResponse.ok(service.transfer(id));
    }

    @PostMapping("/stock-transfers")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('STOCK_WRITE')")
    @Operation(summary = "Move stock between branches")
    public ApiResponse<TransferResponse> createTransfer(@Valid @RequestBody TransferRequest request) {
        return ApiResponse.ok(service.transfer(request));
    }
}
