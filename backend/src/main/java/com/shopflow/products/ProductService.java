package com.shopflow.products;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Hashing;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.files.FileService;
import com.shopflow.files.StoredFile;
import com.shopflow.inventory.InventoryRepositories.StockBalanceRepository;
import com.shopflow.inventory.InventoryService;
import com.shopflow.inventory.StockBalance;
import com.shopflow.inventory.StockMovement.MovementType;
import com.shopflow.products.ProductDtos.CatalogProduct;
import com.shopflow.products.ProductDtos.CreateProductRequest;
import com.shopflow.products.ProductDtos.ImageResponse;
import com.shopflow.products.ProductDtos.ProductResponse;
import com.shopflow.products.ProductDtos.UpdateProductRequest;
import com.shopflow.products.ProductRepositories.BrandRepository;
import com.shopflow.products.ProductRepositories.CategoryRepository;
import com.shopflow.products.ProductRepositories.ProductImageRepository;
import com.shopflow.products.ProductRepositories.ProductRepository;
import com.shopflow.security.CurrentUser;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ProductService {

    public static final String PUBLIC_FILE_URL = "/api/v1/files/public/";

    private final ProductRepository products;
    private final CategoryRepository categories;
    private final BrandRepository brands;
    private final ProductImageRepository images;
    private final StockBalanceRepository stockBalances;
    private final InventoryService inventory;
    private final PricingService pricing;
    private final FileService files;
    private final BusinessContext businessContext;
    private final BusinessSettingsService settings;
    private final AuditService audit;

    public ProductService(ProductRepository products, CategoryRepository categories, BrandRepository brands,
                          ProductImageRepository images, StockBalanceRepository stockBalances, InventoryService inventory,
                          PricingService pricing, FileService files, BusinessContext businessContext,
                          BusinessSettingsService settings, AuditService audit) {
        this.products = products;
        this.categories = categories;
        this.brands = brands;
        this.images = images;
        this.stockBalances = stockBalances;
        this.inventory = inventory;
        this.pricing = pricing;
        this.files = files;
        this.businessContext = businessContext;
        this.settings = settings;
        this.audit = audit;
    }

    public Product get(UUID id) {
        return products.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.PRODUCT_NOT_FOUND, "Product"));
    }

    public List<Product> getAll(Collection<UUID> ids) {
        return products.findByIdIn(ids);
    }

    @Transactional
    public Product create(CreateProductRequest r) {
        Category category = activeCategory(r.categoryId());
        validateGstRate(r.gstRate());
        String sku = r.sku() == null || r.sku().isBlank() ? generateSku(category) : r.sku().trim().toUpperCase();
        if (products.existsByBusinessIdAndSkuIgnoreCase(businessContext.businessId(), sku)) {
            throw BusinessException.validation("sku", "SKU already exists");
        }
        Product p = new Product();
        p.setBusinessId(businessContext.businessId());
        p.setSku(sku);
        p.setName(r.name().trim());
        p.setCategoryId(category.getId());
        p.setBrandId(resolveBrand(r.brand()));
        p.setDescription(Validation.trim(r.description()));
        p.setHsnCode(Validation.trim(r.hsnCode()));
        p.setUnit(r.unit());
        p.setPurchasePrice(Money.of(r.purchasePrice()));
        p.setSellingPrice(Money.of(r.sellingPrice()));
        p.setMrp(r.mrp() == null ? null : Money.of(r.mrp()));
        p.setGstRate(r.gstRate());
        p.setMinimumStock(Money.qty(r.minimumStock()));
        p.setActive(r.active() == null || r.active());
        p.setFeatured(Boolean.TRUE.equals(r.featured()));
        p.setCreatedBy(CurrentUser.id());
        validatePrices(p);
        products.saveAndFlush(p);
        inventory.createBalance(p.getId());
        if (Money.isPositive(r.openingStock())) {
            inventory.post(p.getId(), MovementType.OPENING, r.openingStock(), p.getPurchasePrice(), "OPENING_STOCK",
                    p.getId(), "OPENING", "Opening stock", null);
        }
        audit.record(AuditAction.PRODUCT_CREATED, "PRODUCT", p.getId(), null, snapshot(p));
        return p;
    }

    @Transactional
    public Product update(UUID id, UpdateProductRequest r) {
        Product p = get(id);
        Map<String, Object> before = snapshot(p);
        if (r.name() != null && !r.name().isBlank()) {
            p.setName(r.name().trim());
        }
        if (r.categoryId() != null) {
            p.setCategoryId(activeCategory(r.categoryId()).getId());
        }
        if (r.brand() != null) {
            p.setBrandId(resolveBrand(r.brand()));
        }
        if (r.description() != null) {
            p.setDescription(Validation.trim(r.description()));
        }
        if (r.hsnCode() != null) {
            p.setHsnCode(Validation.trim(r.hsnCode()));
        }
        if (r.unit() != null) {
            p.setUnit(r.unit());
        }
        if (r.purchasePrice() != null) {
            p.setPurchasePrice(Money.of(r.purchasePrice()));
        }
        if (r.sellingPrice() != null) {
            p.setSellingPrice(Money.of(r.sellingPrice()));
        }
        if (r.mrp() != null) {
            p.setMrp(Money.of(r.mrp()));
        }
        if (r.gstRate() != null) {
            validateGstRate(r.gstRate());
            p.setGstRate(r.gstRate());
        }
        if (r.minimumStock() != null) {
            p.setMinimumStock(Money.qty(r.minimumStock()));
        }
        if (r.featured() != null) {
            p.setFeatured(r.featured());
        }
        validatePrices(p);
        p.setUpdatedBy(CurrentUser.id());
        products.saveAndFlush(p);
        audit.record(AuditAction.PRODUCT_UPDATED, "PRODUCT", id, before, snapshot(p));
        return p;
    }

    @Transactional
    public Product setActive(UUID id, boolean active) {
        Product p = get(id);
        p.setActive(active);
        p.setUpdatedBy(CurrentUser.id());
        audit.record(active ? AuditAction.PRODUCT_ACTIVATED : AuditAction.PRODUCT_DEACTIVATED, "PRODUCT", id, null, Map.of("active", active));
        return p;
    }

    @Transactional
    public ImageResponse addImage(UUID productId, MultipartFile file) {
        get(productId);
        StoredFile stored = files.storeImage(file, "PRODUCT_IMAGE");
        List<ProductImage> existing = images.findByProductIdOrderBySortOrderAsc(productId);
        if (existing.size() >= 8) {
            throw new BusinessException(ErrorCode.FILE_INVALID, "A product can have at most 8 images");
        }
        ProductImage image = images.save(new ProductImage(productId, stored.getId(), existing.size(), existing.isEmpty()));
        return new ImageResponse(image.getId(), image.getFileId(), PUBLIC_FILE_URL + image.getFileId(), image.isPrimaryImage());
    }

    @Transactional
    public void setPrimaryImage(UUID productId, UUID imageId) {
        List<ProductImage> list = images.findByProductIdOrderBySortOrderAsc(productId);
        if (list.stream().noneMatch(i -> i.getId().equals(imageId))) {
            throw BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Image");
        }
        list.forEach(i -> i.setPrimaryImage(i.getId().equals(imageId)));
    }

    @Transactional
    public void removeImage(UUID productId, UUID imageId) {
        ProductImage image = images.findById(imageId).filter(i -> i.getProductId().equals(productId))
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Image"));
        images.delete(image);
        if (image.isPrimaryImage()) {
            images.findByProductIdOrderBySortOrderAsc(productId).stream().findFirst().ifPresent(i -> i.setPrimaryImage(true));
        }
    }

    // ---------------------------------------------------------------- queries

    public Page<Product> search(String q, UUID categoryId, Boolean active, Boolean featured, Pageable pageable) {
        Specification<Product> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                predicates.add(cb.or(cb.like(cb.lower(root.get("name")), like), cb.like(cb.lower(root.get("sku")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("hsnCode"), "")), like)));
            }
            if (categoryId != null) {
                predicates.add(cb.equal(root.get("categoryId"), categoryId));
            }
            if (active != null) {
                predicates.add(cb.equal(root.get("active"), active));
            }
            if (featured != null) {
                predicates.add(cb.equal(root.get("featured"), featured));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        return products.findAll(spec, pageable);
    }

    public List<ProductResponse> toResponses(List<Product> list) {
        Context ctx = context(list);
        return list.stream().map(p -> toResponse(p, ctx, images.findByProductIdOrderBySortOrderAsc(p.getId()))).toList();
    }

    public ProductResponse toResponse(Product p) {
        return toResponse(p, context(List.of(p)), images.findByProductIdOrderBySortOrderAsc(p.getId()));
    }

    public List<CatalogProduct> toCatalog(List<Product> list, UUID customerId) {
        Context ctx = context(list);
        Map<UUID, BigDecimal> custom = pricing.customerPrices(customerId, list.stream().map(Product::getId).toList());
        boolean showStock = settings.settings().isShowStockToCustomers();
        return list.stream().map(p -> {
            StockBalance b = ctx.balances().get(p.getId());
            BigDecimal available = b == null ? BigDecimal.ZERO : b.available();
            BigDecimal price = custom.getOrDefault(p.getId(), Money.of(p.getSellingPrice()));
            List<String> urls = images.findByProductIdOrderBySortOrderAsc(p.getId()).stream()
                    .map(i -> PUBLIC_FILE_URL + i.getFileId()).toList();
            return new CatalogProduct(p.getId(), p.getSku(), p.getName(), p.getCategoryId(),
                    ctx.categoryName(p.getCategoryId()), ctx.brandName(p.getBrandId()), p.getDescription(), p.getHsnCode(),
                    p.getUnit().name(), price, p.getMrp(), p.getGstRate(), custom.containsKey(p.getId()),
                    stockStatus(available, p.getMinimumStock()), showStock ? available : null, p.isFeatured(),
                    ctx.primaryImage(p.getId()), urls);
        }).toList();
    }

    private ProductResponse toResponse(Product p, Context ctx, List<ProductImage> productImages) {
        StockBalance b = ctx.balances().get(p.getId());
        BigDecimal onHand = b == null ? BigDecimal.ZERO : b.getOnHand();
        BigDecimal reserved = b == null ? BigDecimal.ZERO : b.getReserved();
        BigDecimal available = onHand.subtract(reserved);
        return new ProductResponse(p.getId(), p.getSku(), p.getName(), p.getCategoryId(), ctx.categoryName(p.getCategoryId()),
                p.getBrandId(), ctx.brandName(p.getBrandId()), p.getDescription(), p.getHsnCode(), p.getUnit().name(),
                p.getPurchasePrice(), p.getSellingPrice(), p.getMrp(), p.getGstRate(), p.getMinimumStock(), onHand,
                reserved, available, stockStatus(available, p.getMinimumStock()), p.isActive(), p.isFeatured(),
                ctx.primaryImage(p.getId()),
                productImages.stream().map(i -> new ImageResponse(i.getId(), i.getFileId(), PUBLIC_FILE_URL + i.getFileId(), i.isPrimaryImage())).toList(),
                p.getCreatedAt(), p.getUpdatedAt());
    }

    static String stockStatus(BigDecimal available, BigDecimal minimum) {
        if (available.signum() <= 0) {
            return "OUT_OF_STOCK";
        }
        return available.compareTo(minimum) <= 0 ? "LOW_STOCK" : "IN_STOCK";
    }

    private Context context(List<Product> list) {
        List<UUID> ids = list.stream().map(Product::getId).toList();
        Map<UUID, StockBalance> balances = stockBalances.findByProductIdIn(ids).stream()
                .collect(Collectors.toMap(StockBalance::getProductId, Function.identity()));
        Map<UUID, String> categoryNames = new HashMap<>();
        categories.findAllById(list.stream().map(Product::getCategoryId).distinct().toList())
                .forEach(c -> categoryNames.put(c.getId(), c.getName()));
        Map<UUID, String> brandNames = new HashMap<>();
        brands.findAllById(list.stream().map(Product::getBrandId).filter(java.util.Objects::nonNull).distinct().toList())
                .forEach(b -> brandNames.put(b.getId(), b.getName()));
        Map<UUID, String> primaryImages = new HashMap<>();
        images.findByProductIdInAndPrimaryImageTrue(ids).forEach(i -> primaryImages.put(i.getProductId(), PUBLIC_FILE_URL + i.getFileId()));
        return new Context(balances, categoryNames, brandNames, primaryImages);
    }

    private record Context(Map<UUID, StockBalance> balances, Map<UUID, String> categories, Map<UUID, String> brands,
                           Map<UUID, String> images) {
        String categoryName(UUID id) {
            return categories.get(id);
        }

        String brandName(UUID id) {
            return id == null ? null : brands.get(id);
        }

        String primaryImage(UUID productId) {
            return images.get(productId);
        }
    }

    // ---------------------------------------------------------------- helpers

    private Category activeCategory(UUID id) {
        Category c = categories.findById(id).orElseThrow(() -> BusinessException.validation("categoryId", "Category not found"));
        if (!c.isActive()) {
            throw BusinessException.validation("categoryId", "Category is inactive");
        }
        return c;
    }

    private UUID resolveBrand(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        return brands.findByName(businessContext.businessId(), name.trim()).map(Brand::getId).orElseGet(() -> {
            Brand b = new Brand();
            b.setBusinessId(businessContext.businessId());
            b.setName(name.trim());
            return brands.saveAndFlush(b).getId();
        });
    }

    private void validateGstRate(BigDecimal rate) {
        if (!settings.taxSettings().isAllowedRate(rate)) {
            throw BusinessException.validation("gstRate", "GST rate must be one of " + settings.taxSettings().getAllowedGstRates());
        }
    }

    private static void validatePrices(Product p) {
        if (p.getMrp() != null && p.getSellingPrice().compareTo(p.getMrp()) > 0) {
            throw BusinessException.validation("sellingPrice", "Selling price cannot exceed MRP");
        }
    }

    private String generateSku(Category category) {
        String prefix = category.getName().replaceAll("[^A-Za-z]", "").toUpperCase();
        prefix = prefix.isEmpty() ? "SKU" : prefix.substring(0, Math.min(3, prefix.length()));
        for (int i = 0; i < 10; i++) {
            String candidate = prefix + "-" + Hashing.randomToken(4).replaceAll("[^A-Za-z0-9]", "").toUpperCase();
            if (candidate.length() >= 6 && !products.existsByBusinessIdAndSkuIgnoreCase(businessContext.businessId(), candidate)) {
                return candidate;
            }
        }
        throw new BusinessException(ErrorCode.CONFLICT, "Could not generate a unique SKU; please enter one");
    }

    private static Map<String, Object> snapshot(Product p) {
        Map<String, Object> m = new HashMap<>();
        m.put("sku", p.getSku());
        m.put("name", p.getName());
        m.put("categoryId", p.getCategoryId());
        m.put("hsnCode", p.getHsnCode());
        m.put("unit", p.getUnit());
        m.put("purchasePrice", p.getPurchasePrice());
        m.put("sellingPrice", p.getSellingPrice());
        m.put("mrp", p.getMrp());
        m.put("gstRate", p.getGstRate());
        m.put("minimumStock", p.getMinimumStock());
        m.put("active", p.isActive());
        return m;
    }
}
