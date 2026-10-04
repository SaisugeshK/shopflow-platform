package com.shopflow.tenancy;

import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Reads and changes the per-tenant module switches (§0B.6). Values are cached briefly per tenant; a change made on
 * another instance is picked up within {@link #CACHE_TTL}.
 */
@Service
public class TenantModules {

    static final Duration CACHE_TTL = Duration.ofSeconds(30);

    private final JdbcTemplate jdbc;
    private final Map<UUID, Cached> cache = new ConcurrentHashMap<>();

    public TenantModules(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private record Cached(Map<ModuleCode, Boolean> values, Instant loadedAt) {
    }

    /** Whether the module is on for the current tenant. */
    public boolean isEnabled(ModuleCode module) {
        return effective(TenantContext.requireTenantId()).get(module);
    }

    /** Fails with 403 MODULE_DISABLED when the current tenant does not have the module. */
    public void require(ModuleCode module) {
        if (!isEnabled(module)) {
            throw new BusinessException(ErrorCode.MODULE_DISABLED,
                    "This feature (" + module.label() + ") is not enabled for your business");
        }
    }

    public Set<ModuleCode> enabled() {
        return enabled(TenantContext.requireTenantId());
    }

    public Set<ModuleCode> enabled(UUID tenantId) {
        Set<ModuleCode> on = EnumSet.noneOf(ModuleCode.class);
        effective(tenantId).forEach((k, v) -> {
            if (v) {
                on.add(k);
            }
        });
        return on;
    }

    /** Every module with its effective value for a tenant (defaults filled in). */
    public Map<ModuleCode, Boolean> effective(UUID tenantId) {
        Cached c = cache.get(tenantId);
        if (c != null && c.loadedAt().plus(CACHE_TTL).isAfter(Instant.now())) {
            return c.values();
        }
        Map<ModuleCode, Boolean> values = new EnumMap<>(ModuleCode.class);
        for (ModuleCode m : ModuleCode.values()) {
            values.put(m, m.enabledByDefault());
        }
        TenantContext.runAsPlatform(() -> jdbc.query("SELECT module_code, enabled FROM tenant_modules WHERE business_id = ?",
                rs -> {
                    try {
                        values.put(ModuleCode.valueOf(rs.getString(1)), rs.getBoolean(2));
                    } catch (IllegalArgumentException ignored) {
                        // a retired module code
                    }
                }, tenantId));
        Map<ModuleCode, Boolean> frozen = Collections.unmodifiableMap(values);
        cache.put(tenantId, new Cached(frozen, Instant.now()));
        return frozen;
    }

    /**
     * Applies switches for a tenant (platform console / tenant creation). Turning a module on also turns on what it
     * requires, unless that requirement is explicitly switched off in the same change, in which case the dependent
     * module stays off.
     */
    public Map<ModuleCode, Boolean> set(UUID tenantId, Map<ModuleCode, Boolean> changes, UUID changedBy) {
        Map<ModuleCode, Boolean> next = new EnumMap<>(effective(tenantId));
        next.putAll(changes);
        boolean changed = true;
        while (changed) {
            changed = false;
            for (ModuleCode m : ModuleCode.values()) {
                if (!next.get(m)) {
                    continue;
                }
                for (ModuleCode required : m.requires()) {
                    if (!next.get(required)) {
                        if (Boolean.FALSE.equals(changes.get(required)) || !Boolean.TRUE.equals(changes.get(m))) {
                            next.put(m, false);
                        } else {
                            next.put(required, true);
                        }
                        changed = true;
                    }
                }
            }
        }
        Timestamp now = Timestamp.from(Instant.now());
        TenantContext.runAsPlatform(() -> next.forEach((m, on) -> jdbc.update("""
                INSERT INTO tenant_modules (business_id, module_code, enabled, updated_at, updated_by) VALUES (?,?,?,?,?)
                ON CONFLICT (business_id, module_code) DO UPDATE SET enabled = EXCLUDED.enabled,
                    updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
                WHERE tenant_modules.enabled IS DISTINCT FROM EXCLUDED.enabled
                """, tenantId, m.name(), on, now, changedBy)));
        cache.remove(tenantId);
        return effective(tenantId);
    }
}
