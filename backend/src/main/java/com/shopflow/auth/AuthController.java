package com.shopflow.auth;

import com.shopflow.auth.AuthDtos.AuthResponse;
import com.shopflow.auth.AuthDtos.MeResponse;
import com.shopflow.auth.AuthDtos.OtpRequestBody;
import com.shopflow.auth.AuthDtos.OtpRequestResponse;
import com.shopflow.auth.AuthDtos.OtpVerifyBody;
import com.shopflow.auth.AuthDtos.RefreshBody;
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
                challenge.expiresInSeconds(), challenge.resendAfterSeconds()), "OTP sent");
    }

    @PostMapping("/otp/verify")
    @Operation(summary = "Verify an OTP and sign in",
            description = "On success returns access/refresh tokens for an existing account, or registrationRequired=true with a registration token for a new number. "
                    + "Web clients (X-Client-Type: web) receive the refresh token only as an HttpOnly cookie. "
                    + "Errors: AUTH_INVALID_OTP, AUTH_OTP_EXPIRED, AUTH_TOO_MANY_ATTEMPTS, AUTH_ACCOUNT_INACTIVE, CUSTOMER_BLOCKED, CUSTOMER_NOT_APPROVED.")
    public ApiResponse<AuthResponse> verifyOtp(@Valid @RequestBody OtpVerifyBody body,
                                               @Parameter(description = "Send 'web' from browsers") @RequestHeader(value = CLIENT_TYPE_HEADER, required = false) String clientType,
                                               HttpServletResponse response) {
        AuthResult result = authService.verifyOtp(body.mobileNumber(), body.requestId(), body.otp(),
                body.deviceInfo() != null ? body.deviceInfo() : RequestContext.userAgent(), RequestContext.clientIp());
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
        return ApiResponse.ok(authService.me(CurrentUser.id()));
    }
}
