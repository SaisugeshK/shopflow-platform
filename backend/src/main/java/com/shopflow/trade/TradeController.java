package com.shopflow.trade;

import com.shopflow.billing.Invoice;
import com.shopflow.billing.InvoiceDtos.InvoiceTradeInfo;
import com.shopflow.billing.InvoiceService;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.trade.TradeDtos.AcceptQuotationRequest;
import com.shopflow.trade.TradeDtos.AgentRequest;
import com.shopflow.trade.TradeDtos.AgentResponse;
import com.shopflow.trade.TradeDtos.AssignAgentRequest;
import com.shopflow.trade.TradeDtos.CancelRequest;
import com.shopflow.trade.TradeDtos.ChallanInvoiceRequest;
import com.shopflow.trade.TradeDtos.ChallanResponse;
import com.shopflow.trade.TradeDtos.CommissionReport;
import com.shopflow.trade.TradeDtos.CreateChallanRequest;
import com.shopflow.trade.TradeDtos.CreateJobWorkRequest;
import com.shopflow.trade.TradeDtos.CreateQuotationRequest;
import com.shopflow.trade.TradeDtos.DecisionRequest;
import com.shopflow.trade.TradeDtos.EwayBillRequest;
import com.shopflow.trade.TradeDtos.JobWorkResponse;
import com.shopflow.trade.TradeDtos.PayCommissionRequest;
import com.shopflow.trade.TradeDtos.ProjectRequest;
import com.shopflow.trade.TradeDtos.ProjectResponse;
import com.shopflow.trade.TradeDtos.ProjectStatement;
import com.shopflow.trade.TradeDtos.QuotationResponse;
import com.shopflow.trade.TradeDtos.ReceiveJobWorkRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
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

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Trade documents (§0B.9): quotations, delivery challans, e-way bills, job work, agent commission and project
 * accounts. Each path is behind its module ({@code ModuleGuard}); customers use the {@code /my/...} paths.
 */
@RestController
@RequestMapping("/api/v1")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Trade documents", description = "Quotations, delivery challans, e-way bills, job work, commission and projects")
public class TradeController {

    private final QuotationService quotations;
    private final ChallanService challans;
    private final EwayBillService ewayBills;
    private final JobWorkService jobWork;
    private final AgentService agents;
    private final ProjectService projects;
    private final InvoiceService invoices;

    public TradeController(QuotationService quotations, ChallanService challans, EwayBillService ewayBills, JobWorkService jobWork,
                           AgentService agents, ProjectService projects, InvoiceService invoices) {
        this.quotations = quotations;
        this.challans = challans;
        this.ewayBills = ewayBills;
        this.jobWork = jobWork;
        this.agents = agents;
        this.projects = projects;
        this.invoices = invoices;
    }

    // ------------------------------------------------------------------ quotations

    @GetMapping("/quotations")
    @PreAuthorize("hasAuthority('ORDER_READ')")
    @Operation(summary = "List quotations")
    public ApiResponse<List<QuotationResponse>> quotations(@RequestParam(required = false) UUID customerId,
                                                           @RequestParam(required = false) String status) {
        return ApiResponse.ok(quotations.list(customerId, status));
    }

    @GetMapping("/quotations/{id}")
    @PreAuthorize("hasAuthority('ORDER_READ')")
    @Operation(summary = "Quotation detail")
    public ApiResponse<QuotationResponse> quotation(@PathVariable UUID id) {
        return ApiResponse.ok(quotations.get(id));
    }

    @PostMapping("/quotations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Create a quotation", description = "Rates default to the customer's price; tax is worked out like an invoice.")
    public ApiResponse<QuotationResponse> createQuotation(@Valid @RequestBody CreateQuotationRequest request) {
        return ApiResponse.ok(quotations.create(request));
    }

    @PostMapping("/quotations/{id}/send")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Send a quotation to the customer")
    public ApiResponse<QuotationResponse> sendQuotation(@PathVariable UUID id) {
        return ApiResponse.ok(quotations.send(id));
    }

    @PostMapping("/quotations/{id}/accept")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Accept for the customer", description = "Places an order at the quoted rates.")
    public ApiResponse<QuotationResponse> acceptQuotation(@PathVariable UUID id, @Valid @RequestBody AcceptQuotationRequest request) {
        return ApiResponse.ok(quotations.accept(id, request));
    }

    @PostMapping("/quotations/{id}/reject")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Mark a quotation rejected")
    public ApiResponse<QuotationResponse> rejectQuotation(@PathVariable UUID id, @Valid @RequestBody(required = false) DecisionRequest request) {
        return ApiResponse.ok(quotations.reject(id, request == null ? null : request.note()));
    }

