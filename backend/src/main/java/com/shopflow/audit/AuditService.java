package com.shopflow.audit;

import com.shopflow.common.web.RequestContext;
import com.shopflow.security.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Writes audit records in the caller's transaction so the audit trail commits (or rolls back) with the change.
 * Values are serialised to JSON and sensitive fields are redacted.
 */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);
    private static final Set<String> REDACT_EXACT = Set.of("otp", "otpHash", "accessToken", "refreshToken",
            "registrationToken", "token", "password", "secret", "signature", "webhookSecret", "providerKey");
    private static final Pattern REDACT_PATTERN = Pattern.compile("(?i).*(secret|token|password|otp).*");
    private static final Set<String> MASK_TAIL = Set.of("accountNumber", "bankAccountNumber");

    private final AuditLogRepository repository;
    private final ObjectMapper objectMapper;

    public AuditService(AuditLogRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void record(AuditAction action, String entityType, UUID entityId, Object oldValue, Object newValue) {
        recordAs(CurrentUser.idIfPresent().orElse(null), CurrentUser.primaryRole(), action, entityType, entityId, oldValue, newValue);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void recordAs(UUID actorUserId, String actorRole, AuditAction action, String entityType, UUID entityId,
                         Object oldValue, Object newValue) {
        repository.save(new AuditLog(actorUserId, actorRole, action, entityType, entityId,
                toJson(oldValue), toJson(newValue), RequestContext.clientIp(), RequestContext.userAgent(),
                RequestContext.requestId()));
    }

    /** Audit that must survive a rollback of the surrounding business transaction (e.g. failed logins). */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordIndependently(UUID actorUserId, String actorRole, AuditAction action, String entityType,
                                    UUID entityId, Object newValue) {
        recordAs(actorUserId, actorRole, action, entityType, entityId, null, newValue);
    }

    String toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            JsonNode node = objectMapper.valueToTree(value);
            redact(node);
            String json = objectMapper.writeValueAsString(node);
            return json.length() > 20_000 ? json.substring(0, 20_000) : json;
        } catch (RuntimeException e) {
            log.warn("Could not serialise audit value of type {}", value.getClass().getSimpleName());
            return "{\"unserializable\":true}";
        }
    }

    private void redact(JsonNode node) {
        if (node instanceof ObjectNode obj) {
            Iterator<Map.Entry<String, JsonNode>> fields = obj.properties().iterator();
            java.util.List<String> redactKeys = new java.util.ArrayList<>();
            java.util.List<String> maskKeys = new java.util.ArrayList<>();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                String name = field.getKey();
                if (REDACT_EXACT.contains(name) || REDACT_PATTERN.matcher(name).matches()) {
                    redactKeys.add(name);
                } else if (MASK_TAIL.contains(name) && field.getValue().isString()) {
                    maskKeys.add(name);
                } else {
                    redact(field.getValue());
                }
            }
            redactKeys.forEach(k -> obj.put(k, "[REDACTED]"));
            maskKeys.forEach(k -> {
                String v = obj.get(k).asString();
                obj.put(k, v.length() <= 4 ? "****" : "****" + v.substring(v.length() - 4));
            });
        } else if (node != null && node.isArray()) {
            node.forEach(this::redact);
        }
    }
}
