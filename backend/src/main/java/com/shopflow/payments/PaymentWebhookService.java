package com.shopflow.payments;

import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.integrations.payment.PaymentGateway;
import com.shopflow.integrations.payment.PaymentGateway.GatewayEvent;
import com.shopflow.payments.PaymentRepositories.PaymentGatewayEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.shopflow.tenancy.TenantContext;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.UUID;

/**
 * Webhook pipeline (§97): verify signature → store raw event → de-duplicate by event id → apply transactionally.
 * Rejected (bad signature) events are stored too, so tampering attempts are visible.
 */
@Service
public class PaymentWebhookService {

    private static final Logger log = LoggerFactory.getLogger(PaymentWebhookService.class);
    private static final int MAX_PAYLOAD = 64 * 1024;

    private final PaymentGateway gateway;
    private final PaymentGatewayEventRepository events;
    private final PaymentService payments;
    private final TransactionTemplate tx;
    private final TransactionTemplate newTx;

    private final JdbcTemplate jdbc;

    public PaymentWebhookService(PaymentGateway gateway, PaymentGatewayEventRepository events, PaymentService payments,
                                 PlatformTransactionManager txManager, JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.gateway = gateway;
        this.events = events;
        this.payments = payments;
        this.tx = new TransactionTemplate(txManager);
        this.newTx = new TransactionTemplate(txManager);
        this.newTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public String handle(String provider, String payload, String signature) {
        if (!gateway.name().equals(provider)) {
            throw BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Payment provider");
        }
        if (payload == null || payload.isBlank() || payload.length() > MAX_PAYLOAD) {
            throw BusinessException.validation("body", "Invalid webhook payload");
        }
        boolean valid = signature != null && gateway.verifyWebhookSignature(payload, signature);
        GatewayEvent event;
        try {
            event = gateway.parseEvent(payload);
        } catch (RuntimeException e) {
            throw BusinessException.validation("body", "Unreadable webhook payload");
        }
        if (event.eventId() == null || event.eventId().isBlank() || event.providerOrderId() == null) {
            throw BusinessException.validation("body", "Webhook is missing event or order id");
        }
        if (!valid) {
            log.warn("Rejected payment webhook {} with invalid signature", event.eventId());
            newTx.executeWithoutResult(s -> {
                if (!events.existsByProviderAndEventId(provider, "invalid:" + event.eventId())) {
                    PaymentGatewayEvent rejected = new PaymentGatewayEvent(provider, "invalid:" + event.eventId(),
                            event.type(), event.providerOrderId(), event.providerPaymentId(), false, payload);
                    rejected.setProcessingStatus("REJECTED");
                    rejected.setProcessingNote("Invalid signature");
                    events.save(rejected);
                }
            });
            throw new BusinessException(ErrorCode.WEBHOOK_SIGNATURE_INVALID, "Invalid webhook signature");
        }
        if (events.existsByProviderAndEventId(provider, event.eventId())) {
            return "DUPLICATE";
        }
        // The provider knows nothing about tenants: find the payment's tenant (platform lookup), then apply the event
        // inside that tenant so every read and write stays under its RLS scope (§0B.3).
        UUID tenant = TenantContext.callAsPlatform(() -> jdbc.queryForList(
                "SELECT business_id FROM payments WHERE provider = ? AND provider_order_id = ?", UUID.class,
                provider, event.providerOrderId())).stream().findFirst().orElse(null);
        if (tenant == null) {
            return TenantContext.callAsPlatform(() -> apply(provider, payload, event));
        }
        return TenantContext.callInTenant(tenant, () -> apply(provider, payload, event));
    }

    private String apply(String provider, String payload, GatewayEvent event) {
        try {
            return tx.execute(s -> {
                PaymentGatewayEvent stored = events.saveAndFlush(new PaymentGatewayEvent(provider, event.eventId(),
                        event.type(), event.providerOrderId(), event.providerPaymentId(), true, payload));
                String note = payments.applyGatewayEvent(event);
                stored.setProcessingStatus("PROCESSED");
                stored.setProcessingNote(note);
                stored.setProcessedAt(Instant.now());
                return note;
            });
        } catch (DataIntegrityViolationException e) {
            // Concurrent delivery of the same event: the other transaction won.
            return "DUPLICATE";
        }
    }
}
