package com.shopflow.auth;

import com.shopflow.auth.AuthDtos.AuthResponse;
import com.shopflow.auth.AuthDtos.MeResponse;
import com.shopflow.auth.AuthDtos.OtpRequestBody;
import com.shopflow.auth.AuthDtos.OtpRequestResponse;
import com.shopflow.auth.AuthDtos.OtpVerifyBody;
import com.shopflow.auth.AuthDtos.RefreshBody;
import com.shopflow.auth.AuthDtos.SelectTenantBody;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.security.JwtService;
import com.shopflow.auth.AuthService.AuthResult;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.web.RequestContext;
import com.shopflow.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication", description = "Mobile number + OTP sign-in, token refresh and logout")
public class AuthController {

    private static final String REFRESH_COOKIE = RefreshCookies.REFRESH_COOKIE;
    private static final String CLIENT_TYPE_HEADER = RefreshCookies.CLIENT_TYPE_HEADER;

    private final OtpService otpService;
    private final AuthService authService;
    private final RefreshCookies cookies;

    AuthController(OtpService otpService, AuthService authService, RefreshCookies cookies) {
        this.otpService = otpService;
        this.authService = authService;
        this.cookies = cookies;
    }

    @PostMapping("/otp/request")
    @Operation(summary = "Request an OTP",
            description = "Normalises the mobile number, applies rate limits and the resend cooldown, invalidates older OTPs and sends a new one. "
                    + "The response never reveals whether an account exists. Errors: VALIDATION_ERROR, AUTH_OTP_COOLDOWN, RATE_LIMITED, AUTH_OTP_DELIVERY_FAILED.")
    public ApiResponse<OtpRequestResponse> requestOtp(@Valid @RequestBody OtpRequestBody body) {
        OtpService.OtpChallenge challenge = otpService.request(body.mobileNumber(), RequestContext.clientIp());
        return ApiResponse.ok(new OtpRequestResponse(challenge.requestId(), challenge.maskedMobile(),
                challenge.expiresInSeconds(), challenge.resendAfterSeconds(), challenge.demoOtp()), "OTP sent");
    }

    @PostMapping("/otp/verify")
    @Operation(summary = "Verify an OTP and sign in",
            description = "On success returns access/refresh tokens when the number belongs to one tenant; selectionRequired=true with a selection token and the tenants to pick from "
                    + "when it belongs to several; or registrationRequired=true with a registration token for a number new to the tenant (tenantCode from the join link, else the default tenant). "
                    + "Web clients (X-Client-Type: web) receive the refresh token only as an HttpOnly cookie. "
                    + "Errors: AUTH_INVALID_OTP, AUTH_OTP_EXPIRED, AUTH_TOO_MANY_ATTEMPTS, AUTH_ACCOUNT_INACTIVE, CUSTOMER_BLOCKED, CUSTOMER_NOT_APPROVED, "
                    + "TENANT_NOT_FOUND, TENANT_SUSPENDED, TENANT_JOIN_LINK_REQUIRED.")
    public ApiResponse<AuthResponse> verifyOtp(@Valid @RequestBody OtpVerifyBody body,
                                               @Parameter(description = "Send 'web' from browsers") @RequestHeader(value = CLIENT_TYPE_HEADER, required = false) String clientType,
                                               HttpServletResponse response) {
        AuthResult result = authService.verifyOtp(body.mobileNumber(), body.requestId(), body.otp(), body.tenantCode(),
                body.deviceInfo() != null ? body.deviceInfo() : RequestContext.userAgent(), RequestContext.clientIp());
        return ApiResponse.ok(cookies.apply(result, clientType, response));
    }

    @PostMapping("/select-tenant")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Enter one of the tenants offered after OTP",
            description = "Bearer = the selectionToken from /auth/otp/verify (selectionRequired=true). Body: businessId of a listed tenant, "
                    + "or platform=true for the Super Admin console. Errors: TENANT_NOT_MEMBER, TENANT_SUSPENDED, AUTH_ACCOUNT_INACTIVE.")
    public ApiResponse<AuthResponse> selectTenant(@RequestBody SelectTenantBody body,
                                                  @RequestHeader(value = CLIENT_TYPE_HEADER, required = false) String clientType,
                                                  HttpServletResponse response) {
        String mobile = CurrentUser.selectionJwt().map(j -> j.getClaimAsString(JwtService.CLAIM_MOBILE))
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_UNAUTHORIZED, "Selection token required"));
        AuthResult result = authService.selectTenant(mobile, body, RequestContext.userAgent(), RequestContext.clientIp());
        return ApiResponse.ok(cookies.apply(result, clientType, response));
    }

    @PostMapping("/switch-tenant")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Switch the signed-in number to another of its tenants (or the console)",
            description = "Ends the current session and starts one in the chosen tenant; see /auth/me memberships. "
                    + "Errors: TENANT_NOT_MEMBER, TENANT_SUSPENDED.")
    public ApiResponse<AuthResponse> switchTenant(@RequestBody SelectTenantBody body,
                                                  @RequestHeader(value = CLIENT_TYPE_HEADER, required = false) String clientType,
                                                  HttpServletResponse response) {
        AuthResult result = authService.switchTenant(CurrentUser.id(), CurrentUser.isPlatform(), CurrentUser.sessionId().orElse(null),
                body, RequestContext.userAgent(), RequestContext.clientIp());
        return ApiResponse.ok(cookies.apply(result, clientType, response));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Rotate the refresh token and get a new access token",
            description = "Accepts the refresh token from the body or the sf_refresh cookie. Reusing a rotated token revokes the session. Errors: AUTH_INVALID_REFRESH_TOKEN.")
    public ApiResponse<AuthResponse> refresh(@RequestBody(required = false) RefreshBody body,
                                             @CookieValue(value = REFRESH_COOKIE, required = false) String cookie,
                                             @RequestHeader(value = CLIENT_TYPE_HEADER, required = false) String clientType,
                                             HttpServletResponse response) {
        String token = body != null && body.refreshToken() != null ? body.refreshToken() : cookie;
        try {
            return ApiResponse.ok(cookies.apply(authService.refresh(token), clientType, response));
        } catch (RuntimeException e) {
            cookies.clear(response);
            throw e;
        }
    }

    @PostMapping("/logout")
    @Operation(summary = "Log out", description = "Revokes the current session (from the access token, refresh token body or cookie).")
    public ApiResponse<Void> logout(@RequestBody(required = false) RefreshBody body,
                                    @CookieValue(value = REFRESH_COOKIE, required = false) String cookie,
                                    HttpServletResponse response) {
        String token = body != null && body.refreshToken() != null ? body.refreshToken() : cookie;
        authService.logout(token, CurrentUser.sessionId().orElse(null));
        cookies.clear(response);
        return ApiResponse.ok(null, "Logged out");
    }

    @GetMapping("/me")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Current user, role, permissions and customer status")
    public ApiResponse<MeResponse> me() {
        if (CurrentUser.isSupport()) {
            return ApiResponse.ok(authService.supportMe(CurrentUser.id(),
                    CurrentUser.jwt().map(j -> j.getClaimAsStringList(JwtService.CLAIM_PERMISSIONS)).orElse(java.util.List.of())));
        }
        return ApiResponse.ok(authService.me(CurrentUser.id(), CurrentUser.isPlatform()));
    }
}
