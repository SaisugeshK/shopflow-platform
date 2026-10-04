package com.shopflow.security;

import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Accessors for the authenticated principal, backed by the verified access-token claims.
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static Optional<Jwt> jwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken token
                && JwtService.TYPE_ACCESS.equals(token.getToken().getClaimAsString(JwtService.CLAIM_TYPE))) {
            return Optional.of(token.getToken());
        }
        return Optional.empty();
    }

    /** The registration-token JWT, if the caller presented one. */
    public static Optional<Jwt> registrationJwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken token
                && JwtService.TYPE_REGISTRATION.equals(token.getToken().getClaimAsString(JwtService.CLAIM_TYPE))) {
            return Optional.of(token.getToken());
        }
        return Optional.empty();
    }

    /** The selection-token JWT (tenant picker after OTP), if the caller presented one. */
    public static Optional<Jwt> selectionJwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken token
                && JwtService.TYPE_SELECTION.equals(token.getToken().getClaimAsString(JwtService.CLAIM_TYPE))) {
            return Optional.of(token.getToken());
        }
        return Optional.empty();
    }

    public static Optional<UUID> idIfPresent() {
        return jwt().map(j -> UUID.fromString(j.getSubject()));
    }

    public static UUID id() {
        return idIfPresent().orElseThrow(() -> new BusinessException(ErrorCode.AUTH_UNAUTHORIZED, "Authentication required"));
    }

    public static String primaryRole() {
        return jwt().map(j -> j.getClaimAsString(JwtService.CLAIM_ROLE)).orElse(null);
    }

    public static boolean isCustomer() {
        return Roles.CUSTOMER.equals(primaryRole());
    }

    public static boolean isOwner() {
        return Roles.OWNER.equals(primaryRole());
    }

    public static boolean isStaff() {
        String role = primaryRole();
        return Roles.OWNER.equals(role) || Roles.ADMIN.equals(role);
    }

    public static boolean hasPermission(String permission) {
        return jwt().map(j -> {
            List<String> perms = j.getClaimAsStringList(JwtService.CLAIM_PERMISSIONS);
            return perms != null && perms.contains(permission);
        }).orElse(false);
    }

    /** The customer id bound to a CUSTOMER access token. */
    public static UUID customerId() {
        return jwt().map(j -> j.getClaimAsString(JwtService.CLAIM_CUSTOMER_ID))
                .map(UUID::fromString)
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_FORBIDDEN, "Customer account required"));
    }

    /** True for a platform (SUPER_ADMIN) token, whose subject is a platform admin rather than a tenant user. */
    public static boolean isPlatform() {
        return jwt().map(j -> Boolean.TRUE.equals(j.getClaimAsBoolean(JwtService.CLAIM_PLATFORM))).orElse(false);
    }

    /** True for a Super Admin's read-only support token inside a tenant; its subject is the platform admin. */
    public static boolean isSupport() {
        return jwt().map(j -> Boolean.TRUE.equals(j.getClaimAsBoolean(JwtService.CLAIM_SUPPORT))).orElse(false);
    }

    public static boolean isSupplier() {
        return Roles.SUPPLIER.equals(primaryRole());
    }

    public static Optional<UUID> sessionId() {
        return jwt().map(j -> j.getClaimAsString(JwtService.CLAIM_SESSION_ID)).map(UUID::fromString);
    }
}
