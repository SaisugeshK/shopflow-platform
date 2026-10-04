package com.shopflow.auth;

import com.shopflow.business.BusinessContext;
import com.shopflow.platform.PlatformAdmin;
import com.shopflow.platform.PlatformAdminRepository;
import com.shopflow.tenancy.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Cross-tenant identity lookups for sign-in (§0B.4): every tenant a mobile number belongs to, and whether it is a
 * platform admin. These are the only reads of other tenants' users rows and run with audited platform access.
 */
@Service
public class MembershipService {

    private final JdbcTemplate jdbc;
    private final PlatformAdminRepository admins;

    MembershipService(JdbcTemplate jdbc, PlatformAdminRepository admins) {
        this.jdbc = jdbc;
        this.admins = admins;
    }

    /** One users row (membership) of a mobile number, with its tenant's branding and status. */
    public record Membership(UUID userId, UUID businessId, String businessName, String logoUrl, String tenantCode,
                             boolean businessActive, String role, boolean userActive) {
    }

    public List<Membership> memberships(String mobile) {
        return TenantContext.callAsPlatform(() -> jdbc.query("""
                SELECT u.id, u.business_id, b.name, b.logo_file_id, b.tenant_code, b.status AS business_status,
                       (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role,
                       u.status
                FROM users u JOIN businesses b ON b.id = u.business_id
                WHERE u.mobile_number = ?
                ORDER BY b.name
                """, (rs, i) -> new Membership(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3),
                BusinessContext.logoUrl(rs.getObject(4, UUID.class)), rs.getString(5), "ACTIVE".equals(rs.getString(6)),
                rs.getString(7), "ACTIVE".equals(rs.getString(8))), mobile));
    }

    public Optional<Membership> membership(String mobile, UUID businessId) {
        return memberships(mobile).stream().filter(m -> m.businessId().equals(businessId)).findFirst();
    }

    public Optional<PlatformAdmin> activeAdmin(String mobile) {
        return admins.findByMobileNumber(mobile).filter(PlatformAdmin::isActive);
    }

    /** The mobile number behind the current session's subject (tenant user or platform admin). */
    public Optional<String> mobileOf(UUID subjectId, boolean platform) {
        if (platform) {
            return admins.findById(subjectId).map(PlatformAdmin::getMobileNumber);
        }
        List<String> rows = jdbc.queryForList("SELECT mobile_number FROM users WHERE id = ?", String.class, subjectId);
        return rows.stream().findFirst();
    }
}
