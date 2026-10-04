package com.shopflow.platform;

import com.shopflow.business.Business;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessRepository;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.tenancy.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.UUID;

/** Public join-link landing data (§0B.4): only a tenant's display name, logo and city. */
@RestController
@RequestMapping("/api/v1/public/tenants")
@Tag(name = "Public", description = "Join-link landing page")
public class PublicTenantController {

    private final BusinessRepository businesses;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    PublicTenantController(BusinessRepository businesses, org.springframework.jdbc.core.JdbcTemplate jdbc) {
        this.businesses = businesses;
        this.jdbc = jdbc;
    }

    public record PublicTenant(UUID id, String tenantCode, String name, String logoUrl, String city, boolean active) {
    }

    @GetMapping("/{code}")
    @Operation(summary = "Public profile of a tenant by join code", description = "Errors: TENANT_NOT_FOUND.")
    public ApiResponse<PublicTenant> byCode(@PathVariable String code) {
        Business b = TenantContext.callAsPlatform(() -> businesses.findByTenantCode(code.trim().toLowerCase(Locale.ROOT)))
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.TENANT_NOT_FOUND, "Business"));
        return ApiResponse.ok(new PublicTenant(b.getId(), b.getTenantCode(), b.getName(), BusinessContext.logoUrl(b.getLogoFileId()),
                b.getCity(), b.isActive()));
    }

    /**
     * The tenant a custom domain belongs to (§0B.14), so the sign-in page opened at that domain goes straight to the
     * business. Returns no data (null) for unknown hosts.
     */
    @GetMapping("/by-host/{host}")
    @Operation(summary = "Tenant for a custom domain")
    public ApiResponse<PublicTenant> byHost(@PathVariable String host) {
        String h = host.trim().toLowerCase(Locale.ROOT);
        java.util.List<UUID> ids = TenantContext.callAsPlatform(() -> jdbc.queryForList(
                "SELECT id FROM businesses WHERE lower(custom_domain) = ? AND status = 'ACTIVE'", UUID.class, h));
        if (ids.isEmpty()) {
            return ApiResponse.ok(null);
        }
        Business b = TenantContext.callAsPlatform(() -> businesses.findById(ids.getFirst())).orElseThrow();
        return ApiResponse.ok(new PublicTenant(b.getId(), b.getTenantCode(), b.getName(), BusinessContext.logoUrl(b.getLogoFileId()),
                b.getCity(), b.isActive()));
    }
}
