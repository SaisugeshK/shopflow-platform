package com.shopflow.reports;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.security.CurrentUser;
import com.shopflow.security.Permissions;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/reports")
@Tag(name = "Reports", description = "Sales, purchase, stock, profit, GST/tax, customer, outstanding and payment reports with CSV/Excel/PDF export")
@SecurityRequirement(name = "bearerAuth")
@PreAuthorize("hasAuthority('REPORT_READ')")
public class ReportController {

    private static final Set<String> NAMES = Set.of("sales", "purchases", "stock", "profit", "tax", "customers", "outstanding", "payments");

    private final ReportService reports;
    private final ExportService exports;

    public ReportController(ReportService reports, ExportService exports) {
        this.reports = reports;
        this.exports = exports;
    }

    @GetMapping("/{name}")
    @Operation(summary = "Run a report",
            description = "name: sales, purchases, stock, profit, tax, customers, outstanding, payments. Defaults to the current month. "
                    + "profit and tax require REPORT_FINANCIAL. Add format=csv|xlsx|pdf to download the same data.")
    public ResponseEntity<?> run(@PathVariable String name,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                 @RequestParam(required = false) UUID customerId,
                                 @RequestParam(required = false) UUID productId,
                                 @RequestParam(required = false) UUID supplierId,
                                 @RequestParam(required = false) UUID categoryId,
                                 @Parameter(description = "json (default), csv, xlsx or pdf") @RequestParam(required = false) String format) {
        if (!NAMES.contains(name)) {
            throw BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Report");
        }
        if (ReportService.isFinancial(name) && !CurrentUser.hasPermission(Permissions.REPORT_FINANCIAL)) {
            throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, "This report requires REPORT_FINANCIAL");
        }
        ReportResult result = reports.run(name, new ReportService.Filter(from, to, customerId, productId, supplierId, categoryId));
        if (format == null || format.isBlank() || "json".equalsIgnoreCase(format)) {
            return ResponseEntity.ok(ApiResponse.ok(result));
        }
        ExportService.Export export = exports.export(result, format);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(export.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(export.fileName()).build().toString())
                .body(export.content());
    }
}