    @PostMapping("/quotations/{id}/cancel")
    @PreAuthorize("hasAuthority('ORDER_WRITE')")
    @Operation(summary = "Cancel a quotation")
    public ApiResponse<QuotationResponse> cancelQuotation(@PathVariable UUID id, @Valid @RequestBody(required = false) DecisionRequest request) {
        return ApiResponse.ok(quotations.cancel(id, request == null ? null : request.note()));
    }

    @GetMapping("/my/quotations")
    @PreAuthorize("hasAuthority('CUSTOMER_SELF')")
    @Operation(summary = "My quotations")
    public ApiResponse<List<QuotationResponse>> myQuotations() {
        return ApiResponse.ok(quotations.mine());
    }

    @GetMapping("/my/quotations/{id}")
    @PreAuthorize("hasAuthority('CUSTOMER_SELF')")
    @Operation(summary = "My quotation")
    public ApiResponse<QuotationResponse> myQuotation(@PathVariable UUID id) {
        return ApiResponse.ok(quotations.getMine(id));
    }

    @PostMapping("/my/quotations/{id}/accept")
    @PreAuthorize("hasAuthority('CUSTOMER_SELF')")
    @Operation(summary = "Accept a quotation", description = "Places an order at the quoted rates.")
    public ApiResponse<QuotationResponse> acceptMyQuotation(@PathVariable UUID id, @Valid @RequestBody AcceptQuotationRequest request) {
        return ApiResponse.ok(quotations.acceptMine(id, request));
    }

    @PostMapping("/my/quotations/{id}/reject")
    @PreAuthorize("hasAuthority('CUSTOMER_SELF')")
    @Operation(summary = "Decline a quotation")
    public ApiResponse<QuotationResponse> rejectMyQuotation(@PathVariable UUID id, @Valid @RequestBody(required = false) DecisionRequest request) {
        return ApiResponse.ok(quotations.rejectMine(id, request == null ? null : request.note()));
    }

    // ------------------------------------------------------------------ delivery challans

    @GetMapping("/delivery-challans")
    @PreAuthorize("hasAuthority('INVOICE_READ')")
    @Operation(summary = "List delivery challans")
    public ApiResponse<List<ChallanResponse>> challans(@RequestParam(required = false) UUID customerId,
                                                       @RequestParam(required = false) String status) {
        return ApiResponse.ok(challans.list(customerId, status));
    }

    @GetMapping("/delivery-challans/{id}")
    @PreAuthorize("hasAuthority('INVOICE_READ')")
    @Operation(summary = "Delivery challan detail")
    public ApiResponse<ChallanResponse> challan(@PathVariable UUID id) {
        return ApiResponse.ok(challans.get(id));
    }

    @PostMapping("/delivery-challans")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Issue a delivery challan", description = "The goods leave stock now; invoice the challan later.")
    public ApiResponse<ChallanResponse> issueChallan(@Valid @RequestBody CreateChallanRequest request) {
        return ApiResponse.ok(challans.issue(request));
    }

    @PostMapping("/delivery-challans/{id}/cancel")
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Cancel a challan", description = "The goods come back into stock.")
    public ApiResponse<ChallanResponse> cancelChallan(@PathVariable UUID id, @Valid @RequestBody CancelRequest request) {
        return ApiResponse.ok(challans.cancel(id, request.reason()));
    }

    @PostMapping("/delivery-challans/{id}/invoice")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Invoice a challan", description = "Creates and generates the invoice; stock is not moved again.")
    public ApiResponse<Map<String, Object>> invoiceChallan(@PathVariable UUID id, @Valid @RequestBody ChallanInvoiceRequest request) {
        Invoice invoice = challans.invoice(id, request);
        return ApiResponse.ok(Map.of("invoiceId", invoice.getId(), "invoiceNumber", invoice.getInvoiceNumber()));
    }

    // ------------------------------------------------------------------ e-way bill

    @PostMapping("/invoices/{id}/eway-bill")
    @PreAuthorize("hasAuthority('INVOICE_WRITE')")
    @Operation(summary = "Generate the e-way bill", description = "Mock provider: the number is flagged as a test number.")
    public ApiResponse<InvoiceTradeInfo> ewayBill(@PathVariable UUID id, @Valid @RequestBody EwayBillRequest request) {
        ewayBills.generate(id, request);
        return ApiResponse.ok(invoices.tradeInfo(invoices.get(id), true));
    }

    // ------------------------------------------------------------------ job work

