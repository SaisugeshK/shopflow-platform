package com.shopflow.auth;

import com.shopflow.auth.AuthDtos.AuthResponse;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.web.RequestContext;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerDtos.RegistrationRequest;
import com.shopflow.customers.CustomerDtos.RegistrationStatusResponse;
import com.shopflow.customers.CustomerService;
import com.shopflow.security.CurrentUser;
import com.shopflow.security.JwtService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customer-registration")
@Tag(name = "Customer Registration", description = "Self-registration for new customers after OTP verification")
@SecurityRequirement(name = "bearerAuth")
public class CustomerRegistrationController {

    private final AuthService authService;
    private final CustomerService customerService;
    private final RefreshCookies cookies;

    CustomerRegistrationController(AuthService authService, CustomerService customerService, RefreshCookies cookies) {
        this.authService = authService;
        this.customerService = customerService;
        this.cookies = cookies;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('REGISTRATION')")
    @Operation(summary = "Submit a customer registration",
            description = "Requires the registration token returned by /auth/otp/verify as the bearer token. Creates the account with status PENDING_APPROVAL "
                    + "and signs the customer in with a limited session. Errors: VALIDATION_ERROR, CUSTOMER_ALREADY_REGISTERED.")
    public ApiResponse<AuthResponse> register(@Valid @RequestBody RegistrationRequest request,
                                              @RequestHeader(value = RefreshCookies.CLIENT_TYPE_HEADER, required = false) String clientType,
                                              HttpServletResponse response) {
        var jwt = CurrentUser.registrationJwt()
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_UNAUTHORIZED, "Registration token required"));
        String mobile = jwt.getClaimAsString(JwtService.CLAIM_MOBILE);
        java.util.UUID tenantId = java.util.UUID.fromString(jwt.getClaimAsString(JwtService.CLAIM_TENANT));
        var result = authService.register(mobile, tenantId, request, RequestContext.userAgent(), RequestContext.clientIp());
        return ApiResponse.ok(cookies.apply(result, clientType, response), "Registration submitted for approval");
    }

    @GetMapping("/status")
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Get my registration status", description = "PENDING_APPROVAL, APPROVED, REJECTED or BLOCKED.")
    public ApiResponse<RegistrationStatusResponse> status() {
        Customer c = customerService.get(CurrentUser.customerId());
        return ApiResponse.ok(new RegistrationStatusResponse(c.getId(), c.getCustomerCode(), c.getStatus().name(), c.getStatusReason()));
    }
}
