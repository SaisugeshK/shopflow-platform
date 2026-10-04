package com.shopflow.platform;

import com.shopflow.auth.AuthService;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.platform.PlatformDtos.AddOwnerRequest;
import com.shopflow.platform.PlatformDtos.CreatePlatformAdminRequest;
import com.shopflow.platform.PlatformDtos.CreateTenantRequest;
import com.shopflow.platform.PlatformDtos.IndustryOption;
import com.shopflow.platform.PlatformDtos.ModuleOption;
import com.shopflow.platform.PlatformDtos.ModuleState;
import com.shopflow.platform.PlatformDtos.ModulesRequest;
import com.shopflow.platform.PlatformDtos.PlatformAdminResponse;
import com.shopflow.platform.PlatformDtos.PlatformAuditEntry;
import com.shopflow.platform.PlatformDtos.PlatformOverview;
import com.shopflow.platform.PlatformDtos.StatusChangeRequest;
import com.shopflow.platform.PlatformDtos.SupportAccessRequest;
import com.shopflow.platform.PlatformDtos.SupportAccessResponse;
import com.shopflow.platform.PlatformDtos.TenantDetail;
import com.shopflow.platform.PlatformDtos.TenantSummary;
import com.shopflow.platform.PlatformDtos.UpdatePlatformAdminRequest;
import com.shopflow.platform.PlatformDtos.UpdateTenantRequest;
import com.shopflow.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Super Admin console API (§0B.5). Only platform (SUPER_ADMIN) tokens reach it; tenant tokens get 403. */
@RestController
@RequestMapping("/api/v1/platform")
@PreAuthorize("hasRole('SUPER_ADMIN')")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Platform (Super Admin)", description = "Tenant registry, lifecycle, module switches, platform admins and audit")
public class PlatformController {

    private final PlatformService platform;
    private final AuthService authService;

    PlatformController(PlatformService platform, AuthService authService) {
        this.platform = platform;
        this.authService = authService;
    }

    @GetMapping("/overview")
    @Operation(summary = "Platform totals, tenants by industry and the newest tenants")
    public ApiResponse<PlatformOverview> overview() {
        return ApiResponse.ok(platform.overview());
    }

    @GetMapping("/industries")
    @Operation(summary = "Industry templates (read-only catalogue, §0B.7)")
    public ApiResponse<List<IndustryOption>> industries() {
        return ApiResponse.ok(platform.industries());
    }

    @GetMapping("/modules")
    @Operation(summary = "Module catalogue (§0B.6)")
    public ApiResponse<List<ModuleOption>> modules() {
        return ApiResponse.ok(platform.moduleCatalog());
    }

    @GetMapping("/tenants")
    @Operation(summary = "Search tenants", description = "q matches name, code, owner, mobile or city; filter by status and industry.")
    public ApiResponse<List<TenantSummary>> tenants(@RequestParam(required = false) String q,
                                                    @RequestParam(required = false) String status,
                                                    @RequestParam(required = false) String industry) {
        return ApiResponse.ok(platform.listTenants(q, status, industry));
    }

