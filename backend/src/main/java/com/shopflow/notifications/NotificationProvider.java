package com.shopflow.notifications;

import java.util.UUID;

/**
 * Outbound channel (push, SMS, email). Business logic never calls a vendor directly (§43).
 */
public interface NotificationProvider {

    NotificationEvent.Channel channel();

    void deliver(UUID recipientUserId, String title, String body);
}
