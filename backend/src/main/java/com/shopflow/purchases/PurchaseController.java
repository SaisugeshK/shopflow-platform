package com.shopflow.purchases;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.common.web.ReadTx;
import com.shopflow.purchases.PurchaseDtos.CancelRequest;
import com.shopflow.purchases.PurchaseDtos.CreatePurchaseRequest;
import com.shopflow.purchases.PurchaseDtos.CreatePurchaseReturnRequest;
import com.shopflow.purchases.PurchaseDtos.PurchaseItemResponse;
import com.shopflow.purchases.PurchaseDtos.PurchasePaymentRequest;
import com.shopflow.purchases.PurchaseDtos.PurchasePaymentResponse;
import com.shopflow.purchases.PurchaseDtos.PurchaseResponse;
import com.shopflow.purchases.PurchaseDtos.PurchaseReturnItemResponse;
import com.shopflow.purchases.PurchaseDtos.PurchaseReturnResponse;
import com.shopflow.suppliers.Supplier;
import com.shopflow.suppliers.SupplierService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
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

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Purchases", description = "Purchases, supplier payments and purchase returns")
@SecurityRequirement(name = "bearerAuth")
public class PurchaseController {

    private final PurchaseService service;
    private final SupplierService suppliers;
    private final ReadTx readTx;

    public PurchaseController(PurchaseService service, SupplierService suppliers, ReadTx readTx) {
        this.readTx = readTx;
        this.service = service;
        this.suppliers = suppliers;
    }

    @GetMapping("/purchases")
    @PreAuthorize("hasAuthority('PURCHASE_READ')")
    @Operation(summary = "Search purchases", description = "Filter by text (purchase/supplier invoice number), supplier, status and date range. Sort: purchaseDate, purchaseNumber, grandTotal.")
    public ApiResponse<List<PurchaseResponse>> list(@RequestParam(required = false) String q,
                                                    @RequestParam(required = false) UUID supplierId,
                                                    @RequestParam(required = false) Purchase.Status status,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                    @RequestParam(required = false) Integer page,
                                                    @RequestParam(required = false) Integer pageSize,
                                                    @RequestParam(required = false) String sort) {
        var pageable = PageQuery.of(page, pageSize, sort, PageQuery.fields("purchaseDate", "purchaseNumber", "grandTotal", "createdAt"),
                Sort.by(Sort.Direction.DESC, "purchaseDate", "createdAt"));
        return readTx.call(() -> ApiResponse.page(service.search(q, supplierId, status, from, to, pageable), p -> toResponse(p, false)));
    }

