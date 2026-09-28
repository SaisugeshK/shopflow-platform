package com.shopflow.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Rejects access tokens whose session was revoked (logout, refresh-token reuse, account block) before expiry.
 */
@Component
public class SessionValidator {

    private final JdbcTemplate jdbc;

    public SessionValidator(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean isActive(UUID sessionId, UUID userId) {
        List<Boolean> rows = jdbc.queryForList("""
                SELECT (s.revoked_at IS NULL AND u.status = 'ACTIVE')
                FROM user_sessions s JOIN users u ON u.id = s.user_id
                WHERE s.id = ? AND s.user_id = ?
                """, Boolean.class, sessionId, userId);
        return !rows.isEmpty() && Boolean.TRUE.equals(rows.getFirst());
    }
}
