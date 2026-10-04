package com.shopflow.billing;

import com.shopflow.billing.InvoiceDtos.CancelInvoiceRequest;
import com.shopflow.billing.InvoiceDtos.CreateCreditNoteRequest;
import com.shopflow.billing.InvoiceDtos.CreateInvoiceRequest;
import com.shopflow.billing.InvoiceDtos.CreditNoteResponse;
import com.shopflow.billing.InvoiceDtos.InvoiceItemResponse;
import com.shopflow.billing.InvoiceDtos.InvoiceResponse;
import com.shopflow.billing.InvoiceDtos.PartyResponse;
import com.shopflow.billing.InvoiceDtos.TaxSummaryResponse;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.common.web.ReadTx;
import com.shopflow.notifications.WhatsAppMessage;
import com.shopflow.notifications.WhatsAppService;
import com.shopflow.orders.OrderRepositories.OrderRepository;
import com.shopflow.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/invoices")
@Tag(name = "Invoices", description = "Order-based and admin-created tax invoices, PDF, WhatsApp delivery and credit notes")
@SecurityRequirement(name = "bearerAuth")
public class InvoiceController {

    private static final String READ = "hasAnyAuthority('INVOICE_READ','CUSTOMER_SELF')";

    private final InvoiceService service;
    private final InvoiceDocumentService documents;
    private final CreditNoteService creditNotes;
    private final WhatsAppService whatsApp;
    private final OrderRepository orders;
    private final BusinessContext businessContext;
    private final ReadTx readTx;

    public InvoiceController(InvoiceService service, InvoiceDocumentService documents, CreditNoteService creditNotes,
                             WhatsAppService whatsApp, OrderRepository orders, BusinessContext businessContext, ReadTx readTx) {
        this.service = service;
        this.documents = documents;
        this.creditNotes = creditNotes;
        this.whatsApp = whatsApp;
        this.orders = orders;
        this.businessContext = businessContext;
        this.readTx = readTx;
    }

    @GetMapping
    @PreAuthorize(READ)
    @Operation(summary = "List invoices", description = "Customers see only their own generated invoices. Filter by status, source, customer, overdue and date range. Sort: invoiceDate, invoiceNumber, grandTotal.")
    public ApiResponse<List<InvoiceResponse>> list(@RequestParam(required = false) String q,
                                                   @RequestParam(required = false) UUID customerId,
                                                   @RequestParam(required = false) InvoiceStatus status,
                                                   @RequestParam(required = false) Invoice.Source source,
                                                   @RequestParam(required = false) Boolean overdue,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                   @RequestParam(required = false) Integer page,
                                                   @RequestParam(required = false) Integer pageSize,
                                                   @RequestParam(required = false) String sort) {
        var pageable = PageQuery.of(page, pageSize, sort, PageQuery.fields("invoiceDate", "invoiceNumber", "grandTotal", "createdAt"),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        return readTx.call(() -> ApiResponse.page(service.search(q, customerId, status, source, overdue, from, to, pageable), i -> toResponse(i, false)));
    }

    @GetMapping("/{id}")
    @PreAuthorize(READ)
    @Operation(summary = "Get an invoice with lines, tax summary and credit notes")
    public ApiResponse<InvoiceResponse> get(@PathVariable UUID id) {
        return readTx.call(() -> ApiResponse.ok(toResponse(service.getForCurrentUser(id), true)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Create an invoice (draft)", description = "With orderId: bills the order's uninvoiced accepted (or delivered, per settings) quantities. "
            + "Without: an admin-created invoice for customerId with items and paymentType. Set generate=true to generate immediately. "
            + "Errors: ORDER_INVALID_STATUS, NOTHING_TO_INVOICE, PRODUCT_INACTIVE, CUSTOMER_NOT_APPROVED.")
    public ApiResponse<InvoiceResponse> create(@Valid @RequestBody CreateInvoiceRequest request) {
        UUID id = service.create(request).getId();
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true), "Invoice created"));
    }

