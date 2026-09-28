package com.shopflow.users;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.auth.SessionService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.security.CurrentUser;
import com.shopflow.security.Roles;
import com.shopflow.users.UserRepositories.PermissionRepository;
import com.shopflow.users.UserRepositories.RoleRepository;
import com.shopflow.users.UserRepositories.UserRepository;
import com.shopflow.users.UserDtos.CreateStaffUserRequest;
import com.shopflow.users.UserDtos.UpdateStaffUserRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/**
 * Staff (OWNER/ADMIN) account management and effective-permission resolution. Customer accounts are created
 * through registration or the customer module.
 */
@Service
public class UserService {

    private final UserRepository users;
    private final RoleRepository roles;
    private final PermissionRepository permissions;
    private final JdbcTemplate jdbc;
    private final SessionService sessionService;
    private final AuditService audit;
    private final BusinessContext businessContext;

    public UserService(UserRepository users, RoleRepository roles, PermissionRepository permissions, JdbcTemplate jdbc,
                       SessionService sessionService, AuditService audit, BusinessContext businessContext) {
        this.users = users;
        this.roles = roles;
        this.permissions = permissions;
        this.jdbc = jdbc;
        this.sessionService = sessionService;
        this.audit = audit;
        this.businessContext = businessContext;
    }

    @Transactional(readOnly = true)
    public Set<String> effectivePermissions(User user) {
        Set<String> codes = new TreeSet<>();
        user.getRoles().forEach(r -> r.getPermissions().forEach(p -> codes.add(p.getCode())));
        codes.addAll(extraPermissions(user.getId()));
        return codes;
    }

    public List<String> extraPermissions(UUID userId) {
        return jdbc.queryForList("""
                SELECT p.code FROM user_permissions up JOIN permissions p ON p.id = up.permission_id
                WHERE up.user_id = ? ORDER BY p.code
                """, String.class, userId);
    }

    public User get(UUID id) {
        return users.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "User"));
    }

    public java.util.Optional<User> findByMobile(String mobileNumber) {
        return users.findByMobileNumber(mobileNumber);
    }

    @Transactional(readOnly = true)
    public Page<User> searchStaff(String q, User.UserStatus status, Pageable pageable) {
        return users.search(List.of(Roles.OWNER, Roles.ADMIN), blankToNull(q), status, pageable);
    }

    public List<User> activeStaff() {
        return users.findActiveByRoles(List.of(Roles.OWNER, Roles.ADMIN));
    }

    public List<Permission> allPermissions() {
        return permissions.findAllByOrderByCodeAsc();
    }

    /** Owners create Admin users. Owner accounts are provisioned out-of-band, never through the API. */
    @Transactional
    public User createAdmin(CreateStaffUserRequest request) {
        String mobile = MobileNumbers.normalize(request.mobileNumber());
        if (users.existsByMobileNumber(mobile)) {
            throw new BusinessException(ErrorCode.CONFLICT, "A user with this mobile number already exists");
        }
        User user = new User();
        user.setBusinessId(businessContext.businessId());
        user.setMobileNumber(mobile);
        user.setFullName(request.fullName().trim());
        user.setEmail(blankToNull(request.email()));
        user.setStatus(User.UserStatus.ACTIVE);
        user.setCreatedBy(CurrentUser.id());
        user.getRoles().add(roles.findByCode(Roles.ADMIN).orElseThrow());
        users.save(user);
        if (request.extraPermissions() != null && !request.extraPermissions().isEmpty()) {
            replaceExtraPermissions(user, request.extraPermissions());
        }
        audit.record(AuditAction.ADMIN_CREATED, "USER", user.getId(), null,
                Map.of("fullName", user.getFullName(), "mobile", MobileNumbers.mask(mobile)));
        return user;
    }

    @Transactional
    public User updateStaff(UUID id, UpdateStaffUserRequest request) {
        User user = get(id);
        guardManageable(user);
        Map<String, Object> before = Map.of("fullName", user.getFullName(), "email", String.valueOf(user.getEmail()));
        if (request.fullName() != null && !request.fullName().isBlank()) {
            user.setFullName(request.fullName().trim());
        }
        if (request.email() != null) {
            user.setEmail(blankToNull(request.email()));
        }
        user.setUpdatedBy(CurrentUser.id());
        audit.record(AuditAction.ADMIN_UPDATED, "USER", id, before,
                Map.of("fullName", user.getFullName(), "email", String.valueOf(user.getEmail())));
        return user;
    }

    @Transactional
    public User setActive(UUID id, boolean active) {
        User user = get(id);
        guardManageable(user);
        if (user.getId().equals(CurrentUser.id())) {
            throw new BusinessException(ErrorCode.CONFLICT, "You cannot change your own account status");
        }
        user.setStatus(active ? User.UserStatus.ACTIVE : User.UserStatus.INACTIVE);
        user.setUpdatedBy(CurrentUser.id());
        if (!active) {
            sessionService.revokeAllForUser(user.getId(), "DEACTIVATED");
        }
        audit.record(active ? AuditAction.ADMIN_ACTIVATED : AuditAction.ADMIN_DEACTIVATED, "USER", id, null,
                Map.of("status", user.getStatus().name()));
        return user;
    }

    @Transactional
    public List<String> setExtraPermissions(UUID id, List<String> codes) {
        User user = get(id);
        guardManageable(user);
        List<String> before = extraPermissions(id);
        replaceExtraPermissions(user, codes);
        // Force the user to pick up the new permission set on next token refresh.
        audit.record(AuditAction.PERMISSIONS_CHANGED, "USER", id, Map.of("extraPermissions", before), Map.of("extraPermissions", codes));
        return extraPermissions(id);
    }

    private void replaceExtraPermissions(User user, List<String> codes) {
        List<Permission> found = permissions.findByCodeIn(codes);
        if (found.size() != new java.util.HashSet<>(codes).size()) {
            throw BusinessException.validation("permissions", "Unknown permission code");
        }
        if (found.stream().anyMatch(p -> p.getCode().equals("CUSTOMER_SELF") || p.getCode().equals("CATALOG_BROWSE"))) {
            throw BusinessException.validation("permissions", "Customer permissions cannot be granted to staff");
        }
        jdbc.update("DELETE FROM user_permissions WHERE user_id = ?", user.getId());
        Timestamp now = Timestamp.from(Instant.now());
        for (Permission p : found) {
            jdbc.update("INSERT INTO user_permissions (user_id, permission_id, granted_by, granted_at) VALUES (?, ?, ?, ?)",
                    user.getId(), p.getId(), CurrentUser.id(), now);
        }
    }

    /** Admins (even with USER_MANAGE) can never manage the Owner (§3.2). */
    private void guardManageable(User target) {
        if (target.hasRole(Roles.CUSTOMER)) {
            throw new BusinessException(ErrorCode.CONFLICT, "Customer accounts are managed from the Customers module");
        }
        if (target.hasRole(Roles.OWNER) && !CurrentUser.isOwner()) {
            throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, "Only the Owner can change the Owner account");
        }
        if (target.hasRole(Roles.OWNER)) {
            throw new BusinessException(ErrorCode.CONFLICT, "The Owner account cannot be changed through the API");
        }
    }

    @Transactional
    public void recordLogin(User user) {
        user.setLastLoginAt(Instant.now());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
