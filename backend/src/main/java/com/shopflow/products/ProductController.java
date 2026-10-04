package com.shopflow.products;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.products.ProductDtos.CreateProductRequest;
import com.shopflow.products.ProductDtos.ImageResponse;
import com.shopflow.products.ProductDtos.ProductResponse;
import com.shopflow.products.ProductDtos.UpdateProductRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * Staff product management. Customers browse through {@code /api/v1/catalog}, which never exposes purchase cost.
 */
@RestController
@RequestMapping("/api/v1/products")
@Tag(name = "Products", description = "Product master data (staff)")
@SecurityRequirement(name = "bearerAuth")
public class ProductController {

    private final ProductService service;

    public ProductController(ProductService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PRODUCT_READ')")
    @Operation(summary = "Search products", description = "Search by name, SKU or HSN; filter by category, active and featured. Sort: name, sku, sellingPrice, createdAt.")
    public ApiResponse<List<ProductResponse>> list(@RequestParam(required = false) String q,
                                                   @RequestParam(required = false) UUID categoryId,
                                                   @RequestParam(required = false) Boolean active,
                                                   @RequestParam(required = false) Boolean featured,
                                                   @RequestParam(required = false) Boolean sellable,
                                                   @RequestParam(required = false) Integer page,
                                                   @RequestParam(required = false) Integer pageSize,
                                                   @RequestParam(required = false) String sort) {
        var pageable = PageQuery.of(page, pageSize, sort, PageQuery.fields("name", "sku", "sellingPrice", "createdAt"), Sort.by("name"));
        Page<Product> result = service.search(q, categoryId, active, featured, Boolean.TRUE.equals(sellable), pageable);
        return ApiResponse.page(new PageImpl<>(service.toResponses(result.getContent()), pageable, result.getTotalElements()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('PRODUCT_READ')")
    @Operation(summary = "Get a product")
    public ApiResponse<ProductResponse> get(@PathVariable UUID id) {
        return ApiResponse.ok(service.toResponse(service.get(id)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Create a product", description = "SKU is generated when omitted. Opening stock is posted as an OPENING stock movement. GST rate must be an allowed rate.")
    public ApiResponse<ProductResponse> create(@Valid @RequestBody CreateProductRequest request) {
        return ApiResponse.ok(service.toResponse(service.create(request)), "Product created");
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Update a product", description = "Price changes affect new orders only; existing orders and invoices keep their snapshots.")
    public ApiResponse<ProductResponse> update(@PathVariable UUID id, @Valid @RequestBody UpdateProductRequest request) {
        return ApiResponse.ok(service.toResponse(service.update(id, request)));
    }

    @GetMapping("/{id}/variants")
    @PreAuthorize("hasAuthority('PRODUCT_READ')")
    @Operation(summary = "Variants of a group product")
    public ApiResponse<List<ProductResponse>> variants(@PathVariable UUID id) {
        return ApiResponse.ok(service.toResponses(service.variantsOf(id)));
    }

    @PostMapping("/{id}/variants")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Generate variants",
            description = "Makes the product a variant group and creates one product per combination of attribute values "
                    + "(VARIANTS module). Existing combinations are kept. Errors: MODULE_DISABLED, VALIDATION_ERROR.")
    public ApiResponse<List<ProductResponse>> generateVariants(@PathVariable UUID id, @Valid @RequestBody ProductDtos.GenerateVariantsRequest request) {
        return ApiResponse.ok(service.toResponses(service.generateVariants(id, request)), "Variants created");
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Activate a product")
    public ApiResponse<ProductResponse> activate(@PathVariable UUID id) {
        return ApiResponse.ok(service.toResponse(service.setActive(id, true)));
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Deactivate a product", description = "Inactive products are hidden from the catalog and cannot be ordered.")
    public ApiResponse<ProductResponse> deactivate(@PathVariable UUID id) {
        return ApiResponse.ok(service.toResponse(service.setActive(id, false)));
    }

    @PostMapping(path = "/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Upload a product image", description = "PNG, JPEG or WebP up to 5 MB; at most 8 images per product.")
    public ApiResponse<ImageResponse> addImage(@PathVariable UUID id, @RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(service.addImage(id, file));
    }

    @PostMapping("/{id}/images/{imageId}/primary")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Make an image the primary image")
    public ApiResponse<ProductResponse> setPrimary(@PathVariable UUID id, @PathVariable UUID imageId) {
        service.setPrimaryImage(id, imageId);
        return ApiResponse.ok(service.toResponse(service.get(id)));
    }

    @DeleteMapping("/{id}/images/{imageId}")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Remove a product image")
    public ApiResponse<ProductResponse> removeImage(@PathVariable UUID id, @PathVariable UUID imageId) {
        service.removeImage(id, imageId);
        return ApiResponse.ok(service.toResponse(service.get(id)));
    }
}
