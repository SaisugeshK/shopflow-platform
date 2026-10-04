package com.shopflow.branches;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * The branch / warehouse the current request works at (§0B.14): sent by the clients as the {@code X-Branch-Id} header
 * (the branch switcher), or set by the server for stock transfers. Unvalidated here; {@link BranchResolver} checks it.
 */
public final class BranchContext {

    private static final ThreadLocal<UUID> CURRENT = new ThreadLocal<>();

    private BranchContext() {
    }

    public static Optional<UUID> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    static void set(UUID branchId) {
        if (branchId == null) {
            CURRENT.remove();
        } else {
            CURRENT.set(branchId);
        }
    }

    static void clear() {
        CURRENT.remove();
    }

    /** Runs {@code work} at {@code branchId} and restores the previous branch afterwards. */
    public static <T> T callAt(UUID branchId, Supplier<T> work) {
        UUID previous = CURRENT.get();
        set(branchId);
        try {
            return work.get();
        } finally {
            set(previous);
        }
    }
}
