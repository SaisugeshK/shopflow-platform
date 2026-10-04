package com.shopflow.files;

import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Hashing;
import com.shopflow.integrations.storage.StorageProvider;
import com.shopflow.security.CurrentUser;
import com.shopflow.tenancy.TenantContext;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;

/**
 * Stores uploaded images and generated documents through {@link StorageProvider}; metadata lives in stored_files.
 */
@Service
public class FileService {

    public static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;

    private static final Map<String, byte[][]> IMAGE_SIGNATURES = Map.of(
            "image/png", new byte[][]{{(byte) 0x89, 'P', 'N', 'G'}},
            "image/jpeg", new byte[][]{{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}},
            "image/webp", new byte[][]{{'R', 'I', 'F', 'F'}});

    private final StoredFileRepository repository;
    private final StorageProvider storage;

    public FileService(StoredFileRepository repository, StorageProvider storage) {
        this.repository = repository;
        this.storage = storage;
    }

    /** Validates type by magic bytes (not the client-supplied content type) and size before storing. */
    @Transactional
    public StoredFile storeImage(MultipartFile file, String purpose) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.FILE_INVALID, "File is empty");
        }
        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new BusinessException(ErrorCode.FILE_INVALID, "Image must be 5 MB or smaller");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        String detected = detectImageType(bytes);
        if (detected == null) {
            throw new BusinessException(ErrorCode.FILE_INVALID, "Only PNG, JPEG or WebP images are allowed");
        }
        String ext = switch (detected) {
            case "image/png" -> "png";
            case "image/jpeg" -> "jpg";
            default -> "webp";
        };
        return store(bytes, detected, sanitizeName(file.getOriginalFilename()), purpose, ext);
    }

    /** A PDF or an image (quotation, supplier invoice), up to 10 MB; the type is checked by its magic bytes. */
    @Transactional
    public StoredFile storeDocument(MultipartFile file, String purpose) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.FILE_INVALID, "File is empty");
        }
        if (file.getSize() > 2 * MAX_IMAGE_BYTES) {
            throw new BusinessException(ErrorCode.FILE_INVALID, "The file must be 10 MB or smaller");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        boolean pdf = bytes.length > 4 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F';
        if (pdf) {
            return store(bytes, "application/pdf", sanitizeName(file.getOriginalFilename()), purpose, "pdf");
        }
        String detected = detectImageType(bytes);
        if (detected == null) {
            throw new BusinessException(ErrorCode.FILE_INVALID, "Only PDF, PNG, JPEG or WebP files are allowed");
        }
        String ext = switch (detected) {
            case "image/png" -> "png";
            case "image/jpeg" -> "jpg";
            default -> "webp";
        };
        return store(bytes, detected, sanitizeName(file.getOriginalFilename()), purpose, ext);
    }

    @Transactional
    public StoredFile storeGenerated(byte[] bytes, String contentType, String name, String purpose, String ext) {
        return store(bytes, contentType, name, purpose, ext);
    }

    /** Looks a file up in any tenant: only for the public image endpoint, which serves non-sensitive purposes. */
    public StoredFile getPublic(UUID id) {
        return TenantContext.callAsPlatform(() -> get(id));
    }

    public StoredFile get(UUID id) {
        return repository.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "File"));
    }

    public InputStream open(StoredFile file) {
        return storage.get(file.getStorageKey());
    }

    public byte[] read(StoredFile file) {
        try (InputStream in = open(file)) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private StoredFile store(byte[] bytes, String contentType, String name, String purpose, String ext) {
        UUID id = UUID.randomUUID();
        // Object keys are grouped per tenant (§0B.3); files of a platform action (no tenant) go under "platform/".
        String prefix = TenantContext.tenantId().map(t -> "tenants/" + t + "/").orElse("platform/");
        String key = prefix + purpose.toLowerCase() + "/" + id + "." + ext;
        storage.put(key, bytes, contentType);
        StoredFile stored = new StoredFile(id, key, name, contentType, bytes.length, Hashing.sha256Hex(bytes), purpose,
                CurrentUser.idIfPresent().orElse(null));
        return repository.save(stored);
    }

    static String detectImageType(byte[] bytes) {
        for (Map.Entry<String, byte[][]> entry : IMAGE_SIGNATURES.entrySet()) {
            for (byte[] sig : entry.getValue()) {
                if (bytes.length >= sig.length && Arrays.equals(Arrays.copyOf(bytes, sig.length), sig)) {
                    if (entry.getKey().equals("image/webp")
                            && (bytes.length < 12 || bytes[8] != 'W' || bytes[9] != 'E' || bytes[10] != 'B' || bytes[11] != 'P')) {
                        continue;
                    }
                    return entry.getKey();
                }
            }
        }
        return null;
    }

    private static String sanitizeName(String name) {
        if (name == null) {
            return null;
        }
        String cleaned = name.replaceAll("[^A-Za-z0-9._-]", "_");
        return cleaned.substring(0, Math.min(cleaned.length(), 200));
    }

    public interface StoredFileRepository extends JpaRepository<StoredFile, UUID> {
    }
}
