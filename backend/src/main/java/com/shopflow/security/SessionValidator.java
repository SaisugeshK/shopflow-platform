package com.shopflow.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Rejects access tokens whose session was revoked (logout, refresh-token reuse, account block, tenant suspension)
 * before expiry. Runs after the request's tenant is set, so the users/businesses rows are read under RLS.
 */
@Component
public class SessionValidator {

    private final JdbcTemplate jdbc;

    public SessionValidator(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean isActive(UUID sessionId, UUID subjectId, boolean platform) {
        List<Boolean> rows = platform
                ? jdbc.queryForList("""
                        SELECT (s.revoked_at IS NULL AND a.status = 'ACTIVE')
                        FROM user_sessions s JOIN platform_admins a ON a.id = s.platform_admin_id
                        WHERE s.id = ? AND s.platform_admin_id = ?
                        """, Boolean.class, sessionId, subjectId)
                : jdbc.queryForList("""
                        SELECT (s.revoked_at IS NULL AND u.status = 'ACTIVE' AND b.status = 'ACTIVE')
                        FROM user_sessions s JOIN users u ON u.id = s.user_id JOIN businesses b ON b.id = u.business_id
                        WHERE s.id = ? AND s.user_id = ?
                        """, Boolean.class, sessionId, subjectId);
        return !rows.isEmpty() && Boolean.TRUE.equals(rows.getFirst());
    }

    /** A support session: a platform admin's session bound to one (still active) tenant. */
    public boolean isSupportActive(UUID sessionId, UUID platformAdminId, UUID tenantId) {
        List<Boolean> rows = jdbc.queryForList("""
                SELECT (s.revoked_at IS NULL AND a.status = 'ACTIVE' AND b.status = 'ACTIVE')
                FROM user_sessions s JOIN platform_admins a ON a.id = s.platform_admin_id JOIN businesses b ON b.id = s.business_id
                WHERE s.id = ? AND s.platform_admin_id = ? AND s.business_id = ?
                """, Boolean.class, sessionId, platformAdminId, tenantId);
        return !rows.isEmpty() && Boolean.TRUE.equals(rows.getFirst());
    }
}
