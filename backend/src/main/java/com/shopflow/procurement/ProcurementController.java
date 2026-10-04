package com.shopflow.procurement;

import com.shopflow.business.BusinessContext;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.files.FileService;
import com.shopflow.files.StoredFile;
import com.shopflow.procurement.ProcurementDtos.AcceptRequest;
import com.shopflow.procurement.ProcurementDtos.AttachmentResponse;
import com.shopflow.procurement.ProcurementDtos.CounterRequest;
import com.shopflow.procurement.ProcurementDtos.CreatePoRequest;
import com.shopflow.procurement.ProcurementDtos.CreateReceiptRequest;
import com.shopflow.procurement.ProcurementDtos.PoLineResponse;
import com.shopflow.procurement.ProcurementDtos.PoResponse;
import com.shopflow.procurement.ProcurementDtos.PortalAccessResponse;
import com.shopflow.procurement.ProcurementDtos.PortalInviteRequest;
import com.shopflow.procurement.ProcurementDtos.QuoteRequest;
import com.shopflow.procurement.ProcurementDtos.ReasonRequest;
import com.shopflow.procurement.ProcurementDtos.ReceiptResponse;
import com.shopflow.products.Product;
import com.shopflow.products.ProductService;
import com.shopflow.suppliers.Supplier;
import com.shopflow.suppliers.SupplierService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Purchase orders (§0B.8): business side under /purchase-orders (PURCHASE_ORDERS module), supplier side under
 * /supplier-portal (SUPPLIER_PORTAL module, SUPPLIER role, own orders only), and supplier portal invitations.
 */
@RestController
@RequestMapping("/api/v1")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Purchase orders & supplier portal", description = "POs with quotation rounds, goods receipts and the supplier portal")
public class ProcurementController {

    private final ProcurementService service;
    private final SupplierPortalAccess portalAccess;
    private final SupplierService suppliers;
    private final ProductService products;
    private final FileService files;
    private final BusinessContext businessContext;
    private final TransactionTemplate readTx;

    public ProcurementController(ProcurementService service, SupplierPortalAccess portalAccess, SupplierService suppliers,
                                 ProductService products, FileService files, BusinessContext businessContext,
                                 PlatformTransactionManager txManager) {
        this.service = service;
        this.portalAccess = portalAccess;
        this.suppliers = suppliers;
        this.products = products;
        this.files = files;
        this.businessContext = businessContext;
        this.readTx = new TransactionTemplate(txManager);
        this.readTx.setReadOnly(true);
    }

    // ---------------------------------------------------------------- business side

    @GetMapping("/purchase-orders")
    @PreAuthorize("hasAuthority('PURCHASE_READ')")
    @Operation(summary = "Search purchase orders", description = "Filter by PO number, status and supplier; newest first.")
    public ApiResponse<List<PoResponse>> list(@RequestParam(required = false) String q, @RequestParam(required = false) PurchaseOrder.Status status,
                                              @RequestParam(required = false) UUID supplierId, @RequestParam(required = false) Integer page,
                                              @RequestParam(required = false) Integer pageSize) {
        var pageable = PageQuery.of(page, pageSize, null, Map.of(), Sort.by(Sort.Direction.DESC, "createdAt"));
        return readTx.execute(s -> {
            Page<PurchaseOrder> result = service.search(q, status, supplierId, false, pageable);
            return ApiResponse.page(result, po -> toResponse(po, false));
        });
    }

    @PostMapping("/purchase-orders")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Create a purchase order", description = "Starts as DRAFT; send=true sends it to the supplier at once.")
    public ApiResponse<PoResponse> create(@Valid @RequestBody CreatePoRequest request) {
        UUID id = service.create(request).getId();
        return ApiResponse.ok(detail(id), "Purchase order created");
    }

    @GetMapping("/purchase-orders/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_READ')")
    @Operation(summary = "Purchase order with lines, every revision, attachments and goods receipts")
    public ApiResponse<PoResponse> get(@PathVariable UUID id) {
        service.get(id);
        return ApiResponse.ok(detail(id));
    }

    @PostMapping("/purchase-orders/{id}/send")
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Send a draft to the supplier")
    public ApiResponse<PoResponse> send(@PathVariable UUID id) {
        service.send(id, null);
        return ApiResponse.ok(detail(id), "Sent to supplier");
    }

    @PutMapping("/purchase-orders/{id}/counter")
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Counter-offer (or edit a draft)", description = "Change rate, quantity, discount, tax, delivery date or notes of open lines.")
    public ApiResponse<PoResponse> counter(@PathVariable UUID id, @Valid @RequestBody CounterRequest request) {
        service.counter(id, request);
        return ApiResponse.ok(detail(id));
    }

