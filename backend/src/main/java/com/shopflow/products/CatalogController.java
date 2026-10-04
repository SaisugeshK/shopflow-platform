package com.shopflow.products;

import com.shopflow.business.BusinessContext;
import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.customers.CustomerService;
import com.shopflow.products.ProductDtos.CatalogProduct;
import com.shopflow.products.ProductDtos.CategoryResponse;
import com.shopflow.products.ProductRepositories.CategoryRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Customer catalog: active products in active categories, priced for the signed-in customer, without purchase cost.
 */
@RestController
@RequestMapping("/api/v1/catalog")
@Tag(name = "Catalog", description = "Customer product browsing with customer-specific prices")
@SecurityRequirement(name = "bearerAuth")
@PreAuthorize("hasAuthority('CATALOG_BROWSE')")
public class CatalogController {

    private final ProductService products;
    private final CategoryRepository categories;
    private final CustomerService customers;
    private final BusinessContext businessContext;

    public CatalogController(ProductService products, CategoryRepository categories, CustomerService customers,
                             BusinessContext businessContext) {
        this.products = products;
        this.categories = categories;
        this.customers = customers;
        this.businessContext = businessContext;
    }

    @GetMapping("/categories")
    @Operation(summary = "Active categories")
    public ApiResponse<List<CategoryResponse>> categories() {
        return ApiResponse.ok(categories.findByBusinessIdAndActiveTrueOrderBySortOrderAscNameAsc(businessContext.businessId()).stream()
                .map(c -> new CategoryResponse(c.getId(), c.getName(), c.getDescription(), c.getParentId(), c.getSortOrder(), true, 0))
                .toList());
    }

    @GetMapping("/products")
    @Operation(summary = "Browse products", description = "Active products in active categories. Prices are resolved for the signed-in customer. Sort: name, price (sellingPrice).")
    public ApiResponse<List<CatalogProduct>> list(@RequestParam(required = false) String q,
                                                  @RequestParam(required = false) UUID categoryId,
                                                  @RequestParam(required = false) Boolean featured,
                                                  @RequestParam(required = false) Integer page,
                                                  @RequestParam(required = false) Integer pageSize,
                                                  @RequestParam(required = false) String sort) {
        UUID customerId = customers.currentApprovedCustomer().getId();
        var pageable = PageQuery.of(page, pageSize, sort, java.util.Map.of("name", "name", "price", "sellingPrice"), Sort.by("name"));
        Page<Product> result = products.search(q, categoryId, true, featured, true, pageable);
        Set<UUID> activeCategories = activeCategoryIds();
        List<Product> visible = result.getContent().stream().filter(p -> activeCategories.contains(p.getCategoryId())).toList();
        return ApiResponse.page(new PageImpl<>(products.toCatalog(visible, customerId), pageable, result.getTotalElements()));
    }

    @GetMapping("/products/{id}")
    @Operation(summary = "Product detail for the customer")
    public ApiResponse<CatalogProduct> get(@PathVariable UUID id) {
        UUID customerId = customers.currentApprovedCustomer().getId();
        Product p = products.get(id);
        if (!p.isActive() || p.isVariantGroup() || !activeCategoryIds().contains(p.getCategoryId())) {
            throw new BusinessException(ErrorCode.PRODUCT_INACTIVE, "This product is not available");
        }
        return ApiResponse.ok(products.toCatalog(List.of(p), customerId).getFirst());
    }

    private Set<UUID> activeCategoryIds() {
        return categories.findByBusinessIdAndActiveTrueOrderBySortOrderAscNameAsc(businessContext.businessId()).stream()
                .map(Category::getId).collect(Collectors.toSet());
    }
}
