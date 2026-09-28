package com.shopflow.common.idempotency;

import com.shopflow.common.error.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Makes retry-prone operations (order creation, payment creation, invoice generation, WhatsApp sends) safe to repeat.
 * The key row is inserted in the caller's transaction, so a concurrent duplicate blocks on the unique index and then
 * sees the committed resource id.
 */
@Service
public class IdempotencyService {

    private final JdbcTemplate jdbc;

    public IdempotencyService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Runs {@code action} once per (scope, user, key). Returns the resource id created by the first successful call.
     * When {@code key} is blank the action simply runs.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public UUID execute(String scope, UUID userId, String key, Supplier<UUID> action) {
        if (key == null || key.isBlank()) {
            return action.get();
        }
        if (key.length() > 120) {
            throw BusinessException.validation("Idempotency-Key", "Idempotency-Key must be at most 120 characters");
        }
        String scopedKey = (userId == null ? "anon" : userId) + ":" + key;
        Optional<UUID> existing = find(scope, scopedKey);
        if (existing.isPresent()) {
            return existing.get();
        }
        UUID keyId = UUID.randomUUID();
        int inserted = jdbc.update("""
                INSERT INTO idempotency_keys (id, scope, idem_key, user_id, created_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (scope, idem_key) DO NOTHING
                """, keyId, scope, scopedKey, userId, Timestamp.from(Instant.now()));
        if (inserted == 0) {
            return find(scope, scopedKey).orElseThrow(() -> new IllegalStateException("Idempotency key race"));
        }
        UUID resourceId = action.get();
        jdbc.update("UPDATE idempotency_keys SET resource_id = ? WHERE id = ?", resourceId, keyId);
        return resourceId;
    }

    private Optional<UUID> find(String scope, String scopedKey) {
        List<UUID> ids = jdbc.queryForList("SELECT resource_id FROM idempotency_keys WHERE scope = ? AND idem_key = ? AND resource_id IS NOT NULL",
                UUID.class, scope, scopedKey);
        return ids.stream().findFirst();
    }
}
