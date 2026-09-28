package com.shopflow.integrations.einvoice;

import com.shopflow.common.util.Hashing;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

/**
 * Development e-invoice provider. Produces deterministic identifiers prefixed "TEST-ONLY-" that are shown on the
 * PDF as TEST ONLY and stored with status TEST_IRN — never presented as government-issued IRNs.
 */
@Component
@ConditionalOnProperty(name = "app.einvoice.provider", havingValue = "mock", matchIfMissing = true)
public class MockEInvoiceProvider implements EInvoiceProvider {

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public boolean testOnly() {
        return true;
    }

    @Override
    public Registration register(Request request) {
        String digest = Hashing.sha256Hex((request.sellerGstin() + "|" + request.invoiceNumber() + "|" + request.invoiceDate())
                .getBytes(StandardCharsets.UTF_8));
        String irn = "TEST-ONLY-" + digest.substring(0, 54);
        String ack = "TEST" + digest.substring(0, 12).chars().map(c -> '0' + (c % 10)).collect(StringBuilder::new,
                StringBuilder::appendCodePoint, StringBuilder::append);
        return new Registration(irn, ack, Instant.now(), "TEST ONLY - NOT A GOVERNMENT QR|" + irn);
    }
}
