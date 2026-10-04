package com.shopflow.saas;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.web.RequestContext;
import com.shopflow.platform.PlatformDtos.TenantDetail;
import com.shopflow.platform.PlatformService;
import com.shopflow.saas.SaasDtos.ApproveSignupRequest;
import com.shopflow.saas.SaasDtos.ChangePlanRequest;
import com.shopflow.saas.SaasDtos.DomainRequest;
import com.shopflow.saas.SaasDtos.PlanResponse;
import com.shopflow.saas.SaasDtos.RejectSignupRequest;
import com.shopflow.saas.SaasDtos.SignupOtpRequest;
import com.shopflow.saas.SaasDtos.SignupOtpResponse;
import com.shopflow.saas.SaasDtos.SignupRequest;
import com.shopflow.saas.SaasDtos.SignupResponse;
import com.shopflow.saas.SaasDtos.SubscriptionResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SaaS operations (§0B.14): public plan list and business self-signup; the tenant's own plan and usage; and the Super
 * Admin's plan changes, custom domains and sign-up approvals (under /platform, SUPER_ADMIN only).
 */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Plans & sign-up", description = "Plans, usage limits, business self-signup and custom domains")
public class SaasController {

    private final PlanLimits limits;
    private final SignupService signups;
    private final PlatformService platform;

    public SaasController(PlanLimits limits, SignupService signups, PlatformService platform) {
        this.limits = limits;
        this.signups = signups;
        this.platform = platform;
    }

    // ------------------------------------------------------------------ public

    @GetMapping("/public/plans")
    @Operation(summary = "Plans on offer")
    public ApiResponse<List<PlanResponse>> publicPlans() {
        return ApiResponse.ok(limits.plans().stream().filter(PlanResponse::active).toList());
    }

    @GetMapping("/public/industries")
    @Operation(summary = "Industries a business can sign up for")
    public ApiResponse<List<Map<String, String>>> publicIndustries() {
        return ApiResponse.ok(platform.industries().stream().map(i -> Map.of("code", i.code(), "label", i.label(), "description", i.description())).toList());
    }

    @PostMapping("/public/signup/otp")
    @Operation(summary = "Send an OTP to the owner's mobile for sign-up")
    public ApiResponse<SignupOtpResponse> signupOtp(@Valid @RequestBody SignupOtpRequest request) {
        return ApiResponse.ok(signups.requestOtp(request.mobileNumber(), RequestContext.clientIp()));
    }

    @PostMapping("/public/signup")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Ask for a ShopFlow account", description = "Verifies the OTP and records the request for the Super Admin to approve.")
    public ApiResponse<Map<String, Object>> signup(@Valid @RequestBody SignupRequest request) {
        SignupResponse s = signups.submit(request, RequestContext.clientIp());
        return ApiResponse.ok(Map.of("id", s.id(), "status", s.status()));
    }

    @GetMapping("/public/signup/status")
    @Operation(summary = "Status of the latest sign-up for a mobile number", description = "PENDING, APPROVED, REJECTED or NONE.")
    public ApiResponse<Map<String, String>> signupStatus(@RequestParam String mobileNumber) {
        return ApiResponse.ok(Map.of("status", signups.statusFor(mobileNumber)));
    }

    // ------------------------------------------------------------------ tenant

    @GetMapping("/subscription")
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    @Operation(summary = "This business's plan and usage")
    public ApiResponse<SubscriptionResponse> subscription() {
        return ApiResponse.ok(limits.subscription());
    }

    // ------------------------------------------------------------------ platform

    @GetMapping("/platform/plans")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "All plans")
    public ApiResponse<List<PlanResponse>> plans() {
        return ApiResponse.ok(limits.plans());
    }

    @PutMapping("/platform/tenants/{id}/plan")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Change a business's plan")
    public ApiResponse<TenantDetail> changePlan(@PathVariable UUID id, @Valid @RequestBody ChangePlanRequest request) {
        return ApiResponse.ok(platform.changePlan(id, request.planCode()));
    }

    @PutMapping("/platform/tenants/{id}/domain")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Set or clear a business's custom domain")
    public ApiResponse<TenantDetail> domain(@PathVariable UUID id, @Valid @RequestBody DomainRequest request) {
        return ApiResponse.ok(platform.setDomain(id, request.domain()));
    }

    @GetMapping("/platform/signups")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Business sign-up requests")
    public ApiResponse<List<SignupResponse>> signups(@RequestParam(required = false) String status) {
        return ApiResponse.ok(signups.list(status));
    }

    @GetMapping("/platform/signups/{id}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Sign-up request")
    public ApiResponse<SignupResponse> signup(@PathVariable UUID id) {
        return ApiResponse.ok(signups.get(id));
    }

    @PostMapping("/platform/signups/{id}/approve")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Approve: creates the business and its owner login")
    public ApiResponse<SignupResponse> approve(@PathVariable UUID id, @Valid @RequestBody(required = false) ApproveSignupRequest request) {
        return ApiResponse.ok(signups.approve(id, request));
    }

    @PostMapping("/platform/signups/{id}/reject")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Reject a sign-up request")
    public ApiResponse<SignupResponse> reject(@PathVariable UUID id, @Valid @RequestBody RejectSignupRequest request) {
        return ApiResponse.ok(signups.reject(id, request.reason()));
    }
}
