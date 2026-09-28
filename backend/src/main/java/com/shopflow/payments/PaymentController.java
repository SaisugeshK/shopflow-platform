package com.shopflow.payments;

import com.shopflow.billing.BillingRepositories.InvoiceRepository;
import com.shopflow.billing.Invoice;
import com.shopflow.billing.pdf.ReceiptPdfRenderer;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerService;
import com.shopflow.orders.Order;
import com.shopflow.orders.OrderRepositories.OrderRepository;
import com.shopflow.payments.PaymentDtos.AllocationResponse;
import com.shopflow.payments.PaymentDtos.CancelPaymentRequest;
import com.shopflow.payments.PaymentDtos.PaymentResponse;
import com.shopflow.payments.PaymentDtos.RecordPaymentRequest;
import com.shopflow.payments.PaymentDtos.RefundRequest;
import com.shopflow.payments.PaymentDtos.VerifyOnlinePaymentRequest;
import com.shopflow.security.CurrentUser;
import com.shopflow.users.UserService;
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

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments")
@Tag(name = "Payments", description = "Payment recording, online payment verification, refunds, receipts and gateway webhooks")
public class PaymentController {

    private static final String READ = "hasAnyAuthority('PAYMENT_READ','CUSTOMER_SELF')";

    private final PaymentService service;
    private final PaymentWebhookService webhooks;
    private final CustomerService customers;
    private final InvoiceRepository invoices;
    private final OrderRepository orders;
    private final UserService users;
    private final ReceiptPdfRenderer receipts;
    private final BusinessSettingsService settings;
    private final BusinessContext businessContext;

    public PaymentController(PaymentService service, PaymentWebhookService webhooks, CustomerService customers,
                             InvoiceRepository invoices, OrderRepository orders, UserService users,
                             ReceiptPdfRenderer receipts, BusinessSettingsService settings, BusinessContext businessContext) {
        this.service = service;
        this.webhooks = webhooks;
        this.customers = customers;
        this.invoices = invoices;
        this.orders = orders;
        this.users = users;
        this.receipts = receipts;
        this.settings = settings;
        this.businessContext = businessContext;
    }

    @GetMapping
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize(READ)
    @Operation(summary = "List payments", description = "Customers see only their own. Filter by customer, method, status and date range. Sort: createdAt, amount, paidAt.")
    public ApiResponse<List<PaymentResponse>> list(@RequestParam(required = false) UUID customerId,
                                                   @RequestParam(required = false) PaymentMethod method,
                                                   @RequestParam(required = false) PaymentStatus status,
                                                   @RequestParam(required = false) String q,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                   @RequestParam(required = false) Integer page,
                                                   @RequestParam(required = false) Integer pageSize,
                                                   @RequestParam(required = false) String sort) {
        UUID scope = CurrentUser.isCustomer() ? CurrentUser.customerId() : customerId;
        var pageable = PageQuery.of(page, pageSize, sort, PageQuery.fields("createdAt", "amount", "paidAt"), Sort.by(Sort.Direction.DESC, "createdAt"));
        Map<UUID, Customer> cache = new HashMap<>();
        return ApiResponse.page(service.search(scope, method, status, from, to, q, pageable), p -> toResponse(p, false, cache));
    }

