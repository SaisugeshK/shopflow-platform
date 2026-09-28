package com.shopflow.integrations.whatsapp;

import java.util.List;

/**
 * WhatsApp Business delivery boundary (§32, §109). Production uses the official WhatsApp Business Platform (Cloud
 * API) behind this same interface. Provider credentials stay server-side.
 */
public interface WhatsAppProvider {

    String name();

    /**
     * Sends a document (invoice PDF) using an approved template.
     *
     * @return provider message id
     * @throws com.shopflow.integrations.ProviderException on failure/timeout
     */
    String sendDocument(String recipientE164, String templateId, byte[] document, String fileName, String caption);

    boolean verifyWebhookSignature(String payload, String signature);

    /** Parses delivery-status callbacks. */
    List<StatusEvent> parseStatusEvents(String payload);

    record StatusEvent(String eventId, String providerMessageId, String status, String failureReason) {
    }
}
