package com.shopflow.files;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "stored_files")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoredFile {

    @Id
    private UUID id;
    @Column(nullable = false)
    private String storageKey;
    private String originalName;
    @Column(nullable = false)
    private String contentType;
    private long sizeBytes;
    @Column(name = "checksum_sha256", nullable = false)
    private String checksumSha256;
    @Column(nullable = false)
    private String purpose;
    private UUID createdBy;
    @Column(nullable = false)
    private Instant createdAt;

    StoredFile(UUID id, String storageKey, String originalName, String contentType, long sizeBytes, String checksum,
               String purpose, UUID createdBy) {
        this.id = id;
        this.storageKey = storageKey;
        this.originalName = originalName;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.checksumSha256 = checksum;
        this.purpose = purpose;
        this.createdBy = createdBy;
        this.createdAt = Instant.now();
    }
}