    @GetMapping("/purchases/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_READ')")
    @Operation(summary = "Get a purchase with items and payments")
    public ApiResponse<PurchaseResponse> get(@PathVariable UUID id) {
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true)));
    }

    @PostMapping("/purchases")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Create a purchase", description = "Totals and GST are calculated by the backend. Set post=true to post immediately (stock IN + supplier ledger).")
    public ApiResponse<PurchaseResponse> create(@Valid @RequestBody CreatePurchaseRequest request) {
        UUID id = service.create(request).getId();
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true), "Purchase created"));
    }

    @PostMapping("/purchases/{id}/post")
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Post a draft purchase", description = "Stock IN for every line and supplier ledger credit, atomically. Idempotent. Errors: PURCHASE_INVALID_STATUS.")
    public ApiResponse<PurchaseResponse> post(@PathVariable UUID id) {
        service.post(id);
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true)));
    }

    @PostMapping("/purchases/{id}/cancel")
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Cancel a draft purchase", description = "Posted purchases cannot be cancelled; use a purchase return. Errors: PURCHASE_INVALID_STATUS.")
    public ApiResponse<PurchaseResponse> cancel(@PathVariable UUID id, @Valid @RequestBody CancelRequest request) {
        service.cancel(id, request.reason());
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true)));
    }

    @PostMapping("/purchases/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Record a payment to the supplier", description = "Debits the supplier ledger. Cannot exceed the balance due.")
    public ApiResponse<PurchaseResponse> pay(@PathVariable UUID id, @Valid @RequestBody PurchasePaymentRequest request) {
        service.recordPayment(id, request);
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true)));
    }

    @GetMapping("/purchase-returns")
    @PreAuthorize("hasAuthority('PURCHASE_READ')")
    @Operation(summary = "List purchase returns")
    public ApiResponse<List<PurchaseReturnResponse>> listReturns(@RequestParam(required = false) UUID supplierId,
                                                                 @RequestParam(required = false) PurchaseReturn.Status status,
                                                                 @RequestParam(required = false) Integer page,
                                                                 @RequestParam(required = false) Integer pageSize) {
        var pageable = PageQuery.of(page, pageSize, null, java.util.Map.of(), Sort.by(Sort.Direction.DESC, "createdAt"));
        return readTx.call(() -> ApiResponse.page(service.searchReturns(supplierId, status, pageable), this::toReturnResponse));
    }

    @GetMapping("/purchase-returns/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_READ')")
    @Operation(summary = "Get a purchase return")
    public ApiResponse<PurchaseReturnResponse> getReturn(@PathVariable UUID id) {
        return readTx.call(() -> ApiResponse.ok(toReturnResponse(service.getReturn(id))));
    }

    @PostMapping("/purchase-returns")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Create a purchase return", description = "Quantities cannot exceed what remains unreturned. Set post=true to post immediately. Errors: RETURN_INVALID_QUANTITY.")
    public ApiResponse<PurchaseReturnResponse> createReturn(@Valid @RequestBody CreatePurchaseReturnRequest request) {
        UUID id = service.createReturn(request).getId();
        return readTx.call(() -> ApiResponse.ok(toReturnResponse(service.getReturn(id)), "Purchase return created"));
    }

    @PostMapping("/purchase-returns/{id}/post")
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Post a purchase return", description = "Stock OUT and supplier ledger debit, atomically. Idempotent.")
    public ApiResponse<PurchaseReturnResponse> postReturn(@PathVariable UUID id) {
        service.postReturn(id);
        return readTx.call(() -> ApiResponse.ok(toReturnResponse(service.getReturn(id))));
    }

    private PurchaseResponse toResponse(Purchase p, boolean withDetail) {
        String supplierName = suppliers.get(p.getSupplierId()).getName();
        List<PurchaseItemResponse> items = withDetail ? p.getItems().stream().map(i -> new PurchaseItemResponse(i.getId(),
                i.getLineNumber(), i.getProductId(), i.getProductName(), i.getHsnCode(), i.getUnit(), i.getQuantity(),
                i.getRate(), i.getDiscountPercent(), i.getDiscountAmount(), i.getTaxRate(), i.getTaxableAmount(),
                i.getCgstAmount(), i.getSgstAmount(), i.getIgstAmount(), i.getLineTotal(), i.getReturnedQuantity())).toList() : null;
        List<PurchasePaymentResponse> pays = withDetail ? service.paymentsFor(p.getId()).stream()
                .map(x -> new PurchasePaymentResponse(x.getId(), x.getPaymentNumber(), x.getAmount(), x.getMethod(),
                        x.getReferenceNumber(), x.getPaidAt(), x.getNotes())).toList() : null;
        return new PurchaseResponse(p.getId(), p.getPurchaseNumber(), p.getPurchaseDate(), p.getSupplierId(), supplierName,
                p.getSupplierInvoiceNumber(), p.getSupplierInvoiceDate(), p.getStatus().name(), p.getPaymentStatus().name(),
                p.isInterState(), p.getSubtotal(), p.getDiscountTotal(), p.getTaxableTotal(), p.getCgstTotal(),
                p.getSgstTotal(), p.getIgstTotal(), p.getRoundOff(), p.getGrandTotal(), p.getPaidAmount(),
                p.getStatus() == Purchase.Status.POSTED ? p.getGrandTotal().subtract(p.getPaidAmount()) : null,
                p.getNotes(), p.getPostedAt(), p.getCancelReason(), items, pays, p.getCreatedAt());
    }

    private PurchaseReturnResponse toReturnResponse(PurchaseReturn r) {
        Supplier supplier = suppliers.get(r.getSupplierId());
        Purchase purchase = service.get(r.getPurchaseId());
        return new PurchaseReturnResponse(r.getId(), r.getReturnNumber(), r.getPurchaseId(), purchase.getPurchaseNumber(),
                r.getSupplierId(), supplier.getName(), r.getReturnDate(), r.getStatus().name(), r.getReason(),
                r.getTaxableTotal(), r.getCgstTotal().add(r.getSgstTotal()).add(r.getIgstTotal()), r.getRoundOff(),
                r.getGrandTotal(), r.getPostedAt(),
                r.getItems().stream().map(i -> new PurchaseReturnItemResponse(i.getId(), i.getPurchaseItemId(), i.getProductId(),
                        i.getProductName(), i.getQuantity(), i.getRate(), i.getTaxRate(), i.getTaxableAmount(),
                        i.getCgstAmount().add(i.getSgstAmount()).add(i.getIgstAmount()), i.getLineTotal())).toList(),
                r.getCreatedAt());
    }
}
