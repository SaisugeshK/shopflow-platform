package com.shopflow.integrations.whatsapp;

import com.shopflow.common.util.Hashing;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.config.AppProperties;
import com.shopflow.integrations.ProviderException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Development WhatsApp provider. Never sends a real message. Recipients ending in the configured failure suffix
 * (default 9999) are rejected, numbers ending in 8888 time out on the first two attempts (to exercise retries),
 * and status callbacks are produced as signed webhook payloads via {@link #statusWebhook}.
 */
@Component
@ConditionalOnProperty(name = "app.whatsapp.provider", havingValue = "mock", matchIfMissing = true)
public class MockWhatsAppProvider implements WhatsAppProvider {

    private static final Logger log = LoggerFactory.getLogger(MockWhatsAppProvider.class);

    private final String secret;
    private final String failureSuffix;
    private final ObjectMapper mapper;
    private final Map<String, AtomicInteger> timeouts = new java.util.concurrent.ConcurrentHashMap<>();

    public MockWhatsAppProvider(AppProperties properties, ObjectMapper mapper) {
        this.secret = properties.whatsapp().webhookSecret();
        this.failureSuffix = properties.whatsapp().mockFailureSuffix();
        this.mapper = mapper;
        if (secret == null || secret.length() < 16) {
            throw new IllegalStateException("WHATSAPP_WEBHOOK_SECRET must be set (at least 16 characters)");
        }
    }

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public String sendDocument(String recipient, String templateId, byte[] document, String fileName, String caption) {
        if (failureSuffix != null && !failureSuffix.isBlank() && recipient.endsWith(failureSuffix)) {
            throw ProviderException.rejected("mock-whatsapp", "recipient is not a WhatsApp user");
        }
        if (recipient.endsWith("8888") && timeouts.computeIfAbsent(recipient, k -> new AtomicInteger()).incrementAndGet() <= 2) {
            throw ProviderException.timeout("mock-whatsapp");
        }
        String id = "wamid.MOCK" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        log.info("[MOCK WHATSAPP] {} to {} with {} ({} bytes) -> {}", templateId, MobileNumbers.mask(recipient), fileName,
                document.length, id);
        return id;
    }

    @Override
    public boolean verifyWebhookSignature(String payload, String signature) {
        return signature != null && Hashing.constantTimeEquals(Hashing.hmacSha256Hex(secret, payload), signature);
    }

    @Override
    public List<StatusEvent> parseStatusEvents(String payload) {
        JsonNode node = mapper.readTree(payload);
        List<StatusEvent> events = new ArrayList<>();
        for (JsonNode s : node.path("statuses")) {
            events.add(new StatusEvent(s.path("id").asString(), s.path("messageId").asString(),
                    s.path("status").asString(), s.path("error").asString(null)));
        }
        return events;
    }

    /** Signed status callback as the provider would deliver it. Returns (payload, signature). */
    public String[] statusWebhook(String providerMessageId, String status, String error) {
        Map<String, Object> st = new LinkedHashMap<>();
        st.put("id", "wa_evt_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        st.put("messageId", providerMessageId);
        st.put("status", status);
        if (error != null) {
            st.put("error", error);
        }
        String payload = mapper.writeValueAsString(Map.of("statuses", List.of(st)));
        return new String[]{payload, Hashing.hmacSha256Hex(secret, payload)};
    }
}
