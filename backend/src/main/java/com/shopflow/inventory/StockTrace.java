package com.shopflow.inventory;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Batch and serial details of one stock movement of a tracked product (§0B.7). Every field is optional:
 * <ul>
 *   <li>{@code batchNumber} (+ dates): the batch received, or the batch to take stock from;</li>
 *   <li>{@code serialNumbers}: the exact units received or sold;</li>
 *   <li>{@code reverseType}/{@code reverseId}: stock coming back (return, cancellation) goes to the batches/serials it
 *       left with under that reference;</li>
 *   <li>{@code customerId}: buyer of sold serial numbers (warranty lookup).</li>
 * </ul>
 * Without details, outbound batch stock is taken first-expiry-first-out and serials oldest first.
 */
public record StockTrace(String batchNumber, LocalDate mfgDate, LocalDate expiryDate, List<String> serialNumbers,
                         String reverseType, UUID reverseId, UUID customerId) {

    public static final StockTrace NONE = new StockTrace(null, null, null, null, null, null, null);

    public static StockTrace received(String batchNumber, LocalDate mfgDate, LocalDate expiryDate, List<String> serialNumbers) {
        return new StockTrace(batchNumber, mfgDate, expiryDate, serialNumbers, null, null, null);
    }

    public static StockTrace sale(List<String> serialNumbers, UUID customerId) {
        return new StockTrace(null, null, null, serialNumbers, null, null, customerId);
    }

    public static StockTrace reversing(String referenceType, UUID referenceId) {
        return new StockTrace(null, null, null, null, referenceType, referenceId, null);
    }

    public static StockTrace fromBatch(String batchNumber, List<String> serialNumbers) {
        return new StockTrace(batchNumber, null, null, serialNumbers, null, null, null);
    }

    public boolean hasSerials() {
        return serialNumbers != null && !serialNumbers.isEmpty();
    }

    /** Batch details shown on documents and the serials actually used. */
    public record Result(String batchDetails, List<String> serials) {
        public static final Result NONE = new Result(null, List.of());
    }
}
