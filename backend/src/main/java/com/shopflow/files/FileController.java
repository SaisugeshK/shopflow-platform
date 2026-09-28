package com.shopflow.files;

import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Set;
import java.util.UUID;

/**
 * Serves non-sensitive images (product images, business logo) so they can be used in &lt;img&gt; tags. Documents such
 * as invoice PDFs are only served through their authorised endpoints.
 */
@RestController
@RequestMapping("/api/v1/files")
@Tag(name = "Files", description = "Public product images and logo")
public class FileController {

    private static final Set<String> PUBLIC_PURPOSES = Set.of("PRODUCT_IMAGE", "BUSINESS_LOGO");

    private final FileService files;

    public FileController(FileService files) {
        this.files = files;
    }

    @GetMapping("/public/{id}")
    @Operation(summary = "Get a public image", description = "Only product images and the business logo are served here.")
    public ResponseEntity<byte[]> publicFile(@PathVariable UUID id) {
        StoredFile file = files.get(id);
        if (!PUBLIC_PURPOSES.contains(file.getPurpose())) {
            throw BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "File");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.getContentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic())
                .header("X-Content-Type-Options", "nosniff")
                .body(files.read(file));
    }
}
