package com.shopflow.notifications;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Stage 1 stand-in for push/SMS/email: records that a delivery would happen, sends nothing.
 */
@Component
public class LoggingNotificationProvider implements NotificationProvider {

    private static final Logger log = LoggerFactory.getLogger(LoggingNotificationProvider.class);

    @Override
    public NotificationEvent.Channel channel() {
        return NotificationEvent.Channel.PUSH;
    }

    @Override
    public void deliver(UUID recipientUserId, String title, String body) {
        log.info("[MOCK PUSH] to user {}: {}", recipientUserId, title);
    }
}