    @GetMapping("/{id}")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize(READ)
    @Operation(summary = "Get a payment with its invoice allocations")
    public ApiResponse<PaymentResponse> get(@PathVariable UUID id) {
        return ApiResponse.ok(toResponse(service.getForCurrentUser(id), true, new HashMap<>()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasAuthority('PAYMENT_WRITE')")
    @Operation(summary = "Record a payment", description = "Cash, UPI, bank transfer or other. Applied to invoiceId when given, otherwise to the oldest open invoices; any remainder is a customer advance. "
            + "Posts the customer ledger. Send Idempotency-Key for safe retries. Errors: PAYMENT_INVALID_AMOUNT, INVOICE_INVALID_STATUS.")
    public ApiResponse<PaymentResponse> record(@Valid @RequestBody RecordPaymentRequest request,
                                               @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ApiResponse.ok(toResponse(service.recordManual(request, idempotencyKey), true, new HashMap<>()), "Payment recorded");
    }

    @PostMapping("/{id}/cancel")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasAuthority('PAYMENT_WRITE')")
    @Operation(summary = "Cancel a manually recorded payment", description = "For entries made in error. Reverses allocations and the ledger. Online payments must be refunded instead.")
    public ApiResponse<PaymentResponse> cancel(@PathVariable UUID id, @Valid @RequestBody CancelPaymentRequest request) {
        return ApiResponse.ok(toResponse(service.cancel(id, request.reason().trim()), true, new HashMap<>()));
    }

    @PostMapping("/{id}/refund")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasAuthority('PAYMENT_WRITE')")
    @Operation(summary = "Refund a payment", description = "Full (amount omitted) or partial. Online payments are refunded through the gateway.")
    public ApiResponse<PaymentResponse> refund(@PathVariable UUID id, @Valid @RequestBody RefundRequest request) {
        return ApiResponse.ok(toResponse(service.refund(id, request.amount(), request.reason().trim()), true, new HashMap<>()));
    }

    @PostMapping("/{id}/verify")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasAnyAuthority('CUSTOMER_SELF','PAYMENT_WRITE')")
    @Operation(summary = "Submit the client checkout result", description = "Verifies the provider signature server-side. The payment is marked captured only by the signed provider webhook.")
    public ApiResponse<PaymentResponse> verify(@PathVariable UUID id, @Valid @RequestBody VerifyOnlinePaymentRequest request) {
        return ApiResponse.ok(toResponse(service.verifyClientResult(id, request.providerPaymentId(), request.signature()), true, new HashMap<>()));
    }

    @GetMapping(value = "/{id}/receipt", produces = MediaType.APPLICATION_PDF_VALUE)
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize(READ)
    @Operation(summary = "Download the payment receipt (PDF)")
    public ResponseEntity<byte[]> receipt(@PathVariable UUID id) {
        Payment p = service.getForCurrentUser(id);
        List<String> against = service.allocationsFor(id).stream()
                .map(a -> invoices.findById(a.getInvoiceId()).map(Invoice::getInvoiceNumber).orElse("")).toList();
        byte[] pdf = receipts.render(settings.business(), customers.get(p.getCustomerId()), p, against, businessContext.zone());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(p.getPaymentNumber().replace('/', '-') + ".pdf").build().toString())
                .body(pdf);
    }

    @PostMapping("/webhooks/{provider}")
    @Operation(summary = "Payment provider webhook", description = "Public endpoint. The body signature (X-Webhook-Signature) is verified, the raw event stored, duplicates ignored "
            + "and the payment updated transactionally. Errors: WEBHOOK_SIGNATURE_INVALID (400).")
    public ApiResponse<Map<String, String>> webhook(@PathVariable String provider, @RequestBody String payload,
                                                    @RequestHeader(value = "X-Webhook-Signature", required = false) String signature) {
        return ApiResponse.ok(Map.of("result", webhooks.handle(provider, payload, signature)));
    }

    PaymentResponse toResponse(Payment p, boolean detail, Map<UUID, Customer> cache) {
        Customer c = cache.computeIfAbsent(p.getCustomerId(), customers::get);
        String invoiceNumber = p.getInvoiceId() == null ? null : invoices.findById(p.getInvoiceId()).map(Invoice::getInvoiceNumber).orElse(null);
        String orderNumber = p.getOrderId() == null ? null : orders.findById(p.getOrderId()).map(Order::getOrderNumber).orElse(null);
        String collector = p.getCollectedBy() == null || CurrentUser.isCustomer() ? null : users.get(p.getCollectedBy()).getFullName();
        List<AllocationResponse> allocations = detail ? service.allocationsFor(p.getId()).stream()
                .map(a -> new AllocationResponse(a.getInvoiceId(), invoices.findById(a.getInvoiceId()).map(Invoice::getInvoiceNumber).orElse(null),
                        a.getAmount(), a.isReversed())).toList() : null;
        return new PaymentResponse(p.getId(), p.getPaymentNumber(), p.getCustomerId(), c.getShopName(), p.getInvoiceId(),
                invoiceNumber, p.getOrderId(), orderNumber, p.getAmount(), p.getMethod().name(), p.getStatus().name(),
                p.getReferenceNumber(), p.getPaidAt(), collector, CurrentUser.isCustomer() ? null : p.getNotes(),
                p.getProvider(), p.getProviderOrderId(), p.getProviderPaymentId(), p.getFailureReason(),
                p.getAllocatedAmount(), p.getRefundedAmount(), p.unallocated(), p.getCancelReason(), allocations, p.getCreatedAt());
    }
}
