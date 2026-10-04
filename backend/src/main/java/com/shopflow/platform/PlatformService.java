package com.shopflow.platform;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.platform.PlatformDtos.AddOwnerRequest;
import com.shopflow.platform.PlatformDtos.CreatePlatformAdminRequest;
import com.shopflow.platform.PlatformDtos.CreateTenantRequest;
import com.shopflow.platform.PlatformDtos.IndustryOption;
import com.shopflow.platform.PlatformDtos.ModuleOption;
import com.shopflow.platform.PlatformDtos.ModuleState;
import com.shopflow.platform.PlatformDtos.OwnerContact;
import com.shopflow.platform.PlatformDtos.PlatformAdminResponse;
import com.shopflow.platform.PlatformDtos.PlatformAuditEntry;
import com.shopflow.platform.PlatformDtos.PlatformOverview;
import com.shopflow.platform.PlatformDtos.TenantDetail;
import com.shopflow.platform.PlatformDtos.TenantSummary;
import com.shopflow.platform.PlatformDtos.TenantUsage;
import com.shopflow.platform.PlatformDtos.UpdatePlatformAdminRequest;
import com.shopflow.platform.PlatformDtos.UpdateTenantRequest;
import com.shopflow.security.CurrentUser;
import com.shopflow.tenancy.IndustryTemplate;
import com.shopflow.tenancy.ModuleCode;
import com.shopflow.tenancy.TenantContext;
import com.shopflow.tenancy.TenantModules;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Super Admin console (§0B.5): tenant registry, lifecycle, module switches, platform admins and the platform audit
 * trail. Everything here runs with audited platform access; actions on one tenant are also recorded in that tenant's
 * own audit log so its owner can see them.
 */
@Service
public class PlatformService {

    static final UUID OWNER_ROLE = UUID.fromString("00000000-0000-0000-0001-000000000001");

    private final NamedParameterJdbcTemplate jdbc;
    private final TenantModules modules;
    private final AuditService audit;
    private final PlatformAdminRepository admins;
    private final BusinessContext businessContext;
    private final TransactionTemplate tx;

