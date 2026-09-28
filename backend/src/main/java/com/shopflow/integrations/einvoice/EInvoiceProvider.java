package com.shopflow.integrations.einvoice;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * GST e-invoice registration (IRP/GSP) boundary (§112). Implementations must never fabricate government-issued
 * identifiers; the mock marks everything it returns as TEST ONLY.
 */
public interface EInvoiceProvider {

    String name();

    boolean testOnly();

    Registration register(Request request);

    record Request(String invoiceNumber, LocalDate invoiceDate, String sellerGstin, String buyerGstin,
                   BigDecimal taxableValue, BigDecimal totalTax, BigDecimal grandTotal) {
    }

    record Registration(String irn, String ackNumber, Instant ackDate, String signedQrData) {
    }
}
