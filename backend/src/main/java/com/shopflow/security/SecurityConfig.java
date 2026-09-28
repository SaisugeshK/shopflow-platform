package com.shopflow.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.ApiResponse.ApiError;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.config.AppProperties;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.core.Authentication;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import tools.jackson.databind.ObjectMapper;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.core.convert.converter.Converter;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private static final String[] PUBLIC_ENDPOINTS = {
            "/api/v1/auth/otp/request",
            "/api/v1/auth/otp/verify",
            "/api/v1/auth/refresh",
            "/api/v1/auth/logout",
            "/api/v1/payments/webhooks/**",
            "/api/v1/integrations/whatsapp/webhook",
            "/actuator/health",
            "/actuator/health/**",
            "/v3/api-docs",
            "/v3/api-docs/**",
            "/v3/api-docs.yaml",
            "/swagger-ui.html",
            "/swagger-ui/**",
    };

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, AppProperties properties,
                                            Converter<Jwt, AbstractAuthenticationToken> jwtConverter,
                                            ObjectMapper objectMapper) throws Exception {
        http
                // Stateless bearer-token API; the refresh cookie is SameSite=Strict and path-scoped (see DECISIONS.md).
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource(properties)))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives(
                                "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'"))
                        .referrerPolicy(ref -> ref.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        .frameOptions(frame -> frame.deny()))
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers(PUBLIC_ENDPOINTS).permitAll();
                    auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();
                    if (properties.devTools().enabled()) {
                        auth.requestMatchers("/api/v1/dev/**").permitAll();
                    }
                    auth.requestMatchers("/actuator/**").denyAll();
                    // A registration token may only submit the registration; everything else needs an access token.
                    auth.requestMatchers(HttpMethod.POST, "/api/v1/customer-registration").hasAuthority("REGISTRATION");
                    auth.anyRequest().access((authentication, context) -> {
                        Authentication a = authentication.get();
                        boolean allowed = a != null && a.isAuthenticated() && !(a instanceof AnonymousAuthenticationToken)
                                && a.getAuthorities().stream().noneMatch(g -> "REGISTRATION".equals(g.getAuthority()));
                        return new AuthorizationDecision(allowed);
                    });
                })
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtConverter))
                        .authenticationEntryPoint((request, response, ex) ->
                                writeError(response, objectMapper, HttpServletResponse.SC_UNAUTHORIZED, ErrorCode.AUTH_UNAUTHORIZED, "Authentication required"))
                        .accessDeniedHandler((request, response, ex) ->
                                writeError(response, objectMapper, HttpServletResponse.SC_FORBIDDEN, ErrorCode.AUTH_FORBIDDEN, "You do not have permission to perform this action")))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, e) ->
                                writeError(response, objectMapper, HttpServletResponse.SC_UNAUTHORIZED, ErrorCode.AUTH_UNAUTHORIZED, "Authentication required"))
                        .accessDeniedHandler((request, response, e) ->
                                writeError(response, objectMapper, HttpServletResponse.SC_FORBIDDEN, ErrorCode.AUTH_FORBIDDEN, "You do not have permission to perform this action")));
        return http.build();
    }

    private static void writeError(HttpServletResponse response, ObjectMapper mapper, int status, ErrorCode code, String message)
            throws java.io.IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), ApiResponse.failure(new ApiError(code.name(), message, null)));
    }

    @Bean
    SecretKey jwtSigningKey(AppProperties properties) {
        String secret = properties.security().jwtAccessSecret();
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("JWT_ACCESS_SECRET must be set and at least 32 bytes long");
        }
        return new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey jwtSigningKey) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSigningKey));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey jwtSigningKey, AppProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSigningKey).macAlgorithm(MacAlgorithm.HS256).build();
        OAuth2TokenValidator<Jwt> tokenType = jwt -> {
            String type = jwt.getClaimAsString(JwtService.CLAIM_TYPE);
            return JwtService.TYPE_ACCESS.equals(type) || JwtService.TYPE_REGISTRATION.equals(type)
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Unknown token type", null));
        };
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(properties.security().issuer()), tokenType));
        return decoder;
    }

    /**
     * Access tokens map to ROLE_x plus permission authorities, after checking the session is still active.
     * Registration tokens carry only the REGISTRATION authority.
     */
    @Bean
    Converter<Jwt, AbstractAuthenticationToken> jwtAuthenticationConverter(SessionValidator sessionValidator) {
        return jwt -> {
            List<GrantedAuthority> authorities = new ArrayList<>();
            String type = jwt.getClaimAsString(JwtService.CLAIM_TYPE);
            if (JwtService.TYPE_REGISTRATION.equals(type)) {
                authorities.add(new SimpleGrantedAuthority("REGISTRATION"));
                return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
            }
            String sid = jwt.getClaimAsString(JwtService.CLAIM_SESSION_ID);
            if (sid == null || !sessionValidator.isActive(UUID.fromString(sid), UUID.fromString(jwt.getSubject()))) {
                throw new InvalidBearerTokenException("Session is no longer active");
            }
            String role = jwt.getClaimAsString(JwtService.CLAIM_ROLE);
            if (role != null) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
            }
            List<String> perms = jwt.getClaimAsStringList(JwtService.CLAIM_PERMISSIONS);
            if (perms != null) {
                perms.forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
            }
            return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
        };
    }

    private CorsConfigurationSource corsConfigurationSource(AppProperties properties) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(properties.security().corsAllowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id", "X-Client-Type"));
        config.setExposedHeaders(List.of("X-Request-Id", "Content-Disposition"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
