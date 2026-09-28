package com.shopflow.auth;

import com.shopflow.auth.AuthDtos.AuthResponse;
import com.shopflow.auth.AuthService.AuthResult;
import com.shopflow.config.AppProperties;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * Writes the refresh token as an HttpOnly, SameSite=Strict cookie scoped to /api/v1/auth. Browser clients
 * (X-Client-Type: web) never receive the refresh token in a response body, so page scripts cannot read it.
 */
@Component
class RefreshCookies {

    static final String REFRESH_COOKIE = "sf_refresh";
    static final String COOKIE_PATH = "/api/v1/auth";
    static final String CLIENT_TYPE_HEADER = "X-Client-Type";

    private final AppProperties properties;

    RefreshCookies(AppProperties properties) {
        this.properties = properties;
    }

    AuthResponse apply(AuthResult result, String clientType, HttpServletResponse response) {
        AuthResponse body = result.response();
        if (result.rawRefreshToken() == null) {
            return body;
        }
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(result.rawRefreshToken(),
                Duration.between(Instant.now(), result.refreshExpiresAt())).toString());
        if ("web".equalsIgnoreCase(clientType)) {
            return new AuthResponse(body.registrationRequired(), body.accessToken(), body.accessTokenExpiresAt(), null,
                    body.refreshTokenExpiresAt(), body.registrationToken(), body.registrationTokenExpiresAt(), body.user());
        }
        return body;
    }

    void clear(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
    }

    private ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(properties.security().refreshCookieSecure())
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(maxAge)
                .build();
    }
}
