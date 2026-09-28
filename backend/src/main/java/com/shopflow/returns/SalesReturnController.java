package com.shopflow.returns;

import com.shopflow.billing.BillingRepositories.CreditNoteRepository;
import com.shopflow.billing.BillingRepositories.InvoiceRepository;
import com.shopflow.billing.CreditNote;
import com.shopflow.billing.Invoice;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.common.web.ReadTx;
import com.shopflow.customers.CustomerService;
import com.shopflow.returns.SalesReturnDtos.CreateSalesReturnRequest;
import com.shopflow.returns.SalesReturnDtos.ReviewRequest;
import com.shopflow.returns.SalesReturnDtos.SalesReturnItemResponse;
import com.shopflow.returns.SalesReturnDtos.SalesReturnResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
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
@RequestMapping("/api/v1/sales-returns")
@Tag(name = "Sales Returns", description = "Customer return requests, review and credit notes")
@SecurityRequirement(name = "bearerAuth")
public class SalesReturnController {

    private final SalesReturnService service;
    private final InvoiceRepository invoices;
    private final CreditNoteRepository creditNotes;
    private final CustomerService customers;
    private final ReadTx readTx;

    public SalesReturnController(SalesReturnService service, InvoiceRepository invoices, CreditNoteRepository creditNotes,
                                 CustomerService customers, ReadTx readTx) {
        this.service = service;
        this.invoices = invoices;
        this.creditNotes = creditNotes;
        this.customers = customers;
        this.readTx = readTx;
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('RETURN_READ','CUSTOMER_SELF')")
    @Operation(summary = "List sales returns", description = "Customers see only their own.")
    public ApiResponse<List<SalesReturnResponse>> list(@RequestParam(required = false) UUID customerId,
                                                       @RequestParam(required = false) SalesReturn.Status status,
                                                       @RequestParam(required = false) Integer page,
                                                       @RequestParam(required = false) Integer pageSize) {
        var pageable = PageQuery.of(page, pageSize, null, java.util.Map.of(), Sort.by(Sort.Direction.DESC, "createdAt"));
        return readTx.call(() -> ApiResponse.page(service.search(customerId, status, pageable), this::toResponse));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('RETURN_READ','CUSTOMER_SELF')")
    @Operation(summary = "Get a sales return")
    public ApiResponse<SalesReturnResponse> get(@PathVariable UUID id) {
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id))));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('RETURN_WRITE','CUSTOMER_SELF')")
    @Operation(summary = "Request a return", description = "Against a generated invoice of a delivered order. Quantities cannot exceed what is still returnable. Errors: RETURN_INVALID_QUANTITY, RETURN_INVALID_STATUS.")
    public ApiResponse<SalesReturnResponse> create(@Valid @RequestBody CreateSalesReturnRequest request) {
        UUID id = service.create(request).getId();
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id)), "Return requested"));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('RETURN_WRITE')")
    @Operation(summary = "Approve a return", description = "Stock IN, SALES_RETURN credit note and customer ledger credit, atomically.")
    public ApiResponse<SalesReturnResponse> approve(@PathVariable UUID id, @Valid @RequestBody(required = false) ReviewRequest request) {
        service.approve(id, request == null ? null : request.note());
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id))));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('RETURN_WRITE')")
    @Operation(summary = "Reject a return")
    public ApiResponse<SalesReturnResponse> reject(@PathVariable UUID id, @Valid @RequestBody(required = false) ReviewRequest request) {
        service.reject(id, request == null ? null : request.note());
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id))));
    }

    private SalesReturnResponse toResponse(SalesReturn r) {
        String invoiceNumber = invoices.findById(r.getInvoiceId()).map(Invoice::getInvoiceNumber).orElse(null);
        CreditNote note = r.getCreditNoteId() == null ? null : creditNotes.findById(r.getCreditNoteId()).orElse(null);
        return new SalesReturnResponse(r.getId(), r.getReturnNumber(), r.getInvoiceId(), invoiceNumber, r.getOrderId(),
                r.getCustomerId(), customers.get(r.getCustomerId()).getShopName(), r.getStatus().name(), r.getReason(),
                r.getReviewNote(), r.getRequestedAt(), r.getReviewedAt(), r.getCreditNoteId(),
                note == null ? null : note.getCreditNoteNumber(), note == null ? null : note.getGrandTotal(),
                r.getItems().stream().map(i -> new SalesReturnItemResponse(i.getId(), i.getInvoiceItemId(), i.getProductId(),
                        i.getProductName(), i.getQuantity(), i.getReason())).toList());
    }
}
