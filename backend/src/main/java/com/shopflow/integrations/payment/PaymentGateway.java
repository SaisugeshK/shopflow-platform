package com.shopflow.integrations.payment;

import java.math.BigDecimal;

/**
 * Online payment provider (§96, §110, §111). The mock and the Razorpay adapter implement the same contract; the
 * backend updates payment state only through {@code PaymentWebhookService}, never from a client-side response.
 */
public interface PaymentGateway {

    String name();

    /** Creates a provider order / payment intent. */
    GatewayOrder createOrder(String receipt, BigDecimal amount, String currency);

    /** Verifies the signature a client receives after checkout (order_id|payment_id). */
    boolean verifyClientSignature(String providerOrderId, String providerPaymentId, String signature);

    /** Verifies a webhook body signature. */
    boolean verifyWebhookSignature(String payload, String signature);

    /** Parses a verified webhook payload. */
    GatewayEvent parseEvent(String payload);

    /** Refunds a captured payment (full or partial). */
    RefundResult refund(String providerPaymentId, BigDecimal amount);

    record GatewayOrder(String providerOrderId, BigDecimal amount, String currency, String checkoutKey) {
    }

    /**
     * @param type one of payment.authorized, payment.captured, payment.failed, payment.pending, payment.cancelled,
     *             refund.processed
     */
    record GatewayEvent(String eventId, String type, String providerOrderId, String providerPaymentId,
                        BigDecimal amount, String failureReason) {
    }

    record RefundResult(String refundId, BigDecimal amount) {
    }
}
