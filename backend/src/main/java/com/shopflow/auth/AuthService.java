package com.shopflow.auth;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.auth.AuthDtos.AuthResponse;
import com.shopflow.auth.AuthDtos.BusinessInfo;
import com.shopflow.auth.AuthDtos.CustomerInfo;
import com.shopflow.auth.AuthDtos.MeResponse;
import com.shopflow.auth.AuthDtos.SelectTenantBody;
import com.shopflow.auth.AuthDtos.TenantChoice;
import com.shopflow.auth.MembershipService.Membership;
import com.shopflow.business.Business;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessRepository;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Hashing;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.config.AppProperties;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerDtos.RegistrationRequest;
import com.shopflow.customers.CustomerService;
import com.shopflow.platform.PlatformAdmin;
import com.shopflow.platform.PlatformAdminRepository;
import com.shopflow.security.JwtService;
import com.shopflow.security.JwtService.IssuedToken;
import com.shopflow.security.Roles;
import com.shopflow.tenancy.TenantContext;
import com.shopflow.tenancy.TenantModules;
import com.shopflow.users.User;
import com.shopflow.users.UserService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Passwordless mobile + OTP authentication (§4, §5, §108) across tenants (§0B.4). A mobile number is one identity;
 * each users row is its membership in one tenant. After OTP the number enters its only tenant directly, picks one of
 * several with a selection token, or registers as a customer of the tenant whose join link it used. The role always
 * comes from the account, never the client.
 */
@Service
public class AuthService {

    /** Permissions on a platform (SUPER_ADMIN) token. */
    static final Set<String> PLATFORM_PERMISSIONS = Set.of("PLATFORM_MANAGE");

    private final OtpService otpService;
    private final UserService userService;
    private final CustomerService customerService;
    private final JwtService jwtService;
    private final UserSessionRepository sessions;
    private final RefreshTokenRepository refreshTokens;
    private final SessionService sessionService;
    private final AuditService audit;
    private final AppProperties properties;
    private final TransactionTemplate tx;
    private final BusinessContext businessContext;
    private final MembershipService membershipService;
    private final BusinessRepository businesses;
    private final PlatformAdminRepository platformAdmins;
    private final TenantModules modules;
    private final com.shopflow.suppliers.SupplierRepositories.SupplierRepository supplierRepository;

    public AuthService(OtpService otpService, UserService userService, CustomerService customerService,
                       JwtService jwtService, UserSessionRepository sessions, RefreshTokenRepository refreshTokens,
                       SessionService sessionService, AuditService audit, AppProperties properties,
                       PlatformTransactionManager txManager, BusinessContext businessContext,
                       MembershipService membershipService, BusinessRepository businesses,
                       PlatformAdminRepository platformAdmins, TenantModules modules,
                       com.shopflow.suppliers.SupplierRepositories.SupplierRepository supplierRepository) {
        this.modules = modules;
        this.supplierRepository = supplierRepository;
        this.otpService = otpService;
        this.userService = userService;
        this.customerService = customerService;
        this.jwtService = jwtService;
        this.sessions = sessions;
        this.refreshTokens = refreshTokens;
        this.sessionService = sessionService;
        this.audit = audit;
        this.properties = properties;
        this.tx = new TransactionTemplate(txManager);
        this.businessContext = businessContext;
        this.membershipService = membershipService;
        this.businesses = businesses;
        this.platformAdmins = platformAdmins;
        String refreshSecret = properties.security().jwtRefreshSecret();
        if (refreshSecret == null || refreshSecret.length() < 32) {
            throw new IllegalStateException("JWT_REFRESH_SECRET must be set and at least 32 characters long");
        }
    }

