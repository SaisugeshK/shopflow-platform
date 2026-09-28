package com.shopflow.notifications;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
@Tag(name = "Notifications", description = "In-app notifications for the signed-in user")
@SecurityRequirement(name = "bearerAuth")
public class NotificationController {

    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "List my notifications")
    public ApiResponse<List<NotificationResponse>> list(@RequestParam(defaultValue = "false") boolean unreadOnly,
                                                        @RequestParam(required = false) Integer page,
                                                        @RequestParam(required = false) Integer pageSize) {
        return ApiResponse.page(service.list(CurrentUser.id(), unreadOnly, PageQuery.of(page, pageSize)), NotificationResponse::of);
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Count my unread notifications")
    public ApiResponse<Map<String, Long>> unreadCount() {
        return ApiResponse.ok(Map.of("unread", service.unreadCount(CurrentUser.id())));
    }

    @PostMapping("/{id}/read")
    @Operation(summary = "Mark a notification as read")
    public ApiResponse<Void> markRead(@PathVariable UUID id) {
        service.markRead(CurrentUser.id(), id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/read-all")
    @Operation(summary = "Mark all my notifications as read")
    public ApiResponse<Map<String, Integer>> markAllRead() {
        return ApiResponse.ok(Map.of("updated", service.markAllRead(CurrentUser.id())));
    }

    public record NotificationResponse(UUID id, String type, String title, String body, String entityType,
                                       UUID entityId, boolean read, Instant createdAt) {
        static NotificationResponse of(NotificationEvent e) {
            return new NotificationResponse(e.getId(), e.getEventType(), e.getTitle(), e.getBody(), e.getEntityType(),
                    e.getEntityId(), e.getReadAt() != null, e.getCreatedAt());
        }
    }
}
