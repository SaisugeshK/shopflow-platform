package com.shopflow.integrations;

/**
 * Failure calling an external provider. {@code retryable} tells callers whether a retry with backoff is safe.
 */
public class ProviderException extends RuntimeException {

    private final boolean retryable;
    private final boolean timeout;

    public ProviderException(String message, boolean retryable, boolean timeout) {
        super(message);
        this.retryable = retryable;
        this.timeout = timeout;
    }

    public static ProviderException timeout(String provider) {
        return new ProviderException(provider + " timed out", true, true);
    }

    public static ProviderException rejected(String provider, String reason) {
        return new ProviderException(provider + " rejected the request: " + reason, false, false);
    }

    public static ProviderException unavailable(String provider) {
        return new ProviderException(provider + " is unavailable", true, false);
    }

    public boolean retryable() {
        return retryable;
    }

    public boolean timeout() {
        return timeout;
    }
}
