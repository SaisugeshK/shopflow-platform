package com.shopflow.notifications;

import com.shopflow.business.BusinessSettingsService;
import com.shopflow.users.User;
import com.shopflow.users.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * In-app notifications are persisted in the caller's transaction; other channels go through
 * {@link NotificationProvider}s and never break the business operation when they fail.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository repository;
    private final UserService users;
    private final List<NotificationProvider> providers;
    private final BusinessSettingsService settings;

    public NotificationService(NotificationRepository repository, UserService users, List<NotificationProvider> providers,
                               BusinessSettingsService settings) {
        this.repository = repository;
        this.users = users;
        this.providers = providers;
        this.settings = settings;
    }

    @Transactional
    public void notifyUser(UUID userId, String type, String title, String body, String entityType, UUID entityId) {
        repository.save(new NotificationEvent(userId, NotificationEvent.Channel.IN_APP, type, title, body, entityType, entityId));
        if (settings.settings().isNotifyPush()) {
            providers.stream().filter(p -> p.channel() == NotificationEvent.Channel.PUSH).findFirst()
                    .ifPresent(p -> safeDeliver(p, userId, title, body));
        }
    }

    @Transactional
    public void notifyStaff(String type, String title, String body, String entityType, UUID entityId) {
        for (User staff : users.activeStaff()) {
            notifyUser(staff.getId(), type, title, body, entityType, entityId);
        }
    }

    private void safeDeliver(NotificationProvider provider, UUID userId, String title, String body) {
        try {
            provider.deliver(userId, title, body);
        } catch (RuntimeException e) {
            log.warn("Notification delivery via {} failed: {}", provider.channel(), e.getMessage());
        }
    }

    public Page<NotificationEvent> list(UUID userId, boolean unreadOnly, Pageable pageable) {
        return unreadOnly ? repository.findByRecipientUserIdAndReadAtIsNullOrderByCreatedAtDesc(userId, pageable)
                : repository.findByRecipientUserIdOrderByCreatedAtDesc(userId, pageable);
    }

    public long unreadCount(UUID userId) {
        return repository.countByRecipientUserIdAndReadAtIsNull(userId);
    }

    @Transactional
    public void markRead(UUID userId, UUID id) {
        Optional<NotificationEvent> event = repository.findById(id).filter(e -> e.getRecipientUserId().equals(userId));
        event.ifPresent(e -> {
            if (e.getReadAt() == null) {
                e.setReadAt(Instant.now());
            }
        });
    }

    @Transactional
    public int markAllRead(UUID userId) {
        return repository.markAllRead(userId, Instant.now());
    }

    public interface NotificationRepository extends JpaRepository<NotificationEvent, UUID> {
        Page<NotificationEvent> findByRecipientUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

        Page<NotificationEvent> findByRecipientUserIdAndReadAtIsNullOrderByCreatedAtDesc(UUID userId, Pageable pageable);

        long countByRecipientUserIdAndReadAtIsNull(UUID userId);

        @Modifying
        @Query("UPDATE NotificationEvent n SET n.readAt = :now WHERE n.recipientUserId = :userId AND n.readAt IS NULL")
        int markAllRead(@Param("userId") UUID userId, @Param("now") Instant now);
    }
}
