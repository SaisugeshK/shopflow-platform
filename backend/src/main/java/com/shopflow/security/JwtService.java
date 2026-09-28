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
    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_REGISTRATION = "registration";

    private final JwtEncoder encoder;
    private final AppProperties.Security props;

    public JwtService(JwtEncoder encoder, AppProperties properties) {
        this.encoder = encoder;
        this.props = properties.security();
    }

    public IssuedToken issueAccessToken(UUID userId, String role, Collection<String> permissions, UUID sessionId,
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
                .claim(CLAIM_SESSION_ID, sessionId.toString());
        if (customerId != null) {
            claims.claim(CLAIM_CUSTOMER_ID, customerId.toString());
            claims.claim(CLAIM_CUSTOMER_STATUS, customerStatus);
        }
        return new IssuedToken(encode(claims.build()), expiresAt);
    }

    /** Allows exactly one action: submitting the customer registration for a mobile number that passed OTP. */
    public IssuedToken issueRegistrationToken(String mobileNumber) {
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
