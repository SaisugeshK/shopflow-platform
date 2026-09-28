package com.shopflow.integrations.payment;

import com.shopflow.common.util.Hashing;
import com.shopflow.config.AppProperties;
import com.shopflow.integrations.ProviderException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Development payment gateway. No real money moves. It signs webhooks with the configured webhook secret exactly
 * like a real provider, so the production verification path is exercised. {@link #simulate} produces the event
 * sequence for each supported scenario (§0A mock payment behaviour, §110).
 */
@Component
@ConditionalOnProperty(name = "app.payment.provider", havingValue = "mock", matchIfMissing = true)
public class MockPaymentGateway implements PaymentGateway {

    public static final String NAME = "mock";

    /** Amounts that make order creation time out (test hook). */
    public static final BigDecimal TIMEOUT_AMOUNT = new BigDecimal("999999.99");

    public enum Outcome { SUCCESS, FAILED, PENDING, CANCELLED, TIMEOUT, DUPLICATE_WEBHOOK, OUT_OF_ORDER, INVALID_SIGNATURE, PARTIAL }

    private final String secret;
    private final ObjectMapper mapper;
    private final Map<String, BigDecimal> orders = new ConcurrentHashMap<>();
    private final Map<String, String> paymentIds = new ConcurrentHashMap<>();
    private final Set<String> refunded = ConcurrentHashMap.newKeySet();

    public MockPaymentGateway(AppProperties properties, ObjectMapper mapper) {
        this.secret = properties.payment().webhookSecret();
        this.mapper = mapper;
        if (secret == null || secret.length() < 16) {
            throw new IllegalStateException("PAYMENT_WEBHOOK_SECRET must be set (at least 16 characters)");
        }
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public GatewayOrder createOrder(String receipt, BigDecimal amount, String currency) {
        if (amount.compareTo(TIMEOUT_AMOUNT) == 0) {
            throw ProviderException.timeout("mock-payment");
        }
        String id = "order_mock_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        orders.put(id, amount);
        return new GatewayOrder(id, amount, currency, "mock_checkout_key");
    }

    @Override
    public boolean verifyClientSignature(String providerOrderId, String providerPaymentId, String signature) {
        return Hashing.constantTimeEquals(Hashing.hmacSha256Hex(secret, providerOrderId + "|" + providerPaymentId), signature);
    }

    @Override
    public boolean verifyWebhookSignature(String payload, String signature) {
        return Hashing.constantTimeEquals(Hashing.hmacSha256Hex(secret, payload), signature);
    }

    @Override
    public GatewayEvent parseEvent(String payload) {
        JsonNode node = mapper.readTree(payload);
        return new GatewayEvent(node.path("id").asString(), node.path("type").asString(), node.path("orderId").asString(),
                node.path("paymentId").asString(null), node.hasNonNull("amount") ? new BigDecimal(node.path("amount").asString()) : null,
                node.path("failureReason").asString(null));
    }

    @Override
    public RefundResult refund(String providerPaymentId, BigDecimal amount) {
        if (providerPaymentId == null || !paymentIds.containsValue(providerPaymentId) && !providerPaymentId.startsWith("pay_mock_")) {
            throw ProviderException.rejected("mock-payment", "unknown payment");
        }
        refunded.add(providerPaymentId);
        return new RefundResult("rfnd_mock_" + UUID.randomUUID().toString().substring(0, 12), amount);
    }

    /** Client-side signature the mock checkout returns to the browser/app. */
    public String clientSignature(String providerOrderId, String providerPaymentId) {
        return Hashing.hmacSha256Hex(secret, providerOrderId + "|" + providerPaymentId);
    }

    public String paymentIdFor(String providerOrderId) {
        return paymentIds.computeIfAbsent(providerOrderId,
                k -> "pay_mock_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
    }

    /**
     * Builds the signed webhook deliveries a real provider would send for the scenario. Each element is
     * (payload, signature). An empty list means the provider sends nothing (PENDING / TIMEOUT).
     */
    public List<SignedEvent> simulate(String providerOrderId, BigDecimal orderAmount, Outcome outcome) {
        String paymentId = paymentIdFor(providerOrderId);
        List<SignedEvent> events = new ArrayList<>();
        switch (outcome) {
            case SUCCESS -> {
                events.add(signed(event("payment.authorized", providerOrderId, paymentId, orderAmount, null)));
                events.add(signed(event("payment.captured", providerOrderId, paymentId, orderAmount, null)));
            }
            case PARTIAL -> events.add(signed(event("payment.captured", providerOrderId, paymentId,
                    orderAmount.divide(new BigDecimal("2"), 2, java.math.RoundingMode.HALF_UP), null)));
            case FAILED -> events.add(signed(event("payment.failed", providerOrderId, paymentId, orderAmount, "Card declined (mock)")));
            case CANCELLED -> events.add(signed(event("payment.cancelled", providerOrderId, paymentId, orderAmount, "Customer cancelled checkout")));
            case PENDING -> events.add(signed(event("payment.pending", providerOrderId, paymentId, orderAmount, null)));
            case TIMEOUT -> {
                // Provider never answers; the payment stays pending until reconciliation.
            }
            case DUPLICATE_WEBHOOK -> {
                SignedEvent captured = signed(event("payment.captured", providerOrderId, paymentId, orderAmount, null));
                events.add(captured);
                events.add(captured);
            }
            case OUT_OF_ORDER -> {
                events.add(signed(event("payment.captured", providerOrderId, paymentId, orderAmount, null)));
                events.add(signed(event("payment.authorized", providerOrderId, paymentId, orderAmount, null)));
            }
            case INVALID_SIGNATURE -> {
                String payload = event("payment.captured", providerOrderId, paymentId, orderAmount, null);
                events.add(new SignedEvent(payload, "invalid-signature"));
            }
        }
        return events;
    }

    private String event(String type, String orderId, String paymentId, BigDecimal amount, String failureReason) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", "evt_mock_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        body.put("type", type);
        body.put("orderId", orderId);
        body.put("paymentId", paymentId);
        body.put("amount", amount.toPlainString());
        if (failureReason != null) {
            body.put("failureReason", failureReason);
        }
        return mapper.writeValueAsString(body);
    }

    private SignedEvent signed(String payload) {
        return new SignedEvent(payload, Hashing.hmacSha256Hex(secret, payload));
    }

    public record SignedEvent(String payload, String signature) {
    }
}
