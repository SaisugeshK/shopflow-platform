package com.shopflow.returns;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SalesReturnDtos {

    private SalesReturnDtos() {
    }

    public record ReturnLineRequest(@NotNull UUID invoiceItemId, @NotNull @DecimalMin("0.001") BigDecimal quantity,
                                    @Size(max = 300) String reason) {
    }

    /** Staff may pass approve=true to approve immediately. */
    public record CreateSalesReturnRequest(@NotNull UUID invoiceId, @NotBlank @Size(max = 500) String reason,
                                           @NotEmpty List<@Valid ReturnLineRequest> items, Boolean approve) {
    }

    public record ReviewRequest(@Size(max = 500) String note) {
    }

    public record SalesReturnItemResponse(UUID id, UUID invoiceItemId, UUID productId, String productName,
                                          BigDecimal quantity, String reason) {
    }

    public record SalesReturnResponse(UUID id, String returnNumber, UUID invoiceId, String invoiceNumber, UUID orderId,
                                      UUID customerId, String customerName, String status, String reason,
                                      String reviewNote, Instant requestedAt, Instant reviewedAt, UUID creditNoteId,
                                      String creditNoteNumber, BigDecimal creditAmount,
                                      List<SalesReturnItemResponse> items) {
    }
}