    @PostMapping("/{id}/generate")
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Generate (post) a draft invoice", description = "Assigns the invoice number, snapshots seller/buyer, posts the customer ledger, applies advances "
            + "and (for admin-created invoices) posts stock OUT — atomically. Idempotent; send Idempotency-Key for safe retries. Errors: CREDIT_LIMIT_EXCEEDED, INSUFFICIENT_STOCK.")
    public ApiResponse<InvoiceResponse> generate(@PathVariable UUID id,
                                                 @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        service.generate(id, idempotencyKey);
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true), "Invoice generated"));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Cancel an invoice", description = "Never deletes. Reverses the ledger, turns allocated payments into customer advances and returns stock for admin-created invoices. Errors: INVOICE_ALREADY_CANCELLED.")
    public ApiResponse<InvoiceResponse> cancel(@PathVariable UUID id, @Valid @RequestBody CancelInvoiceRequest request) {
        service.cancel(id, request.reason().trim());
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true)));
    }

    @GetMapping(value = "/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize(READ)
    @Operation(summary = "Download the invoice PDF", description = "A4, print-ready. Generated invoices return the stored, immutable PDF.")
    public ResponseEntity<byte[]> pdf(@PathVariable UUID id) {
        Invoice invoice = service.getForCurrentUser(id);
        byte[] pdf = documents.storedPdf(invoice);
        String name = (invoice.getInvoiceNumber() == null ? "draft-invoice" : invoice.getInvoiceNumber().replace('/', '-')) + ".pdf";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(name).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(pdf);
    }

    @PostMapping("/{id}/send-whatsapp")
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Send the invoice on WhatsApp", description = "Queues delivery of the PDF to the customer's mobile. Delivery is asynchronous and retried; "
            + "status is tracked per message. Send Idempotency-Key to avoid duplicate sends.")
    public ApiResponse<WhatsAppMessageResponse> sendWhatsApp(@PathVariable UUID id,
                                                             @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ApiResponse.ok(WhatsAppMessageResponse.of(whatsApp.sendInvoice(id, idempotencyKey)), "Invoice queued for WhatsApp delivery");
    }

    @GetMapping("/{id}/whatsapp-messages")
    @PreAuthorize("hasAuthority('INVOICE_READ')")
    @Operation(summary = "WhatsApp delivery history for an invoice")
    public ApiResponse<List<WhatsAppMessageResponse>> whatsAppMessages(@PathVariable UUID id) {
        return ApiResponse.ok(whatsApp.forInvoice(id).stream().map(WhatsAppMessageResponse::of).toList());
    }

    @PostMapping("/whatsapp-messages/{messageId}/retry")
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Retry a failed WhatsApp message")
    public ApiResponse<WhatsAppMessageResponse> retryWhatsApp(@PathVariable UUID messageId) {
        return ApiResponse.ok(WhatsAppMessageResponse.of(whatsApp.retry(messageId)));
    }

    @PostMapping("/{id}/credit-notes")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Issue a credit note", description = "For price adjustments or other corrections. Sales returns create credit notes automatically on approval.")
    public ApiResponse<InvoiceResponse> creditNote(@PathVariable UUID id, @Valid @RequestBody CreateCreditNoteRequest request) {
        creditNotes.createManual(id, request);
        return readTx.call(() -> ApiResponse.ok(toResponse(service.get(id), true)));
    }

    InvoiceResponse toResponse(Invoice i, boolean detail) {
        boolean staff = !CurrentUser.isCustomer();
        PartyResponse seller = new PartyResponse(i.getSellerName(), null, i.getSellerAddress(), null, i.getSellerState(),
                i.getSellerStateCode(), null, i.getSellerPhone(), i.getSellerEmail(), i.getSellerGstin(), i.getSellerPan());
        PartyResponse buyer = new PartyResponse(i.getBuyerName(), i.getBuyerContactName(), i.getBuyerAddress(), i.getBuyerCity(),
                i.getBuyerState(), i.getBuyerStateCode(), i.getBuyerPincode(), i.getBuyerMobile(), i.getBuyerEmail(),
                i.getBuyerGstin(), i.getBuyerPan());
        List<InvoiceItemResponse> items = detail ? i.getItems().stream().map(it -> new InvoiceItemResponse(it.getId(), it.getLineNumber(),
                it.getProductId(), it.getProductName(), it.getDescription(), it.getSku(), it.getHsnCode(), it.getUnit(),
                it.getQuantity(), it.getRate(), it.getDiscountPercent(), it.getDiscountAmount(), it.getTaxRate(),
                it.getTaxableAmount(), it.getCgstAmount(), it.getSgstAmount(), it.getIgstAmount(), it.getLineTotal(),
                it.getReturnedQuantity(), it.getUnitFactor(), it.isFreeItem(), it.getSchemeName(),
                it.getSerialNumbers() == null || it.getSerialNumbers().isBlank() ? List.of() : List.of(it.getSerialNumbers().split(",")),
                it.getBatchDetails())).toList() : null;
        List<InvoiceDtos.ChargeResponse> charges = detail ? i.getCharges().stream().map(c -> new InvoiceDtos.ChargeResponse(c.getId(),
                c.getChargeType().name(), c.displayName(), c.getSacCode(), c.getAmount(), c.getTaxRate(), c.getCgstAmount(),
                c.getSgstAmount(), c.getIgstAmount(), c.getTotal())).toList() : null;
        List<TaxSummaryResponse> taxes = detail ? i.getTaxSummaries().stream().map(t -> new TaxSummaryResponse(t.getHsnCode(),
                t.getTaxRate(), t.getTaxableAmount(), t.getCgstAmount(), t.getSgstAmount(), t.getIgstAmount(), t.getTotalTax())).toList() : null;
        List<CreditNoteResponse> notes = detail ? creditNotes.forInvoice(i.getId()).stream().map(n -> new CreditNoteResponse(n.getId(),
                n.getCreditNoteNumber(), n.getNoteDate(), n.getReasonType().name(), n.getReason(), n.getTaxableTotal(),
                n.getCgstTotal().add(n.getSgstTotal()).add(n.getIgstTotal()), n.getGrandTotal())).toList() : null;
        String orderNumber = i.getOrderId() == null ? null : orders.findById(i.getOrderId()).map(o -> o.getOrderNumber()).orElse(null);
        boolean overdue = i.getDueDate() != null && i.outstanding().signum() > 0 && i.getDueDate().isBefore(businessContext.today());
        return new InvoiceResponse(i.getId(), i.getInvoiceNumber(), i.getInvoiceType(), i.getCopyLabel(), i.getSource().name(),
                i.getStatus().name(), i.getCustomerId(), i.getOrderId(), orderNumber, i.getInvoiceDate(), i.getDueDate(),
                i.getPaymentType().name(), i.getPaymentTerms(), i.getBuyerOrderNumber(), i.getDeliveryNote(),
                i.getDispatchDocument(), i.getTransport(), i.getVehicleNumber(), i.getDestination(),
                staff ? i.getNotes() : null, i.isInterState(), seller, buyer, i.getSubtotal(), i.getDiscountTotal(),
                i.getTaxableTotal(), i.getCgstTotal(), i.getSgstTotal(), i.getIgstTotal(), i.getRoundOff(), i.getGrandTotal(),
                i.getPaidAmount(), i.getCreditedAmount(), i.outstanding(), i.getAmountInWords(), i.getTaxAmountInWords(),
                i.getEinvoiceStatus().name(), i.getIrn(), i.getAckNumber(), overdue, i.getGeneratedAt(), i.getSentAt(),
                i.getCancelReason(), items, taxes, notes, i.getCreatedAt(), charges, i.getChargesTotal(),
                detail ? service.tradeInfo(i, staff) : null);
    }

    public record WhatsAppMessageResponse(UUID id, UUID invoiceId, String recipient, String status, String providerMessageId,
                                          String failureReason, int retryCount, Instant nextRetryAt, Instant queuedAt,
                                          Instant sentAt, Instant deliveredAt, Instant readAt) {
        static WhatsAppMessageResponse of(WhatsAppMessage m) {
            return new WhatsAppMessageResponse(m.getId(), m.getInvoiceId(), com.shopflow.common.util.MobileNumbers.mask(m.getRecipientNumber()),
                    m.getStatus().name(), m.getProviderMessageId(), m.getFailureReason(), m.getRetryCount(), m.getNextRetryAt(),
                    m.getQueuedAt(), m.getSentAt(), m.getDeliveredAt(), m.getReadAt());
        }
    }
}
