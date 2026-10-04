package com.shopflow.security;

import com.shopflow.config.AppProperties;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Issues short-lived HS256 access tokens and single-purpose registration tokens. Refresh tokens are opaque random
 * values handled by the auth module, not JWTs.
 */
@Service
public class JwtService {

    public static final String CLAIM_TYPE = "typ";
    public static final String CLAIM_ROLE = "role";
    public static final String CLAIM_PERMISSIONS = "perms";
    public static final String CLAIM_SESSION_ID = "sid";
    public static final String CLAIM_CUSTOMER_ID = "cid";
    public static final String CLAIM_CUSTOMER_STATUS = "cst";
    public static final String CLAIM_MOBILE = "mobile";
    /** Tenant (business) the token is scoped to (§0B.3). */
    public static final String CLAIM_TENANT = "tid";
    /** True on a platform (SUPER_ADMIN) token, which has no tenant. */
    public static final String CLAIM_PLATFORM = "plat";
    /** True on a Super Admin's read-only, time-boxed support token into one tenant (§0B.5). */
    public static final String CLAIM_SUPPORT = "sup";
    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_REGISTRATION = "registration";
    /** Proves a passed OTP while the user picks which tenant (or the platform console) to enter. */
    public static final String TYPE_SELECTION = "selection";

    private final JwtEncoder encoder;
    private final AppProperties.Security props;

    public JwtService(JwtEncoder encoder, AppProperties properties) {
        this.encoder = encoder;
        this.props = properties.security();
    }

    public IssuedToken issueAccessToken(UUID userId, UUID tenantId, String role, Collection<String> permissions, UUID sessionId,
                                        UUID customerId, String customerStatus) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(props.accessTokenTtl());
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(props.issuer())
                .subject(userId.toString())
                .issuedAt(now)
                .expiresAt(expiresAt)
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .claim(CLAIM_ROLE, role)
                .claim(CLAIM_PERMISSIONS, List.copyOf(permissions))
                .claim(CLAIM_SESSION_ID, sessionId.toString())
                .claim(CLAIM_TENANT, tenantId.toString());
        if (customerId != null) {
            claims.claim(CLAIM_CUSTOMER_ID, customerId.toString());
            claims.claim(CLAIM_CUSTOMER_STATUS, customerStatus);
        }
        return new IssuedToken(encode(claims.build()), expiresAt);
    }

    /** Platform console token for a SUPER_ADMIN: no tenant, platform claim set. */
    public IssuedToken issuePlatformToken(UUID platformAdminId, Collection<String> permissions, UUID sessionId) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(props.accessTokenTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(props.issuer())
                .subject(platformAdminId.toString())
                .issuedAt(now)
                .expiresAt(expiresAt)
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .claim(CLAIM_ROLE, Roles.SUPER_ADMIN)
                .claim(CLAIM_PERMISSIONS, List.copyOf(permissions))
                .claim(CLAIM_SESSION_ID, sessionId.toString())
                .claim(CLAIM_PLATFORM, true)
                .build();
        return new IssuedToken(encode(claims), expiresAt);
    }

    /**
     * Allows exactly one action: submitting the customer registration, into {@code tenantId}, for a mobile number
     * that passed OTP.
     */
    public IssuedToken issueRegistrationToken(String mobileNumber, UUID tenantId) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(props.registrationTokenTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(props.issuer())
                .subject("registration:" + mobileNumber)
                .issuedAt(now)
                .expiresAt(expiresAt)
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_TYPE, TYPE_REGISTRATION)
                .claim(CLAIM_MOBILE, mobileNumber)
                .claim(CLAIM_TENANT, tenantId.toString())
                .build();
        return new IssuedToken(encode(claims), expiresAt);
    }

    /**
     * Read-only support access into one tenant for a platform admin: no refresh token; it simply expires at
     * {@code expiresAt} (§0B.5).
     */
    public IssuedToken issueSupportToken(UUID platformAdminId, UUID tenantId, Collection<String> permissions,
                                         UUID sessionId, Instant expiresAt) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(props.issuer())
                .subject(platformAdminId.toString())
                .issuedAt(Instant.now())
                .expiresAt(expiresAt)
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .claim(CLAIM_ROLE, Roles.OWNER)
                .claim(CLAIM_PERMISSIONS, List.copyOf(permissions))
                .claim(CLAIM_SESSION_ID, sessionId.toString())
                .claim(CLAIM_TENANT, tenantId.toString())
                .claim(CLAIM_SUPPORT, true)
                .build();
        return new IssuedToken(encode(claims), expiresAt);
    }

    /** Short-lived proof of a passed OTP, exchanged at /auth/select-tenant for a session in one tenant. */
    public IssuedToken issueSelectionToken(String mobileNumber) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(props.registrationTokenTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(props.issuer())
                .subject("selection:" + mobileNumber)
                .issuedAt(now)
                .expiresAt(expiresAt)
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_TYPE, TYPE_SELECTION)
                .claim(CLAIM_MOBILE, mobileNumber)
                .build();
        return new IssuedToken(encode(claims), expiresAt);
    }

    private String encode(JwtClaimsSet claims) {
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    public record IssuedToken(String value, Instant expiresAt) {
    }
}
