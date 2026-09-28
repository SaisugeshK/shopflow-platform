package com.shopflow.common.util;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory sliding-window limiter for abuse controls (OTP requests/verifications per number and per IP).
 * Suitable for a single backend instance; replace with a shared store (e.g. Redis) before scaling out
 * (recorded in DECISIONS.md).
 */
@Component
public class RateLimiter {

    private final Map<String, Deque<Instant>> windows = new ConcurrentHashMap<>();

    /** Records a hit and returns true when the caller is still within {@code limit} hits per {@code window}. */
    public boolean tryAcquire(String key, int limit, Duration window) {
        Instant now = Instant.now();
        Instant cutoff = now.minus(window);
        Deque<Instant> hits = windows.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (hits) {
            while (!hits.isEmpty() && hits.peekFirst().isBefore(cutoff)) {
                hits.pollFirst();
            }
            if (hits.size() >= limit) {
                return false;
            }
            hits.addLast(now);
            return true;
        }
    }

    /** Drops idle keys so the map cannot grow without bound. */
    @org.springframework.scheduling.annotation.Scheduled(fixedDelayString = "PT10M")
    public void evictIdle() {
        Instant cutoff = Instant.now().minus(Duration.ofHours(24));
        windows.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || e.getValue().peekLast().isBefore(cutoff);
            }
        });
    }

    public void reset(String key) {
        windows.remove(key);
    }

    /** Test hook. */
    public void clear() {
        windows.clear();
    }
}
