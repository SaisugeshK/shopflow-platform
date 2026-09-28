package com.shopflow.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI shopflowOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("ShopFlow Platform API")
                        .version("v1")
                        .description("""
                                REST API for the wholesale/retail shop management platform (React web and React Native clients).

                                * Authentication: mobile number + OTP → short-lived bearer access token (JWT) plus a rotating refresh token.
                                * Authorization: role (OWNER, ADMIN, CUSTOMER) plus permission codes; customers can only access their own data.
                                * Envelope: every JSON response is `{ success, data, message, pagination?, error?, requestId }`.
                                * Errors: `error.code` is one of the documented business codes (e.g. INSUFFICIENT_STOCK, CREDIT_LIMIT_EXCEEDED).
                                * Money: decimal numbers with 2 places, calculated only by the backend.
                                * Lists: `page` (1-based), `pageSize` (max 100), `sort=field,asc|desc`.
                                * Retries: send `Idempotency-Key` on order creation, payment recording, invoice generation and WhatsApp sends.
                                """))
                .servers(List.of(new Server().url("/").description("Current host")))
                .components(new Components().addSecuritySchemes("bearerAuth",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")));
    }
}
