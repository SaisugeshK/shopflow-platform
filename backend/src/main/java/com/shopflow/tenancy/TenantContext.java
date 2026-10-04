package com.shopflow.tenancy;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * The tenant (business) the current thread works for, plus the audited platform-access flag (§0B.3).
 * <p>
 * Set from the access token for API requests ({@code TenantContextFilter} clears it afterwards), propagated to
 * background jobs, and switched explicitly with {@link #callInTenant} / {@link #callAsPlatform}. Every pooled
 * database connection receives the same values as PostgreSQL settings, which the row-level-security policies use.
 * With nothing set, the database returns no tenant rows at all (deny by default).
 */
public final class TenantContext {

    /** {@code tenantId} may be null for platform work that spans tenants. */
    public record State(UUID tenantId, boolean platform) {
        static final State NONE = new State(null, false);
    }

    private static final ThreadLocal<State> CURRENT = new ThreadLocal<>();
    private static volatile Runnable boundConnectionUpdater = () -> { };

    private TenantContext() {
    }

    public static State current() {
        State s = CURRENT.get();
        return s == null ? State.NONE : s;
    }

    public static Optional<UUID> tenantId() {
        return Optional.ofNullable(current().tenantId());
    }

    /** The current tenant; fails when the code runs outside any tenant (a programming error, never user input). */
    public static UUID requireTenantId() {
        return tenantId().orElseThrow(() -> new IllegalStateException("No tenant in context"));
    }

    public static boolean isPlatform() {
        return current().platform();
    }

    /** Replaces the thread's state (request entry points and job wrappers only). */
    public static void set(State state) {
        if (state == null || state.equals(State.NONE)) {
            CURRENT.remove();
        } else {
            CURRENT.set(state);
        }
        boundConnectionUpdater.run();
    }

    public static void clear() {
        set(null);
    }

    public static <T> T callInTenant(UUID tenantId, Supplier<T> work) {
        return callWith(new State(tenantId, false), work);
    }

    public static void runInTenant(UUID tenantId, Runnable work) {
        callInTenant(tenantId, () -> {
            work.run();
            return null;
        });
    }

    /** Cross-tenant platform work (sign-in lookups, super admin console, webhooks, sweepers). */
    public static <T> T callAsPlatform(Supplier<T> work) {
        return callWith(new State(current().tenantId(), true), work);
    }

    /**
     * Platform work that writes into one tenant (console actions): rows the database fills from the session tenant,
     * such as audit entries, belong to {@code tenantId}, so the tenant's owner can see them.
     */
    public static <T> T callAsPlatformIn(UUID tenantId, Supplier<T> work) {
        return callWith(new State(tenantId, true), work);
    }

    public static void runAsPlatform(Runnable work) {
        callAsPlatform(() -> {
            work.run();
            return null;
        });
    }

    private static <T> T callWith(State state, Supplier<T> work) {
        State previous = CURRENT.get();
        set(state);
        try {
            return work.get();
        } finally {
            set(previous);
        }
    }

    /** Captures the current state for a task that runs on another thread. */
    public static Runnable propagate(Runnable task) {
        State captured = CURRENT.get();
        return () -> {
            State previous = CURRENT.get();
            set(captured);
            try {
                task.run();
            } finally {
                set(previous);
            }
        };
    }

    /** Lets {@link TenantAwareDataSource} re-apply the settings to a connection already bound to a transaction. */
    static void onChange(Runnable updater) {
        boundConnectionUpdater = updater;
    }
}
