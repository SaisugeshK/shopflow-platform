package com.shopflow.audit;

import com.shopflow.business.BusinessContext;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.users.UserRepositories.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/audit-logs")
@Tag(name = "Audit", description = "Immutable audit trail")
@SecurityRequirement(name = "bearerAuth")
@PreAuthorize("hasAuthority('AUDIT_READ')")
public class AuditController {

    private final AuditLogRepository repository;
    private final UserRepository users;
    private final BusinessContext businessContext;

    public AuditController(AuditLogRepository repository, UserRepository users, BusinessContext businessContext) {
        this.repository = repository;
        this.users = users;
        this.businessContext = businessContext;
    }

    @GetMapping
    @Operation(summary = "Search audit logs", description = "Filter by action, entity type/id, actor and date range; newest first.")
    public ApiResponse<List<AuditResponse>> list(@RequestParam(required = false) AuditAction action,
                                                 @RequestParam(required = false) String entityType,
                                                 @RequestParam(required = false) UUID entityId,
                                                 @RequestParam(required = false) UUID actorUserId,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                 @RequestParam(required = false) Integer page,
                                                 @RequestParam(required = false) Integer pageSize) {
        Specification<AuditLog> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (action != null) {
                p.add(cb.equal(root.get("action"), action));
            }
            if (entityType != null && !entityType.isBlank()) {
                p.add(cb.equal(root.get("entityType"), entityType.trim().toUpperCase()));
            }
            if (entityId != null) {
                p.add(cb.equal(root.get("entityId"), entityId));
            }
            if (actorUserId != null) {
                p.add(cb.equal(root.get("actorUserId"), actorUserId));
            }
            if (from != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from.atStartOfDay(businessContext.zone()).toInstant()));
            }
            if (to != null) {
                p.add(cb.lessThan(root.get("createdAt"), to.plusDays(1).atStartOfDay(businessContext.zone()).toInstant()));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        Map<UUID, String> names = new HashMap<>();
        var pageable = PageQuery.of(page, pageSize, null, Map.of(), Sort.by(Sort.Direction.DESC, "createdAt"));
        return ApiResponse.page(repository.findAll(spec, pageable), a -> toResponse(a, names));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get an audit record")
    public ApiResponse<AuditResponse> get(@PathVariable UUID id) {
        return ApiResponse.ok(toResponse(repository.findById(id)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Audit record")), new HashMap<>()));
    }

    private AuditResponse toResponse(AuditLog a, Map<UUID, String> names) {
        String actor = a.getActorUserId() == null ? null
                : names.computeIfAbsent(a.getActorUserId(), id -> users.findById(id).map(u -> u.getFullName()).orElse("Unknown"));
        return new AuditResponse(a.getId(), a.getAction().name(), a.getEntityType(), a.getEntityId(), a.getActorUserId(), actor,
                a.getActorRole(), a.getOldValue(), a.getNewValue(), a.getIpAddress(), a.getUserAgent(), a.getRequestId(), a.getCreatedAt());
    }

    public record AuditResponse(UUID id, String action, String entityType, UUID entityId, UUID actorUserId, String actorName,
                                String actorRole, String oldValue, String newValue, String ipAddress, String userAgent,
                                String requestId, Instant createdAt) {
    }
}
