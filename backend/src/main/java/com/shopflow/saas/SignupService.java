package com.shopflow.saas;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.auth.OtpService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.platform.PlatformDtos.CreateTenantRequest;
import com.shopflow.platform.PlatformDtos.TenantDetail;
import com.shopflow.platform.PlatformService;
import com.shopflow.saas.SaasDtos.ApproveSignupRequest;
import com.shopflow.saas.SaasDtos.SignupOtpResponse;
import com.shopflow.saas.SaasDtos.SignupRequest;
import com.shopflow.saas.SaasDtos.SignupResponse;
import com.shopflow.security.CurrentUser;
import com.shopflow.tenancy.IndustryTemplate;
import com.shopflow.tenancy.TenantContext;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Business self-signup (§0B.14): the owner proves the mobile number with an OTP and sends the business details; the
 * Super Admin approves (which creates the tenant exactly like "Register business" in the console) or rejects.
 */
@Service
public class SignupService {

    private static final String SELECT = "SELECT s.*, b.tenant_code FROM tenant_signups s LEFT JOIN businesses b ON b.id = s.business_id";

    private final JdbcTemplate jdbc;
    private final OtpService otp;
    private final PlatformService platform;
    private final AuditService audit;

    public SignupService(JdbcTemplate jdbc, OtpService otp, PlatformService platform, AuditService audit) {
        this.jdbc = jdbc;
        this.otp = otp;
        this.platform = platform;
        this.audit = audit;
    }

    public SignupOtpResponse requestOtp(String mobile, String clientIp) {
        OtpService.OtpChallenge c = otp.request(mobile, clientIp);
        return new SignupOtpResponse(c.requestId(), c.maskedMobile(), c.expiresInSeconds(), c.resendAfterSeconds(), c.demoOtp());
    }

    public SignupResponse submit(SignupRequest r, String clientIp) {
        String mobile = otp.verify(r.mobileNumber(), r.requestId(), r.otp(), clientIp);
        IndustryTemplate industry;
        try {
            industry = IndustryTemplate.valueOf(r.industry().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw BusinessException.validation("industry", "Choose an industry");
        }
        String plan = r.planCode() == null || r.planCode().isBlank() ? "FREE" : r.planCode().trim().toUpperCase(Locale.ROOT);
        UUID id = UUID.randomUUID();
        TenantContext.callAsPlatform(() -> {
            Long known = jdbc.queryForObject("SELECT count(*) FROM plans WHERE code = ? AND active", Long.class, plan);
            if (known == null || known == 0) {
                throw BusinessException.validation("planCode", "Unknown plan");
            }
            try {
                jdbc.update("""
                        INSERT INTO tenant_signups (id, business_name, legal_name, owner_name, owner_mobile, email, state, state_code, city,
                                                    gstin, industry, plan_code, message, status, client_ip, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
                        """, id, r.businessName().trim(), blank(r.legalName()), r.ownerName().trim(), mobile, blank(r.email()),
                        r.state().trim(), r.stateCode(), blank(r.city()), blank(r.gstin()), industry.name(), plan, blank(r.message()),
                        clientIp, Timestamp.from(Instant.now()));
            } catch (DuplicateKeyException e) {
                throw new BusinessException(ErrorCode.CONFLICT, "A sign-up for this mobile number is already waiting for approval");
            }
            audit.recordAs(null, "PUBLIC", AuditAction.SIGNUP_REQUESTED, "TENANT_SIGNUP", id, null,
                    Map.of("businessName", r.businessName().trim(), "mobile", mobile, "industry", industry.name()));
            return null;
        });
        return get(id);
    }

    public List<SignupResponse> list(String status) {
        return TenantContext.callAsPlatform(() -> status == null || status.isBlank()
                ? jdbc.query(SELECT + " ORDER BY s.created_at DESC LIMIT 300", (rs, i) -> map(rs))
                : jdbc.query(SELECT + " WHERE s.status = ? ORDER BY s.created_at DESC LIMIT 300", (rs, i) -> map(rs), status.trim().toUpperCase(Locale.ROOT)));
    }

    public SignupResponse get(UUID id) {
        return TenantContext.callAsPlatform(() -> jdbc.query(SELECT + " WHERE s.id = ?", (rs, i) -> map(rs), id)).stream().findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Sign-up"));
    }

    /** Creates the tenant (owner = the verified mobile) and marks the sign-up approved. */
    public SignupResponse approve(UUID id, ApproveSignupRequest r) {
        SignupResponse s = pending(id);
        TenantDetail tenant = platform.createTenant(new CreateTenantRequest(s.businessName(), s.legalName(),
                r == null ? null : r.tenantCode(), s.industry(), s.state(), s.stateCode(), s.city(), s.gstin(), s.ownerName(),
                s.ownerMobile(), s.email(), null, r == null || r.planCode() == null || r.planCode().isBlank() ? s.planCode() : r.planCode()));
        TenantContext.callAsPlatform(() -> {
            jdbc.update("UPDATE tenant_signups SET status = 'APPROVED', business_id = ?, decided_by = ?, decided_at = ? WHERE id = ?",
                    tenant.id(), CurrentUser.id(), Timestamp.from(Instant.now()), id);
            audit.record(AuditAction.SIGNUP_APPROVED, "TENANT_SIGNUP", id, Map.of("status", "PENDING"),
                    Map.of("status", "APPROVED", "businessId", tenant.id(), "tenantCode", tenant.tenantCode()));
            return null;
        });
        return get(id);
    }

    public SignupResponse reject(UUID id, String reason) {
        pending(id);
        TenantContext.callAsPlatform(() -> {
            jdbc.update("UPDATE tenant_signups SET status = 'REJECTED', decision_reason = ?, decided_by = ?, decided_at = ? WHERE id = ?",
                    reason.trim(), CurrentUser.id(), Timestamp.from(Instant.now()), id);
            audit.record(AuditAction.SIGNUP_REJECTED, "TENANT_SIGNUP", id, Map.of("status", "PENDING"), Map.of("status", "REJECTED", "reason", reason.trim()));
            return null;
        });
        return get(id);
    }

    /** What the applicant can see about their own request (by mobile, after OTP is not needed: status only). */
    public String statusFor(String mobile) {
        String m = MobileNumbers.normalize(mobile);
        return TenantContext.callAsPlatform(() -> jdbc.queryForList(
                "SELECT status FROM tenant_signups WHERE owner_mobile = ? ORDER BY created_at DESC LIMIT 1", String.class, m))
                .stream().findFirst().orElse("NONE");
    }

    private SignupResponse pending(UUID id) {
        SignupResponse s = get(id);
        if (!"PENDING".equals(s.status())) {
            throw new BusinessException(ErrorCode.CONFLICT, "This sign-up is already " + s.status().toLowerCase(Locale.ROOT));
        }
        return s;
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static SignupResponse map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp decided = rs.getTimestamp("decided_at");
        return new SignupResponse(rs.getObject("id", UUID.class), rs.getString("business_name"), rs.getString("legal_name"),
                rs.getString("owner_name"), rs.getString("owner_mobile"), rs.getString("email"), rs.getString("state"),
                rs.getString("state_code"), rs.getString("city"), rs.getString("gstin"), rs.getString("industry"),
                rs.getString("plan_code"), rs.getString("message"), rs.getString("status"), rs.getString("decision_reason"),
                rs.getObject("business_id", UUID.class), rs.getString("tenant_code"), decided == null ? null : decided.toInstant(),
                rs.getTimestamp("created_at").toInstant());
    }
}