    public AuthResult verifyOtp(String rawMobile, UUID requestId, String otp, String tenantCode, String deviceInfo, String ip) {
        String mobile;
        try {
            mobile = otpService.verify(rawMobile, requestId, otp, ip);
        } catch (BusinessException e) {
            audit.recordIndependently(null, null, AuditAction.LOGIN_FAILED, "AUTH", null,
                    Map.of("mobile", MobileNumbers.mask(safeNormalize(rawMobile)), "reason", e.code().name()));
            throw e;
        }
        List<Membership> memberships = membershipService.memberships(mobile);

        // Arrived through a tenant's join link: enter that tenant, or register there.
        if (tenantCode != null && !tenantCode.isBlank()) {
            Business target = activeTenantByCode(tenantCode.trim().toLowerCase());
            Optional<Membership> member = memberships.stream().filter(m -> m.businessId().equals(target.getId())).findFirst();
            return member.isPresent()
                    ? startTenantSession(member.get(), deviceInfo, ip)
                    : registration(mobile, target);
        }

        List<Membership> usable = memberships.stream().filter(Membership::businessActive).toList();
        Optional<PlatformAdmin> admin = membershipService.activeAdmin(mobile);
        int choices = usable.size() + (admin.isPresent() ? 1 : 0);
        if (choices == 0) {
            if (!memberships.isEmpty()) {
                throw new BusinessException(ErrorCode.TENANT_SUSPENDED, "This business account is suspended. Please contact support.");
            }
            String defaultCode = properties.tenancy().defaultTenantCode();
            if (defaultCode == null || defaultCode.isBlank()) {
                throw new BusinessException(ErrorCode.TENANT_JOIN_LINK_REQUIRED,
                        "This number is not registered with any shop. Open the join link your shop shared with you.");
            }
            return registration(mobile, activeTenantByCode(defaultCode));
        }
        if (choices == 1) {
            return admin.isPresent()
                    ? startPlatformSession(admin.get(), deviceInfo, ip)
                    : startTenantSession(usable.getFirst(), deviceInfo, ip);
        }
        IssuedToken selection = jwtService.issueSelectionToken(mobile);
        return new AuthResult(AuthResponse.selection(selection.value(), choices(usable, admin.isPresent())), null, null);
    }

    /** Exchanges a selection token for a session in the chosen tenant (or the platform console). */
    public AuthResult selectTenant(String mobile, SelectTenantBody body, String deviceInfo, String ip) {
        return enter(mobile, body, deviceInfo, ip);
    }

