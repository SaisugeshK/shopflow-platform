package com.shopflow.integrations.storage;

import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import com.shopflow.config.AppProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.channels.Channels;
import java.nio.channels.ReadableByteChannel;

/**
 * Google Cloud Storage, used in production (§71). The bucket is private: nothing here is ever served directly from
 * GCS — {@code FileController} streams bytes back through the backend, so this class only needs to move bytes in
 * and out. Credentials come from the runtime's Application Default Credentials (the Cloud Run service identity);
 * no access/secret keys are configured.
 */
@Component
@ConditionalOnProperty(name = "app.storage.provider", havingValue = "gcs")
public class GcsStorageProvider implements StorageProvider {

    private final Storage client;
    private final String bucket;

    public GcsStorageProvider(AppProperties properties, @Value("${app.storage.gcs-project:#{null}}") String projectId) {
        this.bucket = properties.storage().bucket();
        if (bucket == null || bucket.isBlank()) {
            throw new IllegalStateException("app.storage.bucket must be set when app.storage.provider=gcs");
        }
        StorageOptions.Builder options = StorageOptions.newBuilder();
        if (projectId != null && !projectId.isBlank()) {
            options.setProjectId(projectId);
        }
        this.client = options.build().getService();
    }

    @Override
    public String name() {
        return "gcs";
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        BlobInfo info = BlobInfo.newBuilder(BlobId.of(bucket, key)).setContentType(contentType).build();
        client.create(info, content);
    }

    @Override
    public InputStream get(String key) {
        Blob blob = client.get(BlobId.of(bucket, key));
        if (blob == null) {
            throw new UncheckedIOException(new IOException("No such object: " + key));
        }
        ReadableByteChannel channel = blob.reader();
        return Channels.newInputStream(channel);
    }

    @Override
    public boolean exists(String key) {
        Blob blob = client.get(BlobId.of(bucket, key));
        return blob != null && blob.exists();
    }
}