    @GetMapping("/job-work")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "List job work")
    public ApiResponse<List<JobWorkResponse>> jobWorks(@RequestParam(required = false) String status) {
        return ApiResponse.ok(jobWork.list(status));
    }

    @GetMapping("/job-work/{id}")
    @PreAuthorize("hasAuthority('STOCK_READ')")
    @Operation(summary = "Job work detail")
    public ApiResponse<JobWorkResponse> jobWork(@PathVariable UUID id) {
        return ApiResponse.ok(jobWork.get(id));
    }

    @PostMapping("/job-work")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('STOCK_WRITE')")
    @Operation(summary = "Send material for job work")
    public ApiResponse<JobWorkResponse> issueJobWork(@Valid @RequestBody CreateJobWorkRequest request) {
        return ApiResponse.ok(jobWork.issue(request));
    }

    @PostMapping("/job-work/{id}/receive")
    @PreAuthorize("hasAuthority('STOCK_WRITE')")
    @Operation(summary = "Receive goods back from job work")
    public ApiResponse<JobWorkResponse> receiveJobWork(@PathVariable UUID id, @Valid @RequestBody ReceiveJobWorkRequest request) {
        return ApiResponse.ok(jobWork.receive(id, request));
    }

    @PostMapping("/job-work/{id}/cancel")
    @PreAuthorize("hasAuthority('STOCK_WRITE')")
    @Operation(summary = "Cancel a job work (nothing received yet)")
    public ApiResponse<JobWorkResponse> cancelJobWork(@PathVariable UUID id) {
        return ApiResponse.ok(jobWork.cancel(id));
    }

    // ------------------------------------------------------------------ agents and commission

    @GetMapping("/commissions/agents")
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    @Operation(summary = "List agents / brokers")
    public ApiResponse<List<AgentResponse>> agents() {
        return ApiResponse.ok(agents.list());
    }

    @PostMapping("/commissions/agents")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Add an agent")
    public ApiResponse<AgentResponse> createAgent(@Valid @RequestBody AgentRequest request) {
        return ApiResponse.ok(agents.create(request));
    }

    @PutMapping("/commissions/agents/{id}")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Update an agent")
    public ApiResponse<AgentResponse> updateAgent(@PathVariable UUID id, @Valid @RequestBody AgentRequest request) {
        return ApiResponse.ok(agents.update(id, request));
    }

    @PutMapping("/commissions/customers/{customerId}/agent")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Link a customer to an agent (null removes the link)")
    public ApiResponse<Void> assignAgent(@PathVariable UUID customerId, @RequestBody AssignAgentRequest request) {
        agents.assign(customerId, request.agentId());
        return ApiResponse.ok(null);
    }

    @GetMapping("/commissions/report")
    @PreAuthorize("hasAuthority('REPORT_FINANCIAL')")
    @Operation(summary = "Commission report", description = "status: PENDING or PAID (default both).")
    public ApiResponse<CommissionReport> commissionReport(@RequestParam(required = false) UUID agentId,
                                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                          @RequestParam(required = false) String status) {
        return ApiResponse.ok(agents.report(agentId, from, to, status));
    }

    @PostMapping("/commissions/pay")
    @PreAuthorize("hasAuthority('REPORT_FINANCIAL')")
    @Operation(summary = "Mark commission paid")
    public ApiResponse<Map<String, Integer>> payCommission(@Valid @RequestBody PayCommissionRequest request) {
        return ApiResponse.ok(Map.of("marked", agents.pay(request.invoiceIds())));
    }

    // ------------------------------------------------------------------ projects

    @GetMapping("/projects")
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    @Operation(summary = "List projects / sites")
    public ApiResponse<List<ProjectResponse>> projects(@RequestParam(required = false) UUID customerId,
                                                       @RequestParam(required = false) String status) {
        return ApiResponse.ok(projects.list(customerId, status));
    }

    @PostMapping("/projects")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Add a project / site")
    public ApiResponse<ProjectResponse> createProject(@Valid @RequestBody ProjectRequest request) {
        return ApiResponse.ok(projects.create(request));
    }

    @PutMapping("/projects/{id}")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE')")
    @Operation(summary = "Update a project / site")
    public ApiResponse<ProjectResponse> updateProject(@PathVariable UUID id, @Valid @RequestBody ProjectRequest request) {
        return ApiResponse.ok(projects.update(id, request));
    }

    @GetMapping("/projects/{id}/statement")
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    @Operation(summary = "Project statement")
    public ApiResponse<ProjectStatement> projectStatement(@PathVariable UUID id) {
        return ApiResponse.ok(projects.statement(id));
    }

    @GetMapping("/my/projects")
    @PreAuthorize("hasAuthority('CUSTOMER_SELF')")
    @Operation(summary = "My projects / sites")
    public ApiResponse<List<ProjectResponse>> myProjects() {
        return ApiResponse.ok(projects.mine());
    }

    @GetMapping("/my/projects/{id}/statement")
    @PreAuthorize("hasAuthority('CUSTOMER_SELF')")
    @Operation(summary = "My project statement")
    public ApiResponse<ProjectStatement> myProjectStatement(@PathVariable UUID id) {
        return ApiResponse.ok(projects.myStatement(id));
    }
}