    /** Signed-in switch to another tenant of the same mobile number; the current session ends. */
    public AuthResult switchTenant(UUID subjectId, boolean platform, UUID currentSessionId, SelectTenantBody body,
                                   String deviceInfo, String ip) {
        String mobile = membershipService.mobileOf(subjectId, platform)
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_UNAUTHORIZED, "Authentication required"));
        AuthResult result = enter(mobile, body, deviceInfo, ip);
        if (currentSessionId != null) {
            TenantContext.runAsPlatform(() -> tx.executeWithoutResult(s -> sessionService.revokeSession(currentSessionId, "SWITCHED_TENANT")));
        }
        return result;
    }

    private AuthResult enter(String mobile, SelectTenantBody body, String deviceInfo, String ip) {
        if (body.isPlatform()) {
            PlatformAdmin admin = membershipService.activeAdmin(mobile)
                    .orElseThrow(() -> new BusinessException(ErrorCode.TENANT_NOT_MEMBER, "You do not have access to the platform console"));
            return startPlatformSession(admin, deviceInfo, ip);
        }
        if (body.businessId() == null) {
            throw BusinessException.validation("businessId", "Choose a business");
        }
        Membership membership = membershipService.membership(mobile, body.businessId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TENANT_NOT_MEMBER, "You do not have access to this business"));
        if (!membership.businessActive()) {
            throw new BusinessException(ErrorCode.TENANT_SUSPENDED, "This business account is suspended. Please contact support.");
        }
        return startTenantSession(membership, deviceInfo, ip);
    }

    /** Creates the customer account (PENDING_APPROVAL), in the tenant named by the registration token. */
    public AuthResult register(String verifiedMobile, UUID tenantId, RegistrationRequest request, String deviceInfo, String ip) {
        TenantContext.callAsPlatform(() -> activeTenant(tenantId));
        return TenantContext.callInTenant(tenantId, () -> tx.execute(status -> {
            Customer customer = customerService.register(verifiedMobile, request);
            return startSession(userService.get(customer.getUserId()), deviceInfo, ip);
        }));
    }

    private AuthResult registration(String mobile, Business tenant) {
        IssuedToken registration = jwtService.issueRegistrationToken(mobile, tenant.getId());
        return new AuthResult(AuthResponse.registration(registration.value(), registration.expiresAt(),
                new BusinessInfo(tenant.getId(), tenant.getName(), BusinessContext.logoUrl(tenant.getLogoFileId()))), null, null);
    }

    private AuthResult startTenantSession(Membership membership, String deviceInfo, String ip) {
        if (!membership.businessActive()) {
            throw new BusinessException(ErrorCode.TENANT_SUSPENDED, "This business account is suspended. Please contact support.");
        }
        return TenantContext.callInTenant(membership.businessId(), () -> {
            try {
                return tx.execute(status -> startSession(userService.get(membership.userId()), deviceInfo, ip));
            } catch (BusinessException e) {
                audit.recordIndependently(membership.userId(), membership.role(), AuditAction.LOGIN_FAILED,
                        "USER", membership.userId(), Map.of("reason", e.code().name()));
                throw e;
            }
        });
    }

    /** Runs inside the user's tenant and a transaction. */
    private AuthResult startSession(User user, String deviceInfo, String ip) {
        Optional<Customer> customer = assertCanSignIn(user);
        UserSession session = sessions.save(UserSession.forUser(user.getId(), user.getBusinessId(), truncate(deviceInfo, 300), ip));
        String rawRefresh = Hashing.randomToken(48);
        Instant refreshExpiry = Instant.now().plus(properties.security().refreshTokenTtl());
        refreshTokens.save(new RefreshToken(session.getId(), hashRefresh(rawRefresh), refreshExpiry));
        userService.recordLogin(user);
        audit.recordAs(user.getId(), user.primaryRole(), AuditAction.LOGIN, "USER", user.getId(), null,
                Map.of("sessionId", session.getId()));
        IssuedToken access = accessToken(user, session.getId(), customer);
        return new AuthResult(AuthResponse.session(access.value(), access.expiresAt(), rawRefresh, refreshExpiry,
                me(user, customer)), rawRefresh, refreshExpiry);
    }

    private AuthResult startPlatformSession(PlatformAdmin admin, String deviceInfo, String ip) {
        return TenantContext.callAsPlatform(() -> tx.execute(status -> {
            PlatformAdmin a = platformAdmins.findById(admin.getId()).orElseThrow();
            UserSession session = sessions.save(UserSession.forPlatformAdmin(a.getId(), truncate(deviceInfo, 300), ip));
            String rawRefresh = Hashing.randomToken(48);
            Instant refreshExpiry = Instant.now().plus(properties.security().refreshTokenTtl());
            refreshTokens.save(new RefreshToken(session.getId(), hashRefresh(rawRefresh), refreshExpiry));
            // Not through the versioned entity: simultaneous sign-ins must not conflict.
            platformAdmins.touchLastLogin(a.getId(), Instant.now());
            audit.recordAs(a.getId(), Roles.SUPER_ADMIN, AuditAction.LOGIN, "PLATFORM_ADMIN", a.getId(), null,
                    Map.of("sessionId", session.getId()));
            IssuedToken access = jwtService.issuePlatformToken(a.getId(), PLATFORM_PERMISSIONS, session.getId());
            return new AuthResult(AuthResponse.session(access.value(), access.expiresAt(), rawRefresh, refreshExpiry,
                    platformMe(a)), rawRefresh, refreshExpiry);
        }));
    }

    /**
     * Rotates the refresh token. Presenting an already-rotated token is treated as theft: the whole session is
     * revoked (§5 refresh token rotation).
     */
    public AuthResult refresh(String rawRefresh) {
        if (rawRefresh == null || rawRefresh.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN, "Refresh token is required");
        }
        // Sessions and refresh tokens are identity tables (no RLS); the tenant is known once the session is found.
        Optional<UserSession> found = tx.execute(status -> refreshTokens.findByHashForUpdate(hashRefresh(rawRefresh))
                .flatMap(t -> sessions.findById(t.getSessionId())));
        if (found == null || found.isEmpty()) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN, "Session expired. Please sign in again.");
        }
        UserSession owner = found.get();
        RefreshOutcome outcome = owner.isPlatform()
                ? TenantContext.callAsPlatform(() -> tx.execute(status -> rotate(rawRefresh, true)))
                : TenantContext.callInTenant(owner.getBusinessId(), () -> tx.execute(status -> rotate(rawRefresh, false)));
        if (outcome == null || outcome.result() == null) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_REFRESH_TOKEN, "Session expired. Please sign in again.");
        }
        return outcome.result();
    }

    private RefreshOutcome rotate(String rawRefresh, boolean platform) {
        RefreshToken token = refreshTokens.findByHashForUpdate(hashRefresh(rawRefresh)).orElse(null);
        if (token == null) {
            return RefreshOutcome.failed();
        }
        UserSession session = sessions.findById(token.getSessionId()).orElse(null);
        if (session == null || !session.isActive()) {
            return RefreshOutcome.failed();
        }
        if (token.getRevokedAt() != null) {
            sessionService.revokeSession(session.getId(), "REFRESH_TOKEN_REUSE");
            audit.recordAs(session.subjectId(), null, AuditAction.REFRESH_TOKEN_REUSE, platform ? "PLATFORM_ADMIN" : "USER",
                    session.subjectId(), null, Map.of("sessionId", session.getId()));
            return RefreshOutcome.failed();
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            return RefreshOutcome.failed();
        }
        IssuedToken access;
        MeResponse me;
        if (platform) {
            PlatformAdmin admin = platformAdmins.findById(session.getPlatformAdminId()).filter(PlatformAdmin::isActive).orElse(null);
            if (admin == null) {
                sessionService.revokeSession(session.getId(), "PLATFORM_ADMIN_INACTIVE");
                return RefreshOutcome.failed();
            }
            access = jwtService.issuePlatformToken(admin.getId(), PLATFORM_PERMISSIONS, session.getId());
            me = platformMe(admin);
        } else {
            User user = userService.get(session.getUserId());
            Optional<Customer> customer;
            try {
                activeTenant(user.getBusinessId());
                customer = assertCanSignIn(user);
            } catch (BusinessException e) {
                sessionService.revokeSession(session.getId(), e.code().name());
                return RefreshOutcome.failed();
            }
            access = accessToken(user, session.getId(), customer);
            me = me(user, customer);
        }
        String newRaw = Hashing.randomToken(48);
        Instant expiry = Instant.now().plus(properties.security().refreshTokenTtl());
        RefreshToken replacement = refreshTokens.save(new RefreshToken(session.getId(), hashRefresh(newRaw), expiry));
        token.setRevokedAt(Instant.now());
        token.setReplacedById(replacement.getId());
        session.setLastUsedAt(Instant.now());
        return new RefreshOutcome(new AuthResult(AuthResponse.session(access.value(), access.expiresAt(), newRaw, expiry, me),
                newRaw, expiry));
    }

    public void logout(String rawRefresh, UUID currentSessionId) {
        TenantContext.runAsPlatform(() -> tx.executeWithoutResult(status -> {
            UUID sessionId = currentSessionId;
            if (sessionId == null && rawRefresh != null && !rawRefresh.isBlank()) {
                sessionId = refreshTokens.findByHashForUpdate(hashRefresh(rawRefresh)).map(RefreshToken::getSessionId).orElse(null);
            }
            if (sessionId != null) {
                UUID sid = sessionId;
                sessions.findById(sid).ifPresent(s -> {
                    sessionService.revokeSession(sid, "LOGOUT");
                    TenantContext.State previous = TenantContext.current();
                    TenantContext.set(new TenantContext.State(s.getBusinessId(), true));
                    try {
                        audit.recordAs(s.subjectId(), null, AuditAction.LOGOUT, s.isPlatform() ? "PLATFORM_ADMIN" : "USER",
                                s.subjectId(), null, Map.of("sessionId", sid));
                    } finally {
                        TenantContext.set(previous);
                    }
                });
            }
        }));
    }

    public MeResponse me(UUID subjectId, boolean platform) {
        if (platform) {
            return TenantContext.callAsPlatform(() -> tx.execute(status -> platformMe(platformAdmins.findById(subjectId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_UNAUTHORIZED, "Authentication required")))));
        }
        return tx.execute(status -> {
            User user = userService.get(subjectId);
            return me(user, customerService.findByUserId(subjectId));
        });
    }

    /** A support token's view: the platform admin, shown inside the tenant with read-only owner permissions. */
    public MeResponse supportMe(UUID platformAdminId, List<String> permissions) {
        PlatformAdmin admin = TenantContext.callAsPlatform(() -> platformAdmins.findById(platformAdminId))
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_UNAUTHORIZED, "Authentication required"));
        return new MeResponse(admin.getId(), admin.getFullName() + " (support)", admin.getMobileNumber(), null, Roles.OWNER,
                permissions, null, new BusinessInfo(businessContext.businessId(), businessContext.displayName(), businessContext.logoUrl()),
                List.of(), modules.enabled().stream().map(Enum::name).sorted().toList(), true, null);
    }

    /**
     * Opens a read-only, time-boxed support view of one tenant for a platform admin (§0B.5): audited in the tenant's
     * own log (so its owner sees it), no refresh token, expires after {@code minutes}.
     */
    public SupportToken startSupportSession(UUID platformAdminId, UUID tenantId, String reason, int minutes) {
        return TenantContext.callAsPlatformIn(tenantId, () -> tx.execute(status -> {
            Business tenant = activeTenant(tenantId);
            PlatformAdmin admin = platformAdmins.findById(platformAdminId).filter(PlatformAdmin::isActive)
                    .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_UNAUTHORIZED, "Authentication required"));
            UserSession session = UserSession.forPlatformAdmin(admin.getId(), "support-access", null);
            session.setBusinessId(tenantId);
            sessions.save(session);
            Instant expiresAt = Instant.now().plus(java.time.Duration.ofMinutes(minutes));
            List<String> permissions = supportPermissions();
            audit.recordAs(admin.getId(), Roles.SUPER_ADMIN, AuditAction.SUPPORT_ACCESS_STARTED, "BUSINESS", tenantId, null,
                    Map.of("reason", reason.trim(), "minutes", minutes, "admin", admin.getFullName(), "expiresAt", expiresAt.toString()));
            IssuedToken token = jwtService.issueSupportToken(admin.getId(), tenantId, permissions, session.getId(), expiresAt);
            return new SupportToken(token.value(), token.expiresAt(), tenant.getId(), tenant.getName());
        }));
    }

    /** Owner's read permissions only (writes are blocked for support tokens anyway). */
    private List<String> supportPermissions() {
        return userService.ownerPermissions().stream()
                .filter(p -> p.endsWith("_READ") || p.endsWith("_VIEW") || p.equals("REPORT_FINANCIAL"))
                .sorted().toList();
    }

    public record SupportToken(String accessToken, Instant expiresAt, UUID businessId, String businessName) {
    }

    /** Blocked/inactive users and (per configuration) non-approved customers cannot sign in (§108 test matrix). */
    private Optional<Customer> assertCanSignIn(User user) {
        if (user.getStatus() != User.UserStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE, "This account is not active");
        }
        if (user.hasRole(Roles.SUPPLIER)) {
            // A supplier login works only while its supplier record is linked and active.
            boolean ok = supplierRepository.findByUserId(user.getId()).map(com.shopflow.suppliers.Supplier::isActive).orElse(false);
            if (!ok) {
                throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE, "This supplier login is not active. Please contact the business.");
            }
            return Optional.empty();
        }
        if (!user.hasRole(Roles.CUSTOMER)) {
            return Optional.empty();
        }
        Customer customer = customerService.findByUserId(user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_REGISTRATION_REQUIRED, "Customer registration is incomplete"));
        switch (customer.getStatus()) {
            case BLOCKED -> throw new BusinessException(ErrorCode.CUSTOMER_BLOCKED, "This customer account is blocked. Please contact the shop.");
            case REJECTED -> throw new BusinessException(ErrorCode.CUSTOMER_NOT_APPROVED, "This registration was not approved. Please contact the shop.");
            case PENDING_APPROVAL -> {
                if (properties.auth().pendingCustomerLogin() == AppProperties.Auth.PendingCustomerLogin.REJECT) {
                    throw new BusinessException(ErrorCode.CUSTOMER_NOT_APPROVED, "Your registration is awaiting approval");
                }
            }
            case APPROVED -> {
            }
        }
        return Optional.of(customer);
    }

    /** Pending customers receive a token without permissions: they can only see their registration status. */
    private IssuedToken accessToken(User user, UUID sessionId, Optional<Customer> customer) {
        Set<String> permissions = customer.isPresent() && !customer.get().isApproved()
                ? Set.of()
                : userService.effectivePermissions(user);
        return jwtService.issueAccessToken(user.getId(), user.getBusinessId(), user.primaryRole(), permissions, sessionId,
                customer.map(Customer::getId).orElse(null), customer.map(c -> c.getStatus().name()).orElse(null));
    }

    private MeResponse me(User user, Optional<Customer> customer) {
        List<String> permissions = customer.isPresent() && !customer.get().isApproved()
                ? List.of()
                : List.copyOf(userService.effectivePermissions(user));
        return new MeResponse(user.getId(), user.getFullName(), user.getMobileNumber(), user.getEmail(),
                user.primaryRole(), permissions,
                customer.map(c -> new CustomerInfo(c.getId(), c.getCustomerCode(), c.getShopName(), c.getStatus().name())).orElse(null),
                new BusinessInfo(businessContext.businessId(), businessContext.displayName(), businessContext.logoUrl()),
                switchTargets(user.getMobileNumber()),
                modules.enabled(user.getBusinessId()).stream().map(Enum::name).sorted().toList(), false,
                user.hasRole(Roles.SUPPLIER) ? supplierRepository.findByUserId(user.getId())
                        .map(sp -> new AuthDtos.SupplierInfo(sp.getId(), sp.getSupplierCode(), sp.getName())).orElse(null) : null);
    }

    private MeResponse platformMe(PlatformAdmin admin) {
        return new MeResponse(admin.getId(), admin.getFullName(), admin.getMobileNumber(), null, Roles.SUPER_ADMIN,
                List.copyOf(PLATFORM_PERMISSIONS), null, null, switchTargets(admin.getMobileNumber()), List.of(), false, null);
    }

    private List<TenantChoice> switchTargets(String mobile) {
        List<Membership> usable = membershipService.memberships(mobile).stream().filter(Membership::businessActive).toList();
        return choices(usable, membershipService.activeAdmin(mobile).isPresent());
    }

    private static List<TenantChoice> choices(List<Membership> memberships, boolean platform) {
        List<TenantChoice> list = new ArrayList<>();
        if (platform) {
            list.add(new TenantChoice(null, "Platform console", null, null, Roles.SUPER_ADMIN, true));
        }
        memberships.forEach(m -> list.add(new TenantChoice(m.businessId(), m.businessName(), m.logoUrl(), m.tenantCode(), m.role(), false)));
        return list;
    }

    private Business activeTenantByCode(String code) {
        Business b = TenantContext.callAsPlatform(() -> businesses.findByTenantCode(code))
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.TENANT_NOT_FOUND, "Business"));
        if (!b.isActive()) {
            throw new BusinessException(ErrorCode.TENANT_SUSPENDED, "This business account is suspended. Please contact support.");
        }
        return b;
    }

    private Business activeTenant(UUID id) {
        Business b = businesses.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.TENANT_NOT_FOUND, "Business"));
        if (!b.isActive()) {
            throw new BusinessException(ErrorCode.TENANT_SUSPENDED, "This business account is suspended. Please contact support.");
        }
        return b;
    }

    private String hashRefresh(String raw) {
        return Hashing.hmacSha256Hex(properties.security().jwtRefreshSecret(), raw);
    }

    private static String safeNormalize(String raw) {
        try {
            return MobileNumbers.normalize(raw);
        } catch (BusinessException e) {
            return "invalid";
        }
    }

    private static String truncate(String s, int max) {
        return s == null ? null : s.substring(0, Math.min(s.length(), max));
    }

    public record AuthResult(AuthResponse response, String rawRefreshToken, Instant refreshExpiresAt) {
    }

    private record RefreshOutcome(AuthResult result) {
        static RefreshOutcome failed() {
            return new RefreshOutcome(null);
        }
    }
}