    @PostMapping("/purchase-orders/{id}/accept")
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Accept the quotation", description = "All open lines or the selected lineIds; supplier extra lines need productLinks {lineId: productId}. "
            + "Accepted lines lock; the rest are rejected.")
    public ApiResponse<PoResponse> accept(@PathVariable UUID id, @Valid @RequestBody(required = false) AcceptRequest request) {
        service.accept(id, request);
        return ApiResponse.ok(detail(id), "Quotation accepted");
    }

    @PostMapping("/purchase-orders/{id}/reject")
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Reject the quotation / negotiation")
    public ApiResponse<PoResponse> reject(@PathVariable UUID id, @Valid @RequestBody ReasonRequest request) {
        service.reject(id, request.reason());
        return ApiResponse.ok(detail(id));
    }

    @PostMapping("/purchase-orders/{id}/cancel")
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Cancel a purchase order (before anything is received)")
    public ApiResponse<PoResponse> cancel(@PathVariable UUID id, @Valid @RequestBody ReasonRequest request) {
        service.cancel(id, request.reason());
        return ApiResponse.ok(detail(id));
    }

    @PostMapping("/purchase-orders/{id}/close")
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Close an accepted or partly received order")
    public ApiResponse<PoResponse> close(@PathVariable UUID id) {
        service.close(id, null);
        return ApiResponse.ok(detail(id));
    }

    @PostMapping("/purchase-orders/{id}/receipts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Record a goods receipt (GRN)", description = "Received and damaged quantities per accepted line; the good quantity is posted as a "
            + "purchase (stock in + supplier ledger). Rate/quantity differences are flagged.")
    public ApiResponse<PoResponse> receive(@PathVariable UUID id, @Valid @RequestBody CreateReceiptRequest request) {
        service.receive(id, request);
        return ApiResponse.ok(detail(id), "Goods received");
    }

    @PostMapping(path = "/purchase-orders/{id}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PURCHASE_WRITE')")
    @Operation(summary = "Attach a PDF or image to a purchase order")
    public ApiResponse<AttachmentResponse> attach(@PathVariable UUID id, @RequestPart("file") MultipartFile file) {
        service.get(id);
        return ApiResponse.ok(service.attach(id, file, ProcurementService.Actor.BUSINESS));
    }

    @GetMapping("/purchase-orders/{id}/attachments/{attachmentId}")
    @PreAuthorize("hasAuthority('PURCHASE_READ')")
    @Operation(summary = "Download an attachment")
    public ResponseEntity<byte[]> attachment(@PathVariable UUID id, @PathVariable UUID attachmentId) {
        return download(service.attachmentFile(id, attachmentId));
    }

    @GetMapping("/goods-receipts")
    @PreAuthorize("hasAuthority('PURCHASE_READ')")
    @Operation(summary = "Goods receipts (latest 200)")
    public ApiResponse<List<ReceiptResponse>> receipts(@RequestParam(required = false) UUID purchaseOrderId) {
        return ApiResponse.ok(service.receipts(purchaseOrderId, null));
    }

    // ---------------------------------------------------------------- supplier portal invitations

    @GetMapping("/suppliers/{id}/portal-access")
    @PreAuthorize("hasAuthority('SUPPLIER_READ')")
    @Operation(summary = "Supplier portal login status")
    public ApiResponse<PortalAccessResponse> portalStatus(@PathVariable UUID id) {
        return ApiResponse.ok(portalAccess.status(id));
    }

    @PostMapping("/suppliers/{id}/portal-access")
    @PreAuthorize("hasAuthority('SUPPLIER_WRITE')")
    @Operation(summary = "Invite a supplier to the portal", description = "Creates a SUPPLIER login for the mobile number (default: the supplier's). SUPPLIER_PORTAL module.")
    public ApiResponse<PortalAccessResponse> invite(@PathVariable UUID id, @Valid @RequestBody(required = false) PortalInviteRequest request) {
        return ApiResponse.ok(portalAccess.enable(id, request == null ? null : request.mobileNumber(), request == null ? null : request.contactName()),
                "Supplier can now sign in");
    }

    @DeleteMapping("/suppliers/{id}/portal-access")
    @PreAuthorize("hasAuthority('SUPPLIER_WRITE')")
    @Operation(summary = "Turn off a supplier's portal login")
    public ApiResponse<PortalAccessResponse> revoke(@PathVariable UUID id) {
        return ApiResponse.ok(portalAccess.disable(id));
    }

    // ---------------------------------------------------------------- supplier side

    @GetMapping("/supplier-portal/purchase-orders")
    @PreAuthorize("hasAuthority('SUPPLIER_SELF')")
    @Operation(summary = "My purchase orders (supplier)", description = "Orders addressed to the signed-in supplier; never drafts.")
    public ApiResponse<List<PoResponse>> portalList(@RequestParam(required = false) PurchaseOrder.Status status,
                                                    @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        UUID supplierId = service.currentSupplier().getId();
        var pageable = PageQuery.of(page, pageSize, null, Map.of(), Sort.by(Sort.Direction.DESC, "createdAt"));
        return readTx.execute(s -> ApiResponse.page(service.search(null, status, supplierId, true, pageable), po -> toResponse(po, false)));
    }

    @GetMapping("/supplier-portal/purchase-orders/{id}")
    @PreAuthorize("hasAuthority('SUPPLIER_SELF')")
    @Operation(summary = "A purchase order with its rounds (supplier)")
    public ApiResponse<PoResponse> portalGet(@PathVariable UUID id) {
        service.portalGet(id);
        return ApiResponse.ok(detail(id));
    }

    @PutMapping("/supplier-portal/purchase-orders/{id}/quote")
    @PreAuthorize("hasAuthority('SUPPLIER_SELF')")
    @Operation(summary = "Send a quotation", description = "Change rate, quantity, availability, delivery dates, notes and substitutes of any line, add lines, "
            + "set quote validity. Allowed while the order waits for a quotation (SENT or COUNTERED).")
    public ApiResponse<PoResponse> quote(@PathVariable UUID id, @Valid @RequestBody QuoteRequest request) {
        service.quote(id, request);
        return ApiResponse.ok(detail(id), "Quotation sent");
    }

    @PostMapping("/supplier-portal/purchase-orders/{id}/decline")
    @PreAuthorize("hasAuthority('SUPPLIER_SELF')")
    @Operation(summary = "Decline a purchase order")
    public ApiResponse<PoResponse> decline(@PathVariable UUID id, @Valid @RequestBody ReasonRequest request) {
        service.decline(id, request.reason());
        return ApiResponse.ok(detail(id));
    }

    @PostMapping(path = "/supplier-portal/purchase-orders/{id}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('SUPPLIER_SELF')")
    @Operation(summary = "Attach a quotation or invoice (supplier)")
    public ApiResponse<AttachmentResponse> portalAttach(@PathVariable UUID id, @RequestPart("file") MultipartFile file) {
        service.portalGet(id);
        return ApiResponse.ok(service.attach(id, file, ProcurementService.Actor.SUPPLIER));
    }

    @GetMapping("/supplier-portal/purchase-orders/{id}/attachments/{attachmentId}")
    @PreAuthorize("hasAuthority('SUPPLIER_SELF')")
    @Operation(summary = "Download an attachment (supplier)")
    public ResponseEntity<byte[]> portalAttachment(@PathVariable UUID id, @PathVariable UUID attachmentId) {
        service.portalGet(id);
        return download(service.attachmentFile(id, attachmentId));
    }

    @GetMapping("/supplier-portal/deliveries")
    @PreAuthorize("hasAuthority('SUPPLIER_SELF')")
    @Operation(summary = "My deliveries: goods receipts the business recorded")
    public ApiResponse<List<ReceiptResponse>> deliveries() {
        return ApiResponse.ok(service.receipts(null, service.currentSupplier().getId()));
    }

    // ---------------------------------------------------------------- mapping

    private PoResponse detail(UUID id) {
        return readTx.execute(s -> toResponse(service.get(id), true));
    }

    private PoResponse toResponse(PurchaseOrder po, boolean detail) {
        Supplier supplier = suppliers.get(po.getSupplierId());
        Map<UUID, Product> productMap = detail ? products.getAll(po.getLines().stream().map(PurchaseOrderLine::getProductId)
                .filter(java.util.Objects::nonNull).distinct().toList()).stream().collect(Collectors.toMap(Product::getId, Function.identity())) : Map.of();
        List<PoLineResponse> lines = detail ? po.getLines().stream().map(l -> {
            Product p = l.getProductId() == null ? null : productMap.get(l.getProductId());
            return new PoLineResponse(l.getId(), l.getLineNumber(), l.getProductId(), l.getDescription(), p == null ? null : p.getSku(),
                    l.getHsnCode(), l.getUnit(), l.getUnitFactor(), l.getQuantity(), l.getRate(), l.getDiscountPercent(), l.getTaxRate(),
                    l.getTaxableAmount(), l.getTaxAmount(), l.getLineTotal(), l.getAvailability().name(), l.getDeliveryDate(), l.getLineNote(),
                    l.getSubstituteNote(), l.getAddedBy(), l.getStatus().name(), l.getReceivedQuantity(), l.pendingQuantity(),
                    p != null && p.isTrackBatches(), p != null && p.isTrackSerials());
        }).toList() : null;
        return new PoResponse(po.getId(), po.getPoNumber(), po.getSupplierId(), supplier.getName(), supplier.getSupplierCode(),
                supplier.getUserId() != null, po.getStatus().name(), po.getOrderDate(), po.getExpectedDate(), po.getQuoteValidUntil(),
                po.getNotes(), po.getSupplierNote(), po.isInterState(), po.getRevision(), po.getSubtotal(), po.getTaxableTotal(),
                po.getTaxTotal(), po.getGrandTotal(), po.getSentAt(), po.getQuotedAt(), po.getAcceptedAt(), po.getClosedAt(),
                po.getCancelReason(), po.getCreatedAt(), po.getUpdatedAt(), lines,
                detail ? service.revisions(po.getId()) : null, detail ? service.attachments(po.getId()) : null,
                detail ? service.receipts(po.getId(), null) : null, businessContext.displayName());
    }

    private ResponseEntity<byte[]> download(StoredFile f) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(f.getOriginalName() == null ? "attachment" : f.getOriginalName()).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .header("X-Content-Type-Options", "nosniff")
                .body(files.read(f));
    }
}