    public PlatformService(NamedParameterJdbcTemplate jdbc, TenantModules modules, AuditService audit,
                           PlatformAdminRepository admins, BusinessContext businessContext,
                           PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.modules = modules;
        this.audit = audit;
        this.admins = admins;
        this.businessContext = businessContext;
        this.tx = new TransactionTemplate(txManager);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Catalogues
    // ---------------------------------------------------------------------------------------------------------

    public List<IndustryOption> industries() {
        return Arrays.stream(IndustryTemplate.values())
                .map(t -> new IndustryOption(t.name(), t.label(), t.description(),
                        t.modules().stream().map(Enum::name).sorted().toList(), t.units(), t.categories()))
                .toList();
    }

    public List<ModuleOption> moduleCatalog() {
        return Arrays.stream(ModuleCode.values())
                .map(m -> new ModuleOption(m.name(), m.label(), m.enabledByDefault(), m.requires().stream().map(Enum::name).toList()))
                .toList();
    }

    // ---------------------------------------------------------------------------------------------------------
    // Tenants
    // ---------------------------------------------------------------------------------------------------------

    private static final String SUMMARY_SQL = """
            SELECT b.id, b.tenant_code, b.name, b.industry, b.status, b.owner_name, b.owner_mobile, b.city, b.state,
                   b.created_at, b.logo_file_id, b.plan_code,
                   (SELECT count(*) FROM users u WHERE u.business_id = b.id) AS users,
                   (SELECT count(*) FROM customers c WHERE c.business_id = b.id) AS customers,
                   (SELECT count(*) FROM products p WHERE p.business_id = b.id) AS products,
                   (SELECT count(*) FROM invoices i WHERE i.business_id = b.id) AS invoices,
                   (SELECT max(a.created_at) FROM audit_logs a WHERE a.business_id = b.id) AS last_activity
            FROM businesses b
            """;

    public List<TenantSummary> listTenants(String q, String status, String industry) {
        return platform(() -> {
            StringBuilder sql = new StringBuilder(SUMMARY_SQL).append(" WHERE 1 = 1");
            MapSqlParameterSource p = new MapSqlParameterSource();
            if (q != null && !q.isBlank()) {
                sql.append(" AND (lower(b.name) LIKE :q OR lower(b.tenant_code) LIKE :q OR b.owner_mobile LIKE :q"
                        + " OR lower(coalesce(b.owner_name, '')) LIKE :q OR lower(coalesce(b.city, '')) LIKE :q)");
                p.addValue("q", "%" + q.trim().toLowerCase(Locale.ROOT) + "%");
            }
            if (status != null && !status.isBlank()) {
                sql.append(" AND b.status = :status");
                p.addValue("status", status.trim().toUpperCase(Locale.ROOT));
            }
            if (industry != null && !industry.isBlank()) {
                sql.append(" AND b.industry = :industry");
                p.addValue("industry", industry.trim().toUpperCase(Locale.ROOT));
            }
            sql.append(" ORDER BY b.created_at DESC");
            return jdbc.query(sql.toString(), p, (rs, i) -> summary(rs));
        });
    }

    public TenantDetail tenant(UUID id) {
        return platform(() -> {
            Map<String, Object> b;
            try {
                b = jdbc.queryForMap("SELECT * FROM businesses WHERE id = :id", Map.of("id", id));
            } catch (EmptyResultDataAccessException e) {
                throw BusinessException.notFound(ErrorCode.TENANT_NOT_FOUND, "Business");
            }
            MapSqlParameterSource p = new MapSqlParameterSource("id", id);
            TenantUsage usage = jdbc.queryForObject("""
                    SELECT (SELECT count(*) FROM users WHERE business_id = :id) AS users,
                           (SELECT count(DISTINCT u.id) FROM users u JOIN user_roles ur ON ur.user_id = u.id
                                JOIN roles r ON r.id = ur.role_id WHERE u.business_id = :id AND r.code IN ('OWNER','ADMIN')) AS staff,
                           (SELECT count(*) FROM customers WHERE business_id = :id) AS customers,
                           (SELECT count(*) FROM suppliers WHERE business_id = :id) AS suppliers,
                           (SELECT count(*) FROM products WHERE business_id = :id) AS products,
                           (SELECT count(*) FROM orders WHERE business_id = :id) AS orders,
                           (SELECT count(*) FROM invoices WHERE business_id = :id) AS invoices,
                           (SELECT coalesce(sum(grand_total), 0) FROM invoices WHERE business_id = :id
                                AND status NOT IN ('DRAFT','CANCELLED') AND invoice_date >= current_date - 30) AS sales30,
                           (SELECT coalesce(sum(size_bytes), 0) FROM stored_files WHERE business_id = :id) AS storage,
                           (SELECT max(created_at) FROM audit_logs WHERE business_id = :id) AS last_activity
                    """, p, (rs, i) -> new TenantUsage(rs.getLong("users"), rs.getLong("staff"), rs.getLong("customers"),
                    rs.getLong("suppliers"), rs.getLong("products"), rs.getLong("orders"), rs.getLong("invoices"),
                    rs.getBigDecimal("sales30"), rs.getLong("storage"), instant(rs, "last_activity")));
            List<OwnerContact> owners = jdbc.query("""
                    SELECT u.id, u.full_name, u.mobile_number, u.email, u.status, u.last_login_at
                    FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
                    WHERE u.business_id = :id AND r.code = 'OWNER' ORDER BY u.created_at
                    """, p, (rs, i) -> new OwnerContact(rs.getObject("id", UUID.class), rs.getString("full_name"),
                    rs.getString("mobile_number"), rs.getString("email"), rs.getString("status"), instant(rs, "last_login_at")));
            String industryCode = (String) b.get("industry");
            String code = (String) b.get("tenant_code");
            String planCode = (String) b.get("plan_code");
            String planName = jdbc.queryForObject("SELECT name FROM plans WHERE code = :c", Map.of("c", planCode), String.class);
            return new TenantDetail(id, code, (String) b.get("name"), (String) b.get("legal_name"), industryCode,
                    industryLabel(industryCode), (String) b.get("status"), (String) b.get("status_reason"),
                    (String) b.get("owner_name"), (String) b.get("owner_mobile"), (String) b.get("gstin"),
                    (String) b.get("address_line1"), (String) b.get("city"), (String) b.get("state"),
                    (String) b.get("state_code"), (String) b.get("pincode"), (String) b.get("email"),
                    (String) b.get("phone"), BusinessContext.logoUrl((UUID) b.get("logo_file_id")),
                    ((Timestamp) b.get("created_at")).toInstant(), usage, moduleStates(id), owners, "/join/" + code, planCode, planName,
                    (String) b.get("custom_domain"));
        });
    }

    public TenantDetail createTenant(CreateTenantRequest r) {
        IndustryTemplate template = industry(r.industry());
        String ownerMobile = MobileNumbers.normalize(r.ownerMobile());
        String planCode = r.planCode() == null || r.planCode().isBlank() ? "STARTER" : requirePlan(r.planCode());
        UUID id = UUID.randomUUID();
        UUID actor = CurrentUser.id();
        TenantContext.callAsPlatformIn(id, () -> tx.execute(status -> {
            String code = r.tenantCode() == null || r.tenantCode().isBlank() ? uniqueCode(r.name()) : r.tenantCode();
            if (exists("SELECT count(*) FROM businesses WHERE tenant_code = :c", Map.of("c", code))) {
                throw BusinessException.validation("tenantCode", "This code is already used by another business");
            }
            Timestamp now = Timestamp.from(Instant.now());
            MapSqlParameterSource b = new MapSqlParameterSource()
                    .addValue("id", id).addValue("name", r.name().trim()).addValue("legal", blankToNull(r.legalName()))
                    .addValue("state", r.state().trim()).addValue("stateCode", r.stateCode()).addValue("city", blankToNull(r.city()))
                    .addValue("gstin", blankToNull(r.gstin())).addValue("email", blankToNull(r.email()))
                    .addValue("code", code).addValue("industry", template.name()).addValue("ownerName", r.ownerName().trim())
                    .addValue("ownerMobile", ownerMobile).addValue("by", actor).addValue("now", now).addValue("plan", planCode);
            jdbc.update("""
                    INSERT INTO businesses (id, name, legal_name, state, state_code, city, gstin, email, mobile, timezone, currency,
                        financial_year_start_month, tenant_code, status, industry, owner_name, owner_mobile, created_by,
                        authorized_signatory, plan_code, plan_changed_at, created_at, updated_at)
                    VALUES (:id, :name, :legal, :state, :stateCode, :city, :gstin, :email, :ownerMobile, 'Asia/Kolkata', 'INR', 4,
                        :code, 'ACTIVE', :industry, :ownerName, :ownerMobile, :by, 'For ' || :name, :plan, :now, :now, :now)
                    """, b);
            jdbc.update("INSERT INTO business_settings (business_id, updated_at) VALUES (:id, :now)", b);
            jdbc.update("""
                    INSERT INTO invoice_settings (business_id, default_payment_terms, default_terms, default_footer, declaration, updated_at)
                    VALUES (:id, 'As per agreed credit terms',
                        '1. Goods once sold will not be taken back without prior approval.' || chr(10) || '2. Interest may be charged on overdue amounts.',
                        'This is a Computer Generated Invoice',
                        'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
                        :now)
                    """, b);
            jdbc.update("INSERT INTO tax_settings (business_id, updated_at) VALUES (:id, :now)", b);
            UUID ownerId = insertOwner(id, r.ownerName().trim(), ownerMobile, blankToNull(r.email()), actor, now);
            int order = 0;
            for (String category : template.categories()) {
                jdbc.update("""
                        INSERT INTO categories (id, business_id, name, sort_order, active, created_at, updated_at)
                        VALUES (:cid, :id, :cname, :sort, TRUE, :now, :now)
                        """, new MapSqlParameterSource(b.getValues()).addValue("cid", UUID.randomUUID())
                        .addValue("cname", category).addValue("sort", order++));
            }
            Map<ModuleCode, Boolean> initial = new EnumMap<>(ModuleCode.class);
            template.modules().forEach(m -> initial.put(m, true));
            initial.putAll(parseModules(r.modules()));
            modules.set(id, initial, actor);
            audit.record(AuditAction.TENANT_CREATED, "BUSINESS", id, null, Map.of("tenantCode", code, "name", r.name().trim(),
                    "industry", template.name(), "ownerUserId", ownerId, "ownerMobile", ownerMobile));
            return null;
        }));
        return tenant(id);
    }

    public TenantDetail updateTenant(UUID id, UpdateTenantRequest r) {
        TenantDetail before = tenant(id);
        TenantContext.callAsPlatformIn(id, () -> tx.execute(status -> {
            MapSqlParameterSource p = new MapSqlParameterSource("id", id)
                    .addValue("name", r.name() == null || r.name().isBlank() ? before.name() : r.name().trim())
                    .addValue("legal", r.legalName() == null ? before.legalName() : blankToNull(r.legalName()))
                    .addValue("industry", r.industry() == null || r.industry().isBlank() ? before.industry() : industry(r.industry()).name())
                    .addValue("ownerName", r.ownerName() == null || r.ownerName().isBlank() ? before.ownerName() : r.ownerName().trim())
                    .addValue("ownerMobile", r.ownerMobile() == null || r.ownerMobile().isBlank() ? before.ownerMobile()
                            : MobileNumbers.normalize(r.ownerMobile()))
                    .addValue("now", Timestamp.from(Instant.now()));
            jdbc.update("""
                    UPDATE businesses SET name = :name, legal_name = :legal, industry = :industry, owner_name = :ownerName,
                        owner_mobile = :ownerMobile, updated_at = :now, version = version + 1 WHERE id = :id
                    """, p);
            audit.record(AuditAction.TENANT_UPDATED, "BUSINESS", id,
                    Map.of("name", before.name(), "industry", before.industry()),
                    Map.of("name", p.getValue("name"), "industry", p.getValue("industry")));
            return null;
        }));
        businessContext.evict(id);
        return tenant(id);
    }

    /** Moves a tenant to another plan (§0B.14). Existing data above the new limits stays; only new items are blocked. */
    public TenantDetail changePlan(UUID id, String planCode) {
        TenantDetail before = tenant(id);
        String plan = requirePlan(planCode);
        TenantContext.callAsPlatformIn(id, () -> tx.execute(status -> {
            jdbc.update("UPDATE businesses SET plan_code = :plan, plan_changed_at = :now, updated_at = :now, version = version + 1 WHERE id = :id",
                    new MapSqlParameterSource("id", id).addValue("plan", plan).addValue("now", Timestamp.from(Instant.now())));
            audit.record(AuditAction.TENANT_PLAN_CHANGED, "BUSINESS", id, Map.of("plan", before.planCode()), Map.of("plan", plan));
            return null;
        }));
        return tenant(id);
    }

    /** Custom domain (or subdomain) that opens ShopFlow already pointed at this tenant; DNS/TLS are set up at deploy. */
    public TenantDetail setDomain(UUID id, String domain) {
        TenantDetail before = tenant(id);
        String value = domain == null || domain.isBlank() ? null : domain.trim().toLowerCase(Locale.ROOT);
        TenantContext.callAsPlatformIn(id, () -> tx.execute(status -> {
            if (value != null && exists("SELECT count(*) FROM businesses WHERE lower(custom_domain) = :d AND id <> :id", Map.of("d", value, "id", id))) {
                throw BusinessException.validation("domain", "This domain is already used by another business");
            }
            jdbc.update("UPDATE businesses SET custom_domain = :d, updated_at = now(), version = version + 1 WHERE id = :id",
                    new MapSqlParameterSource("id", id).addValue("d", value));
            Map<String, Object> oldValue = new LinkedHashMap<>();
            oldValue.put("domain", before.customDomain());
            Map<String, Object> newValue = new LinkedHashMap<>();
            newValue.put("domain", value);
            audit.record(AuditAction.TENANT_DOMAIN_CHANGED, "BUSINESS", id, oldValue, newValue);
            return null;
        }));
        return tenant(id);
    }

    private String requirePlan(String code) {
        String plan = code.trim().toUpperCase(Locale.ROOT);
        if (!exists("SELECT count(*) FROM plans WHERE code = :c AND active", Map.of("c", plan))) {
            throw BusinessException.validation("planCode", "Unknown plan " + plan);
        }
        return plan;
    }

    public TenantDetail suspend(UUID id, String reason) {
        TenantDetail before = tenant(id);
        if ("SUSPENDED".equals(before.status())) {
            throw new BusinessException(ErrorCode.CONFLICT, "This business is already suspended");
        }
        TenantContext.callAsPlatformIn(id, () -> tx.execute(status -> {
            Timestamp now = Timestamp.from(Instant.now());
            MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("reason", reason.trim()).addValue("now", now);
            jdbc.update("UPDATE businesses SET status = 'SUSPENDED', status_reason = :reason, updated_at = :now, version = version + 1 WHERE id = :id", p);
            // Every signed-in session of the tenant ends now (access tokens also fail the session check at once).
            jdbc.update("""
                    UPDATE refresh_tokens SET revoked_at = :now WHERE revoked_at IS NULL
                      AND session_id IN (SELECT id FROM user_sessions WHERE business_id = :id AND revoked_at IS NULL)
                    """, p);
            jdbc.update("UPDATE user_sessions SET revoked_at = :now, revoke_reason = 'TENANT_SUSPENDED' WHERE business_id = :id AND revoked_at IS NULL", p);
            audit.record(AuditAction.TENANT_SUSPENDED, "BUSINESS", id, Map.of("status", before.status()),
                    Map.of("status", "SUSPENDED", "reason", reason.trim()));
            return null;
        }));
        return tenant(id);
    }

    public TenantDetail reactivate(UUID id, String reason) {
        TenantDetail before = tenant(id);
        if ("ACTIVE".equals(before.status())) {
            throw new BusinessException(ErrorCode.CONFLICT, "This business is already active");
        }
        TenantContext.callAsPlatformIn(id, () -> tx.execute(status -> {
            jdbc.update("UPDATE businesses SET status = 'ACTIVE', status_reason = :reason, updated_at = :now, version = version + 1 WHERE id = :id",
                    new MapSqlParameterSource("id", id).addValue("reason", reason.trim()).addValue("now", Timestamp.from(Instant.now())));
            audit.record(AuditAction.TENANT_REACTIVATED, "BUSINESS", id, Map.of("status", before.status()),
                    Map.of("status", "ACTIVE", "reason", reason.trim()));
            return null;
        }));
        return tenant(id);
    }

    public List<ModuleState> setModules(UUID id, Map<String, Boolean> changes) {
        tenant(id);
        Map<ModuleCode, Boolean> parsed = parseModules(changes);
        Map<ModuleCode, Boolean> before = modules.effective(id);
        TenantContext.callAsPlatformIn(id, () -> tx.execute(status -> {
            Map<ModuleCode, Boolean> after = modules.set(id, parsed, CurrentUser.id());
            Map<String, Boolean> diffBefore = new LinkedHashMap<>();
            Map<String, Boolean> diffAfter = new LinkedHashMap<>();
            after.forEach((m, on) -> {
                if (!on.equals(before.get(m))) {
                    diffBefore.put(m.name(), before.get(m));
                    diffAfter.put(m.name(), on);
                }
            });
            if (!diffAfter.isEmpty()) {
                audit.record(AuditAction.TENANT_MODULES_CHANGED, "BUSINESS", id, diffBefore, diffAfter);
            }
            return null;
        }));
        return moduleStates(id);
    }

    public TenantDetail addOwner(UUID id, AddOwnerRequest r) {
        tenant(id);
        String mobile = MobileNumbers.normalize(r.mobileNumber());
        TenantContext.callAsPlatformIn(id, () -> tx.execute(status -> {
            if (exists("SELECT count(*) FROM users WHERE business_id = :id AND mobile_number = :m", Map.of("id", id, "m", mobile))) {
                throw new BusinessException(ErrorCode.CONFLICT, "This mobile number already has an account in this business");
            }
            UUID ownerId = insertOwner(id, r.fullName().trim(), mobile, blankToNull(r.email()), CurrentUser.id(), Timestamp.from(Instant.now()));
            audit.record(AuditAction.TENANT_OWNER_ADDED, "USER", ownerId, null, Map.of("mobile", mobile, "name", r.fullName().trim()));
            return null;
        }));
        return tenant(id);
    }

    public PlatformOverview overview() {
        return platform(() -> {
            Map<String, Object> totals = jdbc.queryForMap("""
                    SELECT (SELECT count(*) FROM businesses) AS tenants,
                           (SELECT count(*) FROM businesses WHERE status = 'ACTIVE') AS active,
                           (SELECT count(*) FROM businesses WHERE status = 'SUSPENDED') AS suspended,
                           (SELECT count(*) FROM users) AS users,
                           (SELECT count(*) FROM invoices WHERE status NOT IN ('DRAFT','CANCELLED') AND invoice_date >= current_date - 30) AS inv30,
                           (SELECT coalesce(sum(grand_total), 0) FROM invoices WHERE status NOT IN ('DRAFT','CANCELLED')
                                AND invoice_date >= current_date - 30) AS sales30
                    """, Map.of());
            Map<String, Long> byIndustry = new LinkedHashMap<>();
            jdbc.query("SELECT industry, count(*) FROM businesses GROUP BY industry ORDER BY count(*) DESC, industry", Map.of(),
                    rs -> {
                        byIndustry.put(rs.getString(1), rs.getLong(2));
                    });
            List<TenantSummary> newest = jdbc.query(SUMMARY_SQL + " ORDER BY b.created_at DESC LIMIT 5", Map.of(), (rs, i) -> summary(rs));
            return new PlatformOverview(((Number) totals.get("tenants")).longValue(), ((Number) totals.get("active")).longValue(),
                    ((Number) totals.get("suspended")).longValue(), ((Number) totals.get("users")).longValue(),
                    ((Number) totals.get("inv30")).longValue(), (BigDecimal) totals.get("sales30"), byIndustry, newest);
        });
    }

    public List<PlatformAuditEntry> auditLog(UUID businessId, String action, int limit) {
        return platform(() -> {
            StringBuilder sql = new StringBuilder("""
                    SELECT a.id, a.business_id, b.name AS business_name, a.action, a.entity_type, a.entity_id, a.actor_role,
                           coalesce(pa.full_name, u.full_name) AS actor_name, a.new_value, a.created_at
                    FROM audit_logs a
                    LEFT JOIN businesses b ON b.id = a.business_id
                    LEFT JOIN platform_admins pa ON pa.id = a.actor_user_id
                    LEFT JOIN users u ON u.id = a.actor_user_id
                    WHERE 1 = 1
                    """);
            MapSqlParameterSource p = new MapSqlParameterSource("limit", Math.max(1, Math.min(limit, 500)));
            if (businessId != null) {
                sql.append(" AND a.business_id = :bid");
                p.addValue("bid", businessId);
            } else {
                // Without a tenant filter, show platform activity: console actions and super-admin sign-ins.
                sql.append(" AND (a.action LIKE 'TENANT_%' OR a.action LIKE 'PLATFORM_%' OR a.action = 'SUPPORT_ACCESS_STARTED' OR a.actor_role = 'SUPER_ADMIN')");
            }
            if (action != null && !action.isBlank()) {
                sql.append(" AND a.action = :action");
                p.addValue("action", action.trim().toUpperCase(Locale.ROOT));
            }
            sql.append(" ORDER BY a.created_at DESC LIMIT :limit");
            return jdbc.query(sql.toString(), p, (rs, i) -> new PlatformAuditEntry(rs.getObject("id", UUID.class),
                    rs.getObject("business_id", UUID.class), rs.getString("business_name"), rs.getString("action"),
                    rs.getString("entity_type"), rs.getObject("entity_id", UUID.class), rs.getString("actor_role"),
                    rs.getString("actor_name"), rs.getString("new_value"), instant(rs, "created_at")));
        });
    }

    // ---------------------------------------------------------------------------------------------------------
    // Platform admins
    // ---------------------------------------------------------------------------------------------------------

    public List<PlatformAdminResponse> listAdmins() {
        return admins.findAllByOrderByFullNameAsc().stream().map(PlatformService::toResponse).toList();
    }

    public PlatformAdminResponse createAdmin(CreatePlatformAdminRequest r) {
        String mobile = MobileNumbers.normalize(r.mobileNumber());
        return TenantContext.callAsPlatform(() -> tx.execute(status -> {
            if (admins.findByMobileNumber(mobile).isPresent()) {
                throw new BusinessException(ErrorCode.CONFLICT, "This number is already a platform admin");
            }
            PlatformAdmin a = new PlatformAdmin();
            a.setFullName(r.fullName().trim());
            a.setMobileNumber(mobile);
            admins.save(a);
            audit.record(AuditAction.PLATFORM_ADMIN_CREATED, "PLATFORM_ADMIN", a.getId(), null, Map.of("mobile", mobile, "name", a.getFullName()));
            return toResponse(a);
        }));
    }

    public PlatformAdminResponse updateAdmin(UUID id, UpdatePlatformAdminRequest r) {
        return TenantContext.callAsPlatform(() -> tx.execute(status -> {
            PlatformAdmin a = admins.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Platform admin"));
            Map<String, Object> before = Map.of("name", a.getFullName(), "status", a.getStatus());
            if (r.fullName() != null && !r.fullName().isBlank()) {
                a.setFullName(r.fullName().trim());
            }
            if (r.status() != null) {
                if ("INACTIVE".equals(r.status()) && id.equals(CurrentUser.id())) {
                    throw new BusinessException(ErrorCode.CONFLICT, "You cannot deactivate yourself");
                }
                if ("INACTIVE".equals(r.status()) && a.isActive() && admins.findAll().stream().filter(PlatformAdmin::isActive).count() <= 1) {
                    throw new BusinessException(ErrorCode.CONFLICT, "At least one platform admin must stay active");
                }
                a.setStatus(r.status());
                if ("INACTIVE".equals(r.status())) {
                    jdbc.update("UPDATE user_sessions SET revoked_at = now(), revoke_reason = 'PLATFORM_ADMIN_INACTIVE' WHERE platform_admin_id = :id AND revoked_at IS NULL",
                            Map.of("id", id));
                }
            }
            audit.record(AuditAction.PLATFORM_ADMIN_UPDATED, "PLATFORM_ADMIN", id, before, Map.of("name", a.getFullName(), "status", a.getStatus()));
            return toResponse(a);
        }));
    }

    // ---------------------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------------------

    private UUID insertOwner(UUID businessId, String name, String mobile, String email, UUID actor, Timestamp now) {
        UUID ownerId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (id, business_id, mobile_number, full_name, email, status, created_at, updated_at, created_by)
                VALUES (:uid, :bid, :mobile, :name, :email, 'ACTIVE', :now, :now, :by)
                """, new MapSqlParameterSource().addValue("uid", ownerId).addValue("bid", businessId).addValue("mobile", mobile)
                .addValue("name", name).addValue("email", email).addValue("now", now).addValue("by", actor));
        jdbc.update("INSERT INTO user_roles (user_id, role_id) VALUES (:uid, :rid)", Map.of("uid", ownerId, "rid", OWNER_ROLE));
        return ownerId;
    }

    private List<ModuleState> moduleStates(UUID tenantId) {
        Map<ModuleCode, Boolean> effective = modules.effective(tenantId);
        List<ModuleState> list = new ArrayList<>();
        for (ModuleCode m : ModuleCode.values()) {
            list.add(new ModuleState(m.name(), m.label(), effective.get(m), m.enabledByDefault(),
                    m.requires().stream().map(Enum::name).toList()));
        }
        return list;
    }

    private static Map<ModuleCode, Boolean> parseModules(Map<String, Boolean> raw) {
        Map<ModuleCode, Boolean> parsed = new EnumMap<>(ModuleCode.class);
        if (raw == null) {
            return parsed;
        }
        raw.forEach((k, v) -> {
            try {
                parsed.put(ModuleCode.valueOf(k), Boolean.TRUE.equals(v));
            } catch (IllegalArgumentException e) {
                throw BusinessException.validation("modules", "Unknown module " + k);
            }
        });
        return parsed;
    }

    private static IndustryTemplate industry(String code) {
        try {
            return IndustryTemplate.valueOf(code.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw BusinessException.validation("industry", "Choose an industry");
        }
    }

    private static String industryLabel(String code) {
        try {
            return IndustryTemplate.valueOf(code).label();
        } catch (IllegalArgumentException e) {
            return code;
        }
    }

    /** A join-link code from the business name: lowercase words joined by hyphens, made unique with a suffix. */
    String uniqueCode(String name) {
        String base = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        if (base.length() > 32) {
            base = base.substring(0, 32).replaceAll("-+$", "");
        }
        if (base.length() < 3) {
            base = "shop" + (base.isEmpty() ? "" : "-" + base);
        }
        String code = base;
        for (int i = 2; exists("SELECT count(*) FROM businesses WHERE tenant_code = :c", Map.of("c", code)); i++) {
            code = base + "-" + i;
        }
        return code;
    }

    private boolean exists(String countSql, Map<String, ?> params) {
        Long n = jdbc.queryForObject(countSql, params, Long.class);
        return n != null && n > 0;
    }

    private TenantSummary summary(ResultSet rs) throws SQLException {
        String industryCode = rs.getString("industry");
        return new TenantSummary(rs.getObject("id", UUID.class), rs.getString("tenant_code"), rs.getString("name"),
                industryCode, industryLabel(industryCode), rs.getString("status"), rs.getString("owner_name"),
                rs.getString("owner_mobile"), rs.getString("city"), rs.getString("state"), rs.getLong("users"),
                rs.getLong("customers"), rs.getLong("products"), rs.getLong("invoices"), instant(rs, "last_activity"),
                instant(rs, "created_at"), BusinessContext.logoUrl(rs.getObject("logo_file_id", UUID.class)), rs.getString("plan_code"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static PlatformAdminResponse toResponse(PlatformAdmin a) {
        return new PlatformAdminResponse(a.getId(), a.getFullName(), a.getMobileNumber(), a.getStatus(), a.getLastLoginAt(),
                a.getCreatedAt());
    }

    private <T> T platform(Supplier<T> work) {
        return TenantContext.callAsPlatform(work);
    }
}
