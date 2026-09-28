package com.shopflow.dashboard;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.customers.CustomerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/dashboard")
@Tag(name = "Dashboard", description = "Owner, Admin and Customer dashboards")
@SecurityRequirement(name = "bearerAuth")
public class DashboardController {

    private final DashboardService service;
    private final CustomerService customers;

    public DashboardController(DashboardService service, CustomerService customers) {
        this.service = service;
        this.customers = customers;
    }

    @GetMapping("/owner")
    @PreAuthorize("hasAuthority('DASHBOARD_OWNER_VIEW')")
    @Operation(summary = "Owner dashboard", description = "KPIs (sales, profit, customers, stock value, outstanding, pending orders/payments, low stock), trends and tables. "
            + "range: TODAY, YESTERDAY, THIS_WEEK, THIS_MONTH (default), THIS_FINANCIAL_YEAR, CUSTOM (with from/to).")
    public ApiResponse<Map<String, Object>> owner(@RequestParam(required = false) DashboardService.Range range,
                                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.ok(service.owner(service.period(range, from, to)));
    }

    @GetMapping("/admin")
    @PreAuthorize("hasAuthority('DASHBOARD_VIEW')")
    @Operation(summary = "Admin (operations) dashboard", description = "Order pipeline counts, today's sales, pending payments, approvals, returns and low stock.")
    public ApiResponse<Map<String, Object>> admin(@RequestParam(required = false) DashboardService.Range range,
                                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.ok(service.admin(service.period(range == null ? DashboardService.Range.TODAY : range, from, to)));
    }

    @GetMapping("/customer")
    @PreAuthorize("hasAuthority('CUSTOMER_SELF')")
    @Operation(summary = "Customer home summary", description = "Outstanding, open orders, recent orders and recently ordered products for the signed-in customer.")
    public ApiResponse<Map<String, Object>> customer() {
        return ApiResponse.ok(service.customer(customers.currentApprovedCustomer().getId()));
    }
}
