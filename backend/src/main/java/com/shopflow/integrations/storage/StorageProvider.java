package com.shopflow.integrations.storage;

import java.io.InputStream;

/**
 * Object storage abstraction (§71). Local filesystem in development; an S3-compatible provider in production.
 * Files must never be kept only inside the application container.
 */
public interface StorageProvider {

    String name();

    void put(String key, byte[] content, String contentType);

    InputStream get(String key);

    boolean exists(String key);
}
