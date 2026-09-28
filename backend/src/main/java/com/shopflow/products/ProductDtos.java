package com.shopflow.products;

import com.shopflow.common.util.Validation;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ProductDtos {

    private ProductDtos() {
    }

    public record CreateProductRequest(
            @Pattern(regexp = "^[A-Za-z0-9._-]{2,60}$", message = "SKU may contain letters, digits, dot, dash and underscore") String sku,
            @NotBlank @Size(max = 200) String name,
            @NotNull UUID categoryId,
            @Size(max = 120) String brand,
            @Size(max = 4000) String description,
            @Pattern(regexp = Validation.HSN, message = "HSN code must be 4-8 digits") String hsnCode,
            @NotNull Product.Unit unit,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal purchasePrice,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal sellingPrice,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal mrp,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal gstRate,
            @DecimalMin("0") @Digits(integer = 11, fraction = 3) BigDecimal minimumStock,
            @DecimalMin("0") @Digits(integer = 11, fraction = 3) BigDecimal openingStock,
            Boolean active,
            Boolean featured) {
    }

    /** Opening stock cannot be edited; use a stock adjustment instead. */
    public record UpdateProductRequest(
            @Size(max = 200) String name,
            UUID categoryId,
            @Size(max = 120) String brand,
            @Size(max = 4000) String description,
            @Pattern(regexp = Validation.HSN, message = "HSN code must be 4-8 digits") String hsnCode,
            Product.Unit unit,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal purchasePrice,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal sellingPrice,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal mrp,
            @DecimalMin("0") @DecimalMax("100") BigDecimal gstRate,
            @DecimalMin("0") @Digits(integer = 11, fraction = 3) BigDecimal minimumStock,
            Boolean featured) {
    }

    public record ImageResponse(UUID id, UUID fileId, String url, boolean primary) {
    }

    /** Staff view including internal cost and stock. */
    public record ProductResponse(UUID id, String sku, String name, UUID categoryId, String categoryName, UUID brandId,
                                  String brand, String description, String hsnCode, String unit,
                                  BigDecimal purchasePrice, BigDecimal sellingPrice, BigDecimal mrp, BigDecimal gstRate,
                                  BigDecimal minimumStock, BigDecimal onHand, BigDecimal reserved, BigDecimal available,
                                  String stockStatus, boolean active, boolean featured, String imageUrl,
                                  List<ImageResponse> images, Instant createdAt, Instant updatedAt) {
    }

    /** Customer view: no purchase cost, price resolved for the customer, stock shown only as policy allows. */
    public record CatalogProduct(UUID id, String sku, String name, UUID categoryId, String categoryName, String brand,
                                 String description, String hsnCode, String unit, BigDecimal price, BigDecimal mrp,
                                 BigDecimal gstRate, boolean customPrice, String stockStatus,
                                 BigDecimal availableQuantity, boolean featured, String imageUrl, List<String> images) {
    }

    public record CategoryRequest(@NotBlank @Size(max = 120) String name, @Size(max = 500) String description,
                                  UUID parentId, Integer sortOrder) {
    }

    public record UpdateCategoryRequest(@Size(max = 120) String name, @Size(max = 500) String description,
                                        UUID parentId, Integer sortOrder) {
    }

    public record CategoryResponse(UUID id, String name, String description, UUID parentId, int sortOrder,
                                   boolean active, long productCount) {
    }

    public record BrandResponse(UUID id, String name, boolean active) {
    }

    public record CustomerPriceRequest(@NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal price) {
    }

    public record CustomerPriceResponse(UUID productId, String sku, String productName, BigDecimal defaultPrice,
                                        BigDecimal customerPrice, Instant updatedAt) {
    }
}
