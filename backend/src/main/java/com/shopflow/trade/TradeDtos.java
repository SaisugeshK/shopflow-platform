package com.shopflow.trade;

import com.shopflow.payments.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Requests and responses for trade documents (§0B.9). */
public final class TradeDtos {

    private TradeDtos() {
    }

    // ------------------------------------------------------------------ projects

    public record ProjectRequest(@NotNull UUID customerId,
                                 @NotBlank @Size(max = 200) String name,
                                 @Size(max = 500) String siteAddress,
                                 @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal budget,
                                 @Pattern(regexp = "ACTIVE|CLOSED") String status) {
    }

    public record ProjectResponse(UUID id, UUID customerId, String customerName, String name, String siteAddress,
                                  BigDecimal budget, String status, BigDecimal billed, BigDecimal received,
                                  BigDecimal outstanding, int invoiceCount, Instant createdAt) {
    }

    public record StatementLine(String type, UUID id, String number, LocalDate date, String status, BigDecimal amount,
                                BigDecimal outstanding) {
    }

    public record ProjectStatement(ProjectResponse project, List<StatementLine> lines) {
    }

    // ------------------------------------------------------------------ agents / commission

    public record AgentRequest(@NotBlank @Size(max = 200) String name,
                               @Pattern(regexp = "^(\\+91)?[6-9][0-9]{9}$", message = "Enter a valid Indian mobile number") String mobileNumber,
                               @NotNull @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 2) BigDecimal commissionPercent,
                               Boolean active) {
    }

    public record AgentResponse(UUID id, String name, String mobileNumber, BigDecimal commissionPercent, boolean active,
                                int customerCount, BigDecimal pendingCommission, BigDecimal paidCommission) {
    }

    public record AssignAgentRequest(UUID agentId) {
    }

    public record CommissionRow(UUID invoiceId, String invoiceNumber, LocalDate invoiceDate, String invoiceStatus,
                                UUID customerId, String customerName, UUID agentId, String agentName, BigDecimal taxableTotal,
                                BigDecimal commissionPercent, BigDecimal commissionAmount, Instant paidAt) {
    }

    public record CommissionReport(List<CommissionRow> rows, BigDecimal pending, BigDecimal paid) {
    }

    public record PayCommissionRequest(@NotEmpty @Size(max = 500) List<UUID> invoiceIds) {
    }

    // ------------------------------------------------------------------ quotations

    public record QuotationLineRequest(@NotNull UUID productId,
                                       @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
                                       @Size(max = 20) String unit,
                                       @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal rate,
                                       @DecimalMin("0") @DecimalMax("100") BigDecimal discountPercent) {
    }

    public record CreateQuotationRequest(@NotNull UUID customerId,
                                         UUID projectId,
                                         LocalDate quoteDate,
                                         LocalDate validUntil,
                                         @Size(max = 2000) String notes,
                                         @NotEmpty @Size(max = 200) List<@Valid QuotationLineRequest> items) {
    }

    public record QuotationItemResponse(UUID id, int lineNumber, UUID productId, String productName, String hsnCode,
                                        String unit, BigDecimal unitFactor, BigDecimal quantity, BigDecimal rate,
                                        BigDecimal discountPercent, BigDecimal taxRate, BigDecimal taxableAmount,
                                        BigDecimal taxAmount, BigDecimal lineTotal) {
    }

    public record QuotationResponse(UUID id, String quotationNumber, UUID customerId, String customerName, UUID projectId,
                                    String projectName, String status, LocalDate quoteDate, LocalDate validUntil,
                                    String notes, boolean interState, BigDecimal subtotal, BigDecimal discountTotal,
                                    BigDecimal taxableTotal, BigDecimal taxTotal, BigDecimal grandTotal, UUID orderId,
                                    String orderNumber, Instant sentAt, Instant decidedAt, String decisionNote,
                                    Instant createdAt, List<QuotationItemResponse> items) {
    }

    /** Accepting a quotation places the order; the buyer picks how to pay (and optionally the delivery address). */
    public record AcceptQuotationRequest(@NotNull PaymentMethod paymentMethod, UUID addressId, @Size(max = 500) String note) {
    }

    public record DecisionRequest(@Size(max = 500) String note) {
    }

    // ------------------------------------------------------------------ delivery challans

    public record ChallanLineRequest(@NotNull UUID productId,
                                     @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
                                     @Size(max = 20) String unit,
                                     @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal rate,
                                     @Size(max = 60) String batchNumber,
                                     @Size(max = 500) List<@Size(max = 80) String> serialNumbers) {
    }

    public record CreateChallanRequest(@NotNull UUID customerId,
                                       UUID projectId,
                                       LocalDate challanDate,
                                       @Pattern(regexp = "SUPPLY|APPROVAL|JOB_WORK|OTHER") String purpose,
                                       @Size(max = 20) String vehicleNumber,
                                       @Size(max = 200) String transport,
                                       @Size(max = 200) String destination,
                                       @Size(max = 2000) String notes,
                                       @NotEmpty @Size(max = 200) List<@Valid ChallanLineRequest> items) {
    }

    public record ChallanItemResponse(UUID id, int lineNumber, UUID productId, String productName, String hsnCode,
                                      String unit, BigDecimal unitFactor, BigDecimal quantity, BigDecimal rate,
                                      BigDecimal taxRate, String batchDetails, List<String> serialNumbers) {
    }

    public record ChallanResponse(UUID id, String challanNumber, UUID customerId, String customerName, UUID projectId,
                                  String projectName, LocalDate challanDate, String status, String purpose,
                                  String vehicleNumber, String transport, String destination, String notes,
                                  BigDecimal totalValue, UUID invoiceId, String invoiceNumber, String cancelReason,
                                  Instant createdAt, List<ChallanItemResponse> items) {
    }

    public record ChallanInvoiceRequest(@NotNull PaymentMethod paymentType, LocalDate invoiceDate) {
    }

    public record CancelRequest(@NotBlank @Size(max = 500) String reason) {
    }

    // ------------------------------------------------------------------ e-way bill

    public record EwayBillRequest(@NotNull @Min(1) @Max(4000) Integer distanceKm,
                                  @Size(max = 20) String vehicleNumber,
                                  @Size(max = 200) String transport) {
    }

    // ------------------------------------------------------------------ job work

    public record JobWorkLineRequest(@NotNull UUID productId,
                                     @NotNull @DecimalMin("0.001") @Digits(integer = 11, fraction = 3) BigDecimal quantity) {
    }

    public record CreateJobWorkRequest(UUID supplierId,
                                       @Size(max = 200) String jobWorkerName,
                                       @NotBlank @Size(max = 300) String process,
                                       LocalDate issueDate,
                                       LocalDate expectedDate,
                                       @Size(max = 2000) String notes,
                                       @NotEmpty @Size(max = 100) List<@Valid JobWorkLineRequest> items) {
    }

    /**
     * Goods coming back from the job worker: finished (processed) goods into stock, unused material returned, and
     * material used up in the process (no stock change; it closes the issue line).
     */
    public record ReceiveJobWorkRequest(LocalDate date,
                                        @Size(max = 100) List<@Valid JobWorkLineRequest> finished,
                                        @Size(max = 100) List<@Valid JobWorkLineRequest> returned,
                                        @Size(max = 100) List<@Valid JobWorkLineRequest> consumed,
                                        @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal charges) {
    }

    public record JobWorkLineResponse(UUID id, String direction, UUID productId, String productName, String unit,
                                      BigDecimal quantity, BigDecimal returnedQuantity, BigDecimal consumedQuantity,
                                      BigDecimal pendingQuantity, LocalDate lineDate) {
    }

    public record JobWorkResponse(UUID id, String jobNumber, UUID supplierId, String jobWorkerName, String process,
                                  LocalDate issueDate, LocalDate expectedDate, String status, String notes,
                                  BigDecimal charges, Instant createdAt, List<JobWorkLineResponse> lines) {
    }
}
