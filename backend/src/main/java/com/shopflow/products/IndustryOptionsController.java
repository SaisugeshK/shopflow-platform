package com.shopflow.products;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.inventory.InventoryService;
import com.shopflow.inventory.TrackingQueries;
import com.shopflow.inventory.TrackingQueries.BatchRow;
import com.shopflow.inventory.TrackingQueries.SerialRow;
import com.shopflow.products.DailyRateService.RateRow;
import com.shopflow.products.DailyRateService.SetRatesRequest;
import com.shopflow.products.SchemeService.SchemeRequest;
import com.shopflow.products.SchemeService.SchemeResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Industry options (§0B.7): daily rate list, schemes, batches (expiry), serial numbers and barcode labels. Each area
 * needs its module (403 MODULE_DISABLED otherwise, see ModuleGuard).
 */
@RestController
@RequestMapping("/api/v1")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Industry options", description = "Daily rates, schemes, batches, serial numbers and labels")
public class IndustryOptionsController {

    private final DailyRateService rates;
    private final SchemeService schemes;
    private final TrackingQueries tracking;
    private final InventoryService inventory;
    private final LabelService labels;

    public IndustryOptionsController(DailyRateService rates, SchemeService schemes, TrackingQueries tracking,
                                     InventoryService inventory, LabelService labels) {
        this.rates = rates;
        this.schemes = schemes;
        this.tracking = tracking;
        this.inventory = inventory;
        this.labels = labels;
    }

    // ---------------------------------------------------------------- daily rates

    @GetMapping("/daily-rates")
    @PreAuthorize("hasAuthority('PRODUCT_READ')")
    @Operation(summary = "Rate list", description = "Products priced by daily rate, with the rate in force on the date (default today) and the previous rate.")
    public ApiResponse<List<RateRow>> rateList(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ApiResponse.ok(rates.list(date));
    }

    @PutMapping("/daily-rates")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Set rates", description = "Effective date defaults to today (back-dating up to 7 days, future dates allowed). "
            + "The rate in force today becomes the selling price.")
    public ApiResponse<List<RateRow>> setRates(@Valid @RequestBody SetRatesRequest request) {
        return ApiResponse.ok(rates.set(request), "Rates saved");
    }

    // ---------------------------------------------------------------- schemes

    @GetMapping("/schemes")
    @PreAuthorize("hasAuthority('PRODUCT_READ')")
    @Operation(summary = "Schemes")
    public ApiResponse<List<SchemeResponse>> schemes() {
        return ApiResponse.ok(schemes.list());
    }

    @PostMapping("/schemes")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Create a scheme", description = "BUY_X_GET_Y (product), QUANTITY_SLAB or VALUE_SLAB (product or category).")
    public ApiResponse<SchemeResponse> createScheme(@Valid @RequestBody SchemeRequest request) {
        return ApiResponse.ok(schemes.create(request), "Scheme created");
    }

    @PutMapping("/schemes/{id}")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Update a scheme")
    public ApiResponse<SchemeResponse> updateScheme(@PathVariable UUID id, @Valid @RequestBody SchemeRequest request) {
        return ApiResponse.ok(schemes.update(id, request));
    }

    @PostMapping("/schemes/{id}/activate")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Activate a scheme")
    public ApiResponse<SchemeResponse> activateScheme(@PathVariable UUID id) {
        return ApiResponse.ok(schemes.setActive(id, true));
    }

    @PostMapping("/schemes/{id}/deactivate")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Deactivate a scheme")
    public ApiResponse<SchemeResponse> deactivateScheme(@PathVariable UUID id) {
        return ApiResponse.ok(schemes.setActive(id, false));
    }

    // ---------------------------------------------------------------- batches

    @GetMapping("/batches")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "Batches", description = "status: ALL (in stock), NEAR_EXPIRY, EXPIRED or EMPTY. Sorted by expiry.")
    public ApiResponse<List<BatchRow>> batches(@RequestParam(required = false) UUID productId,
                                               @RequestParam(required = false) String status,
                                               @RequestParam(required = false) String q) {
        return ApiResponse.ok(tracking.batches(productId, status, q));
    }

    public record WriteOffRequest(@NotBlank @Size(max = 60) String batchNumber, @DecimalMin("0.001") BigDecimal quantity,
                                  boolean expired, @NotBlank @Size(max = 300) String reason) {
    }

    @PostMapping("/batches/products/{productId}/write-off")
    @PreAuthorize("hasAuthority('STOCK_WRITE')")
    @Operation(summary = "Write off batch stock", description = "Expired (EXPIRY_OUT) or damaged stock of one batch; quantity defaults to all of it.")
    public ApiResponse<List<BatchRow>> writeOff(@PathVariable UUID productId, @Valid @RequestBody WriteOffRequest request) {
        BigDecimal quantity = request.quantity();
        if (quantity == null) {
            quantity = tracking.batches(productId, "ALL", null).stream()
                    .filter(b -> b.batchNumber().equalsIgnoreCase(request.batchNumber())).map(BatchRow::onHand).findFirst()
                    .orElse(BigDecimal.ZERO);
        }
        inventory.writeOffBatch(productId, request.batchNumber(), quantity, request.expired(), request.reason());
        return ApiResponse.ok(tracking.batches(productId, "ALL", null), "Stock written off");
    }

    // ---------------------------------------------------------------- serial numbers

    @GetMapping("/serials")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "Find serial / IMEI numbers", description = "Search by serial, product or invoice number; shows the buyer and warranty.")
    public ApiResponse<List<SerialRow>> serials(@RequestParam(required = false) String q,
                                                @RequestParam(required = false) UUID productId,
                                                @RequestParam(required = false) String status) {
        return ApiResponse.ok(tracking.serials(q, productId, status));
    }

    @GetMapping("/serials/in-stock")
    @PreAuthorize("hasAuthority('INVOICE_WRITE') or hasAuthority('STOCK_READ')")
    @Operation(summary = "In-stock serial numbers of a product")
    public ApiResponse<List<String>> inStock(@RequestParam UUID productId) {
        return ApiResponse.ok(tracking.inStockSerials(productId));
    }

    // ---------------------------------------------------------------- labels

    @GetMapping(value = "/labels/products", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasAuthority('PRODUCT_READ')")
    @Operation(summary = "Barcode labels (PDF)", description = "ids: product ids; copies per product (1–100). A4, 3 × 8 labels.")
    public ResponseEntity<byte[]> labels(@RequestParam List<UUID> ids, @RequestParam(defaultValue = "1") int copies) {
        byte[] pdf = labels.productLabels(ids, copies);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename("labels.pdf").build().toString())
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }
}
