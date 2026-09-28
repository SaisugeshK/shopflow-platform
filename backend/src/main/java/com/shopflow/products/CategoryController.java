package com.shopflow.products;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Validation;
import com.shopflow.products.ProductDtos.BrandResponse;
import com.shopflow.products.ProductDtos.CategoryRequest;
import com.shopflow.products.ProductDtos.CategoryResponse;
import com.shopflow.products.ProductDtos.UpdateCategoryRequest;
import com.shopflow.products.ProductRepositories.BrandRepository;
import com.shopflow.products.ProductRepositories.CategoryRepository;
import com.shopflow.products.ProductRepositories.ProductRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Categories", description = "Product categories and brands")
@SecurityRequirement(name = "bearerAuth")
public class CategoryController {

    private final CategoryRepository categories;
    private final BrandRepository brands;
    private final ProductRepository products;
    private final BusinessContext businessContext;
    private final AuditService audit;

    public CategoryController(CategoryRepository categories, BrandRepository brands, ProductRepository products,
                              BusinessContext businessContext, AuditService audit) {
        this.categories = categories;
        this.brands = brands;
        this.products = products;
        this.businessContext = businessContext;
        this.audit = audit;
    }

    @GetMapping("/categories")
    @PreAuthorize("hasAuthority('PRODUCT_READ')")
    @Operation(summary = "List all categories", description = "Includes inactive categories and product counts. Customers use /catalog/categories.")
    public ApiResponse<List<CategoryResponse>> list() {
        return ApiResponse.ok(categories.findByBusinessIdOrderBySortOrderAscNameAsc(businessContext.businessId()).stream()
                .map(this::toResponse).toList());
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Transactional
    @Operation(summary = "Create a category")
    public ApiResponse<CategoryResponse> create(@Valid @RequestBody CategoryRequest request) {
        ensureUniqueName(request.name(), new UUID(0, 0));
        Category c = new Category();
        c.setBusinessId(businessContext.businessId());
        c.setName(request.name().trim());
        c.setDescription(Validation.trim(request.description()));
        c.setParentId(validParent(request.parentId(), null));
        c.setSortOrder(request.sortOrder() == null ? 0 : request.sortOrder());
        categories.saveAndFlush(c);
        audit.record(AuditAction.CATEGORY_CREATED, "CATEGORY", c.getId(), null, Map.of("name", c.getName()));
        return ApiResponse.ok(toResponse(c));
    }

    @PatchMapping("/categories/{id}")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Transactional
    @Operation(summary = "Update a category")
    public ApiResponse<CategoryResponse> update(@PathVariable UUID id, @Valid @RequestBody UpdateCategoryRequest request) {
        Category c = get(id);
        String before = c.getName();
        if (request.name() != null && !request.name().isBlank()) {
            ensureUniqueName(request.name(), id);
            c.setName(request.name().trim());
        }
        if (request.description() != null) {
            c.setDescription(Validation.trim(request.description()));
        }
        if (request.parentId() != null) {
            c.setParentId(validParent(request.parentId(), id));
        }
        if (request.sortOrder() != null) {
            c.setSortOrder(request.sortOrder());
        }
        categories.saveAndFlush(c);
        audit.record(AuditAction.CATEGORY_UPDATED, "CATEGORY", id, Map.of("name", before), Map.of("name", c.getName()));
        return ApiResponse.ok(toResponse(c));
    }

    @PostMapping("/categories/{id}/activate")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Transactional
    @Operation(summary = "Activate a category")
    public ApiResponse<CategoryResponse> activate(@PathVariable UUID id) {
        return setActive(id, true);
    }

    @PostMapping("/categories/{id}/deactivate")
    @PreAuthorize("hasAuthority('PRODUCT_WRITE')")
    @Transactional
    @Operation(summary = "Deactivate a category", description = "Products in an inactive category are hidden from the catalog.")
    public ApiResponse<CategoryResponse> deactivate(@PathVariable UUID id) {
        return setActive(id, false);
    }

    @GetMapping("/brands")
    @PreAuthorize("hasAuthority('PRODUCT_READ')")
    @Operation(summary = "List brands", description = "Brands are created automatically when a product names a new brand.")
    public ApiResponse<List<BrandResponse>> brands() {
        return ApiResponse.ok(brands.findByBusinessIdOrderByNameAsc(businessContext.businessId()).stream()
                .map(b -> new BrandResponse(b.getId(), b.getName(), b.isActive())).toList());
    }

    private ApiResponse<CategoryResponse> setActive(UUID id, boolean active) {
        Category c = get(id);
        c.setActive(active);
        categories.saveAndFlush(c);
        audit.record(AuditAction.CATEGORY_UPDATED, "CATEGORY", id, null, Map.of("active", active));
        return ApiResponse.ok(toResponse(c));
    }

    private Category get(UUID id) {
        return categories.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Category"));
    }

    private void ensureUniqueName(String name, UUID excludeId) {
        if (categories.nameTaken(businessContext.businessId(), name.trim(), excludeId)) {
            throw BusinessException.validation("name", "A category with this name already exists");
        }
    }

    private UUID validParent(UUID parentId, UUID selfId) {
        if (parentId == null) {
            return null;
        }
        if (parentId.equals(selfId)) {
            throw BusinessException.validation("parentId", "A category cannot be its own parent");
        }
        get(parentId);
        return parentId;
    }

    private CategoryResponse toResponse(Category c) {
        return new CategoryResponse(c.getId(), c.getName(), c.getDescription(), c.getParentId(), c.getSortOrder(),
                c.isActive(), products.countByCategoryId(c.getId()));
    }
}
