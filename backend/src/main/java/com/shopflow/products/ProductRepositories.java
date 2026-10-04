package com.shopflow.products;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepositories {

    interface CategoryRepository extends JpaRepository<Category, UUID> {
        List<Category> findByBusinessIdOrderBySortOrderAscNameAsc(UUID businessId);

        List<Category> findByBusinessIdAndActiveTrueOrderBySortOrderAscNameAsc(UUID businessId);

        @Query("SELECT count(c) > 0 FROM Category c WHERE c.businessId = :businessId AND lower(c.name) = lower(:name) AND c.id <> :excludeId")
        boolean nameTaken(@Param("businessId") UUID businessId, @Param("name") String name, @Param("excludeId") UUID excludeId);
    }

    interface BrandRepository extends JpaRepository<Brand, UUID> {
        List<Brand> findByBusinessIdOrderByNameAsc(UUID businessId);

        @Query("SELECT b FROM Brand b WHERE b.businessId = :businessId AND lower(b.name) = lower(:name)")
        Optional<Brand> findByName(@Param("businessId") UUID businessId, @Param("name") String name);
    }

    interface ProductRepository extends JpaRepository<Product, UUID>, JpaSpecificationExecutor<Product> {
        boolean existsByBusinessIdAndSkuIgnoreCase(UUID businessId, String sku);

        List<Product> findByIdIn(Collection<UUID> ids);

        long countByCategoryId(UUID categoryId);

        List<Product> findByParentIdOrderByNameAsc(UUID parentId);

        Optional<Product> findFirstByBarcode(String barcode);
    }

    interface ProductPriceRepository extends JpaRepository<ProductPrice, UUID> {
        Optional<ProductPrice> findByProductIdAndCustomerIdAndActiveTrue(UUID productId, UUID customerId);

        List<ProductPrice> findByCustomerIdAndActiveTrue(UUID customerId);

        List<ProductPrice> findByCustomerIdAndProductIdInAndActiveTrue(UUID customerId, Collection<UUID> productIds);
    }

    interface ProductUnitRepository extends JpaRepository<ProductUnit, UUID> {
        List<ProductUnit> findByProductIdOrderByFactorAsc(UUID productId);

        List<ProductUnit> findByProductIdIn(Collection<UUID> productIds);

        Optional<ProductUnit> findByProductIdAndUnit(UUID productId, String unit);

        void deleteByProductId(UUID productId);
    }

    interface ProductImageRepository extends JpaRepository<ProductImage, UUID> {
        List<ProductImage> findByProductIdOrderBySortOrderAsc(UUID productId);

        List<ProductImage> findByProductIdInAndPrimaryImageTrue(Collection<UUID> productIds);

        Optional<ProductImage> findByFileId(UUID fileId);
    }
}
