package com.shopflow.notifications;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.billing.Invoice;
import com.shopflow.billing.InvoiceDocumentService;
import com.shopflow.billing.InvoiceService;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettings;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.idempotency.IdempotencyService;
import com.shopflow.common.jobs.BackgroundJobs;
import com.shopflow.config.AppProperties;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerService;
import com.shopflow.integrations.ProviderException;
import com.shopflow.integrations.whatsapp.WhatsAppProvider;
import com.shopflow.integrations.whatsapp.WhatsAppProvider.StatusEvent;
import com.shopflow.security.CurrentUser;
import com.shopflow.tenancy.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Invoice delivery over WhatsApp (§32, §109). Sending is asynchronous and retried with exponential backoff and
 * jitter (§113); a WhatsApp outage never blocks invoicing, payments or stock.
 */
@Service
public class WhatsAppService {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppService.class);

    private final WhatsAppMessageRepository messages;
    private final WhatsAppProvider provider;
    private final InvoiceService invoices;
    private final InvoiceDocumentService documents;
    private final CustomerService customers;
    private final BusinessSettingsService settings;
    private final BusinessContext businessContext;
    private final IdempotencyService idempotency;
    private final BackgroundJobs jobs;
    private final AppProperties.WhatsApp props;
    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final TransactionTemplate tx;

    public WhatsAppService(WhatsAppMessageRepository messages, WhatsAppProvider provider, InvoiceService invoices,
                           InvoiceDocumentService documents, CustomerService customers, BusinessSettingsService settings,
                           BusinessContext businessContext, IdempotencyService idempotency, BackgroundJobs jobs,
                           AppProperties properties, JdbcTemplate jdbc, AuditService audit, PlatformTransactionManager txManager) {
        this.messages = messages;
        this.provider = provider;
        this.invoices = invoices;
        this.documents = documents;
        this.customers = customers;
        this.settings = settings;
        this.businessContext = businessContext;
        this.idempotency = idempotency;
        this.jobs = jobs;
        this.props = properties.whatsapp();
        this.jdbc = jdbc;
        this.audit = audit;
        this.tx = new TransactionTemplate(txManager);
    }

    public List<WhatsAppMessage> forInvoice(UUID invoiceId) {
        return messages.findByInvoiceIdOrderByCreatedAtDesc(invoiceId);
    }

    /** Queues an invoice PDF for WhatsApp delivery. Idempotent per Idempotency-Key. */
    @Transactional
    public WhatsAppMessage sendInvoice(UUID invoiceId, String idempotencyKey) {
        UUID id = idempotency.execute("whatsapp.invoice:" + invoiceId, CurrentUser.id(), idempotencyKey, () -> queueInvoice(invoiceId).getId());
        return messages.findById(id).orElseThrow();
    }

    private WhatsAppMessage queueInvoice(UUID invoiceId) {
        BusinessSettings s = settings.settings();
        if (!s.isWhatsappEnabled()) {
            throw new BusinessException(ErrorCode.PROVIDER_UNAVAILABLE, "WhatsApp delivery is disabled in settings");
        }
        Invoice invoice = invoices.get(invoiceId);
        if (!invoice.getStatus().isPosted()) {
            throw new BusinessException(ErrorCode.INVOICE_INVALID_STATUS, "Only generated invoices can be sent");
        }
        Customer customer = customers.get(invoice.getCustomerId());
        documents.storedPdf(invoice);
        WhatsAppMessage m = new WhatsAppMessage();
        m.setBusinessId(businessContext.businessId());
        m.setInvoiceId(invoiceId);
        m.setCustomerId(customer.getId());
        m.setMessageType("INVOICE");
        m.setRecipientNumber(customer.getMobileNumber());
        m.setProvider(provider.name());
        m.setTemplateId(s.getWhatsappInvoiceTemplate());
        m.setRequestedBy(CurrentUser.idIfPresent().orElse(null));
        messages.saveAndFlush(m);
        audit.record(AuditAction.INVOICE_SENT, "INVOICE", invoiceId, null, Map.of("channel", "WHATSAPP", "messageId", m.getId()));
        UUID messageId = m.getId();
        jobs.afterCommit("whatsapp-send", () -> dispatch(messageId));
        return m;
    }

    /** Manual retry of a failed message. */
    @Transactional
    public WhatsAppMessage retry(UUID messageId) {
        WhatsAppMessage m = messages.findById(messageId).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Message"));
        if (m.getStatus() != WhatsAppMessage.Status.FAILED) {
            throw new BusinessException(ErrorCode.CONFLICT, "Only failed messages can be retried");
        }
        m.setStatus(WhatsAppMessage.Status.QUEUED);
        m.setNextRetryAt(null);
        m.setFailureReason(null);
        jobs.afterCommit("whatsapp-send", () -> dispatch(messageId));
        return m;
    }

    /** Delivers one message. Runs outside the request; safe to call repeatedly. */
    public void dispatch(UUID messageId) {
        Optional<SendJob> job = tx.execute(s -> {
            WhatsAppMessage m = messages.findForUpdate(messageId).orElse(null);
            if (m == null || (m.getStatus() != WhatsAppMessage.Status.QUEUED && m.getStatus() != WhatsAppMessage.Status.FAILED)) {
                return Optional.<SendJob>empty();
            }
            m.setStatus(WhatsAppMessage.Status.SENDING);
            Invoice invoice = invoices.get(m.getInvoiceId());
            byte[] pdf = documents.storedPdf(invoice);
            return Optional.of(new SendJob(m.getRecipientNumber(), m.getTemplateId(), pdf,
                    invoice.getInvoiceNumber().replace('/', '-') + ".pdf",
                    "Invoice " + invoice.getInvoiceNumber() + " for Rs. " + invoice.getGrandTotal(), invoice.getId()));
        });
        if (job == null || job.isEmpty()) {
            return;
        }
        SendJob j = job.get();
        try {
            String providerId = provider.sendDocument(j.recipient(), j.template(), j.pdf(), j.fileName(), j.caption());
            tx.executeWithoutResult(s -> messages.findForUpdate(messageId).ifPresent(m -> {
                m.setProviderMessageId(providerId);
                if (m.getStatus().rank() < WhatsAppMessage.Status.SENT.rank() || m.getStatus() == WhatsAppMessage.Status.FAILED) {
                    m.setStatus(WhatsAppMessage.Status.SENT);
                }
                m.setSentAt(Instant.now());
                m.setFailureReason(null);
                m.setNextRetryAt(null);
            }));
            invoices.markSent(j.invoiceId());
        } catch (ProviderException e) {
            tx.executeWithoutResult(s -> messages.findForUpdate(messageId).ifPresent(m -> {
                m.setStatus(WhatsAppMessage.Status.FAILED);
                m.setFailedAt(Instant.now());
                m.setFailureReason(e.getMessage());
                m.setRetryCount(m.getRetryCount() + 1);
                if (e.retryable() && m.getRetryCount() < props.maxRetries()) {
                    m.setNextRetryAt(Instant.now().plus(backoff(m.getRetryCount())));
                } else {
                    m.setNextRetryAt(null);
                }
            }));
            log.warn("WhatsApp send {} failed (retryable={}): {}", messageId, e.retryable(), e.getMessage());
        }
    }

    /** Exponential backoff with full jitter. */
    Duration backoff(int attempt) {
        long base = props.retryBaseDelay().toMillis() * (1L << Math.min(attempt - 1, 10));
        return Duration.ofMillis(base / 2 + ThreadLocalRandom.current().nextLong(base / 2 + 1));
    }

    /** Sweeper: retries due messages and resumes anything left QUEUED/SENDING by a restart. */
    @Scheduled(fixedDelayString = "PT30S", initialDelayString = "PT30S")
    public void retryDue() {
        // Sweeps every tenant (platform read), then delivers each message inside its own tenant (§0B.3).
        List<Map<String, Object>> due = TenantContext.callAsPlatform(() -> jdbc.queryForList("""
                SELECT id, business_id FROM whatsapp_messages
                WHERE (status = 'FAILED' AND next_retry_at IS NOT NULL AND next_retry_at <= now())
                   OR (status IN ('QUEUED','SENDING') AND updated_at < now() - interval '2 minutes')
                ORDER BY queued_at LIMIT 50
                """));
        for (Map<String, Object> row : due) {
            UUID id = (UUID) row.get("id");
            TenantContext.runInTenant((UUID) row.get("business_id"), () -> {
                tx.executeWithoutResult(s -> messages.findForUpdate(id).ifPresent(m -> {
                    if (m.getStatus() == WhatsAppMessage.Status.SENDING) {
                        m.setStatus(WhatsAppMessage.Status.QUEUED);
                    }
                }));
                dispatch(id);
            });
        }
    }

    /** Signed provider status callbacks; duplicate and out-of-order events are ignored. */
    public int handleWebhook(String payload, String signature) {
        boolean valid = provider.verifyWebhookSignature(payload, signature);
        List<StatusEvent> events;
        try {
            events = provider.parseStatusEvents(payload);
        } catch (RuntimeException e) {
            throw BusinessException.validation("body", "Unreadable webhook payload");
        }
        if (!valid) {
            throw new BusinessException(ErrorCode.WEBHOOK_SIGNATURE_INVALID, "Invalid webhook signature");
        }
        int applied = 0;
        for (StatusEvent e : events) {
            // The provider knows nothing about tenants: find the message's tenant first (platform lookup).
            UUID tenant = TenantContext.callAsPlatform(() -> jdbc.queryForList(
                    "SELECT business_id FROM whatsapp_messages WHERE provider = ? AND provider_message_id = ?", UUID.class,
                    provider.name(), e.providerMessageId())).stream().findFirst().orElse(null);
            java.util.function.Supplier<Boolean> work = () -> tx.execute(s -> {
                int inserted = jdbc.update("""
                        INSERT INTO whatsapp_webhook_events (id, provider, event_id, signature_valid, payload, received_at)
                        VALUES (?, ?, ?, TRUE, ?, ?) ON CONFLICT (provider, event_id) DO NOTHING
                        """, UUID.randomUUID(), provider.name(), e.eventId(), payload, Timestamp.from(Instant.now()));
                if (inserted == 0) {
                    return false;
                }
                return messages.findByProviderMessageId(provider.name(), e.providerMessageId()).map(m -> apply(m, e)).orElse(false);
            });
            Boolean ok = tenant == null ? TenantContext.callAsPlatform(work) : TenantContext.callInTenant(tenant, work);
            if (Boolean.TRUE.equals(ok)) {
                applied++;
            }
        }
        return applied;
    }

    private boolean apply(WhatsAppMessage m, StatusEvent e) {
        WhatsAppMessage.Status next;
        try {
            next = WhatsAppMessage.Status.valueOf(e.status().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return false;
        }
        if (next != WhatsAppMessage.Status.FAILED && next.rank() <= m.getStatus().rank()) {
            return false;
        }
        m.setStatus(next);
        m.setLastWebhookEventId(e.eventId());
        Instant now = Instant.now();
        switch (next) {
            case DELIVERED -> m.setDeliveredAt(now);
            case READ -> m.setReadAt(now);
            case FAILED -> {
                m.setFailedAt(now);
                m.setFailureReason(e.failureReason());
            }
            default -> {
            }
        }
        return true;
    }

    private record SendJob(String recipient, String template, byte[] pdf, String fileName, String caption, UUID invoiceId) {
    }

    public interface WhatsAppMessageRepository extends JpaRepository<WhatsAppMessage, UUID> {
        List<WhatsAppMessage> findByInvoiceIdOrderByCreatedAtDesc(UUID invoiceId);

        @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT m FROM WhatsAppMessage m WHERE m.id = :id")
        Optional<WhatsAppMessage> findForUpdate(@Param("id") UUID id);

        @Query("SELECT m FROM WhatsAppMessage m WHERE m.provider = :provider AND m.providerMessageId = :providerMessageId")
        Optional<WhatsAppMessage> findByProviderMessageId(@Param("provider") String provider, @Param("providerMessageId") String providerMessageId);
    }
}