    @PostMapping("/tenants")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register a tenant (business) with its owner",
            description = "Creates the business, default settings, the OWNER login for ownerMobile, template categories and modules. "
                    + "tenantCode (join link /join/{code}) is derived from the name when omitted. Errors: VALIDATION_ERROR.")
    public ApiResponse<TenantDetail> create(@Valid @RequestBody CreateTenantRequest request) {
        return ApiResponse.ok(platform.createTenant(request), "Business registered");
    }

    @GetMapping("/tenants/{id}")
    @Operation(summary = "Tenant detail: profile, usage, modules and owners")
    public ApiResponse<TenantDetail> tenant(@PathVariable UUID id) {
        return ApiResponse.ok(platform.tenant(id));
    }

    @PatchMapping("/tenants/{id}")
    @Operation(summary = "Edit a tenant's name, legal name, industry or owner contact")
    public ApiResponse<TenantDetail> update(@PathVariable UUID id, @Valid @RequestBody UpdateTenantRequest request) {
        return ApiResponse.ok(platform.updateTenant(id, request));
    }

    @PostMapping("/tenants/{id}/suspend")
    @Operation(summary = "Suspend a tenant", description = "Signs out every user of the tenant; nobody can sign in until reactivated. Reason required.")
    public ApiResponse<TenantDetail> suspend(@PathVariable UUID id, @Valid @RequestBody StatusChangeRequest request) {
        return ApiResponse.ok(platform.suspend(id, request.reason()), "Business suspended");
    }

    @PostMapping("/tenants/{id}/reactivate")
    @Operation(summary = "Reactivate a suspended tenant")
    public ApiResponse<TenantDetail> reactivate(@PathVariable UUID id, @Valid @RequestBody StatusChangeRequest request) {
        return ApiResponse.ok(platform.reactivate(id, request.reason()), "Business reactivated");
    }

    @PutMapping("/tenants/{id}/modules")
    @Operation(summary = "Switch modules on or off",
            description = "Body: {modules: {CODE: true|false}}. Dependencies are applied (e.g. SUPPLIER_PORTAL needs PURCHASE_ORDERS).")
    public ApiResponse<List<ModuleState>> setModules(@PathVariable UUID id, @Valid @RequestBody ModulesRequest request) {
        return ApiResponse.ok(platform.setModules(id, request.modules()), "Modules updated");
    }

    @PostMapping("/tenants/{id}/owners")
    @Operation(summary = "Add another owner login to a tenant")
    public ApiResponse<TenantDetail> addOwner(@PathVariable UUID id, @Valid @RequestBody AddOwnerRequest request) {
        return ApiResponse.ok(platform.addOwner(id, request), "Owner added");
    }

    @PostMapping("/tenants/{id}/support-access")
    @Operation(summary = "Open a read-only, time-boxed support view of a tenant",
            description = "Reason required (audited in the tenant's own audit log). Returns an access token without refresh; 15–120 minutes.")
    public ApiResponse<SupportAccessResponse> supportAccess(@PathVariable UUID id, @Valid @RequestBody SupportAccessRequest request) {
        var token = authService.startSupportSession(CurrentUser.id(), id, request.reason(),
                request.minutes() == null ? 30 : request.minutes());
        return ApiResponse.ok(new SupportAccessResponse(token.accessToken(), token.expiresAt(), token.businessId(), token.businessName()));
    }

    @GetMapping("/audit-logs")
    @Operation(summary = "Platform audit log",
            description = "Without businessId: console actions and super-admin activity. With businessId: that tenant's log.")
    public ApiResponse<List<PlatformAuditEntry>> audit(@RequestParam(required = false) UUID businessId,
                                                       @RequestParam(required = false) String action,
                                                       @RequestParam(required = false, defaultValue = "100") int limit) {
        return ApiResponse.ok(platform.auditLog(businessId, action, limit));
    }

    @GetMapping("/admins")
    @Operation(summary = "Platform admins")
    public ApiResponse<List<PlatformAdminResponse>> admins() {
        return ApiResponse.ok(platform.listAdmins());
    }

    @PostMapping("/admins")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a platform admin")
    public ApiResponse<PlatformAdminResponse> createAdmin(@Valid @RequestBody CreatePlatformAdminRequest request) {
        return ApiResponse.ok(platform.createAdmin(request), "Platform admin added");
    }

    @PatchMapping("/admins/{id}")
    @Operation(summary = "Rename or (de)activate a platform admin")
    public ApiResponse<PlatformAdminResponse> updateAdmin(@PathVariable UUID id, @Valid @RequestBody UpdatePlatformAdminRequest request) {
        return ApiResponse.ok(platform.updateAdmin(id, request));
    }
}
