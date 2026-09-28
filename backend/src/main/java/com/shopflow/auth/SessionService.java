package com.shopflow.auth;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Session revocation used by logout, account deactivation/blocking and refresh-token reuse detection.
 */
@Service
public class SessionService {

    private final UserSessionRepository sessions;
    private final RefreshTokenRepository refreshTokens;
    private final AuditService audit;

    SessionService(UserSessionRepository sessions, RefreshTokenRepository refreshTokens, AuditService audit) {
        this.sessions = sessions;
        this.refreshTokens = refreshTokens;
        this.audit = audit;
    }

    @Transactional
    public void revokeAllForUser(UUID userId, String reason) {
        Instant now = Instant.now();
        for (UserSession session : sessions.findByUserIdAndRevokedAtIsNull(userId)) {
            session.revoke(reason);
            refreshTokens.revokeAllForSession(session.getId(), now);
        }
        audit.record(AuditAction.SESSION_REVOKED, "USER", userId, null, java.util.Map.of("reason", reason));
    }

    @Transactional
    public void revokeSession(UUID sessionId, String reason) {
        sessions.findById(sessionId).ifPresent(session -> {
            session.revoke(reason);
            refreshTokens.revokeAllForSession(sessionId, Instant.now());
        });
    }
}
