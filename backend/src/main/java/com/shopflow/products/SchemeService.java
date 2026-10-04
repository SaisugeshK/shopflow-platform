package com.shopflow.products;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Money;
import com.shopflow.security.CurrentUser;
import com.shopflow.tenancy.ModuleCode;
import com.shopflow.tenancy.TenantModules;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Schemes (§0B.7): buy-X-get-Y free goods and quantity/value slab discounts, evaluated only on the server. Used when
 * orders are placed, carts are priced and staff create invoices, and only when the SCHEMES module is on.
 */
@Service
public class SchemeService {

    public interface SchemeRepository extends JpaRepository<Scheme, UUID> {
        List<Scheme> findByActiveTrueOrderByNameAsc();

        List<Scheme> findAllByOrderByActiveDescNameAsc();
    }

    public record SchemeRequest(@NotBlank @Size(max = 120) String name, @NotNull Scheme.Type schemeType, UUID productId,
                                UUID categoryId, @DecimalMin("0.001") BigDecimal buyQuantity,
                                @DecimalMin("0.001") BigDecimal freeQuantity, @DecimalMin("0.001") BigDecimal minQuantity,
                                @DecimalMin("0.01") BigDecimal minValue,
                                @DecimalMin("0.01") @DecimalMax("100") BigDecimal discountPercent,
                                LocalDate validFrom, LocalDate validTo) {
    }

    public record SchemeResponse(UUID id, String name, String schemeType, UUID productId, String productName,
                                 UUID categoryId, String categoryName, BigDecimal buyQuantity, BigDecimal freeQuantity,
                                 BigDecimal minQuantity, BigDecimal minValue, BigDecimal discountPercent,
                                 LocalDate validFrom, LocalDate validTo, boolean active, String summary, Instant createdAt) {
    }

    /** One priced line: base-unit quantity and value before discount. */
    public record Line(UUID productId, UUID categoryId, BigDecimal baseQuantity, BigDecimal value) {
    }

    /** Best slab discount and free quantity (in base units) for a line. */
    public record Outcome(BigDecimal discountPercent, UUID discountSchemeId, String discountSchemeName,
                          BigDecimal freeQuantity, UUID freeSchemeId, String freeSchemeName) {
        public static final Outcome NONE = new Outcome(null, null, null, BigDecimal.ZERO, null, null);

        public boolean hasDiscount() {
            return discountPercent != null && discountPercent.signum() > 0;
        }

        public boolean hasFreeGoods() {
            return freeQuantity != null && freeQuantity.signum() > 0;
        }
    }

    private final SchemeRepository schemes;
    private final ProductRepositories.ProductRepository products;
    private final ProductRepositories.CategoryRepository categories;
    private final TenantModules modules;
    private final BusinessContext businessContext;
    private final AuditService audit;

    public SchemeService(SchemeRepository schemes, ProductRepositories.ProductRepository products,
                         ProductRepositories.CategoryRepository categories, TenantModules modules,
                         BusinessContext businessContext, AuditService audit) {
        this.schemes = schemes;
        this.products = products;
        this.categories = categories;
        this.modules = modules;
        this.businessContext = businessContext;
        this.audit = audit;
    }

    /** Evaluates every line; returns {@link Outcome#NONE} for all lines when the module is off. */
    public List<Outcome> evaluate(List<Line> lines) {
        List<Outcome> result = new ArrayList<>();
        if (lines.isEmpty() || !modules.isEnabled(ModuleCode.SCHEMES)) {
            lines.forEach(l -> result.add(Outcome.NONE));
            return result;
        }
        LocalDate today = businessContext.today();
        List<Scheme> active = schemes.findByActiveTrueOrderByNameAsc().stream().filter(s -> s.validOn(today)).toList();
        for (Line line : lines) {
            Scheme bestDiscount = null;
            Scheme bestFree = null;
            BigDecimal bestFreeQty = BigDecimal.ZERO;
            for (Scheme s : active) {
                if (!s.appliesTo(line.productId(), line.categoryId())) {
                    continue;
                }
                switch (s.getSchemeType()) {
                    case QUANTITY_SLAB -> {
                        if (line.baseQuantity().compareTo(s.getMinQuantity()) >= 0 && better(s, bestDiscount)) {
                            bestDiscount = s;
                        }
                    }
                    case VALUE_SLAB -> {
                        if (line.value() != null && line.value().compareTo(s.getMinValue()) >= 0 && better(s, bestDiscount)) {
                            bestDiscount = s;
                        }
                    }
                    case BUY_X_GET_Y -> {
                        BigDecimal sets = line.baseQuantity().divide(s.getBuyQuantity(), 0, RoundingMode.FLOOR);
                        BigDecimal free = Money.qty(sets.multiply(s.getFreeQuantity()));
                        if (free.compareTo(bestFreeQty) > 0) {
                            bestFreeQty = free;
                            bestFree = s;
                        }
                    }
                }
            }
            result.add(new Outcome(bestDiscount == null ? null : bestDiscount.getDiscountPercent(),
                    bestDiscount == null ? null : bestDiscount.getId(), bestDiscount == null ? null : bestDiscount.getName(),
                    bestFreeQty, bestFree == null ? null : bestFree.getId(), bestFree == null ? null : bestFree.getName()));
        }
        return result;
    }

    private static boolean better(Scheme candidate, Scheme current) {
        return current == null || candidate.getDiscountPercent().compareTo(current.getDiscountPercent()) > 0;
    }

    // ---------------------------------------------------------------- management

    public List<SchemeResponse> list() {
        return schemes.findAllByOrderByActiveDescNameAsc().stream().map(this::toResponse).toList();
    }

    @Transactional
    public SchemeResponse create(SchemeRequest r) {
        modules.require(ModuleCode.SCHEMES);
        Scheme s = new Scheme();
        apply(s, r);
        s.setCreatedBy(CurrentUser.id());
        schemes.saveAndFlush(s);
        audit.record(AuditAction.SETTINGS_CHANGED, "SCHEME", s.getId(), null, Map.of("name", s.getName(), "type", s.getSchemeType()));
        return toResponse(s);
    }

    @Transactional
    public SchemeResponse update(UUID id, SchemeRequest r) {
        modules.require(ModuleCode.SCHEMES);
        Scheme s = get(id);
        apply(s, r);
        schemes.saveAndFlush(s);
        audit.record(AuditAction.SETTINGS_CHANGED, "SCHEME", s.getId(), null, Map.of("name", s.getName(), "updated", true));
        return toResponse(s);
    }

    @Transactional
    public SchemeResponse setActive(UUID id, boolean active) {
        Scheme s = get(id);
        s.setActive(active);
        audit.record(AuditAction.SETTINGS_CHANGED, "SCHEME", s.getId(), null, Map.of("name", s.getName(), "active", active));
        return toResponse(s);
    }

    private Scheme get(UUID id) {
        return schemes.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Scheme"));
    }

    private void apply(Scheme s, SchemeRequest r) {
        if (r.productId() == null && r.categoryId() == null) {
            throw BusinessException.validation("productId", "Choose a product or a category");
        }
        if (r.productId() != null) {
            products.findById(r.productId()).orElseThrow(() -> BusinessException.validation("productId", "Product not found"));
        }
        if (r.categoryId() != null) {
            categories.findById(r.categoryId()).orElseThrow(() -> BusinessException.validation("categoryId", "Category not found"));
        }
        switch (r.schemeType()) {
            case BUY_X_GET_Y -> {
                if (r.productId() == null || r.buyQuantity() == null || r.freeQuantity() == null) {
                    throw BusinessException.validation("buyQuantity", "Buy X get Y needs a product, the quantity to buy and the free quantity");
                }
            }
            case QUANTITY_SLAB -> {
                if (r.minQuantity() == null || r.discountPercent() == null) {
                    throw BusinessException.validation("minQuantity", "A quantity slab needs the minimum quantity and the discount %");
                }
            }
            case VALUE_SLAB -> {
                if (r.minValue() == null || r.discountPercent() == null) {
                    throw BusinessException.validation("minValue", "A value slab needs the minimum value and the discount %");
                }
            }
        }
        if (r.validFrom() != null && r.validTo() != null && r.validTo().isBefore(r.validFrom())) {
            throw BusinessException.validation("validTo", "The end date is before the start date");
        }
        s.setName(r.name().trim());
        s.setSchemeType(r.schemeType());
        s.setProductId(r.productId());
        s.setCategoryId(r.productId() == null ? r.categoryId() : null);
        s.setBuyQuantity(r.schemeType() == Scheme.Type.BUY_X_GET_Y ? Money.qty(r.buyQuantity()) : null);
        s.setFreeQuantity(r.schemeType() == Scheme.Type.BUY_X_GET_Y ? Money.qty(r.freeQuantity()) : null);
        s.setMinQuantity(r.schemeType() == Scheme.Type.QUANTITY_SLAB ? Money.qty(r.minQuantity()) : null);
        s.setMinValue(r.schemeType() == Scheme.Type.VALUE_SLAB ? Money.of(r.minValue()) : null);
        s.setDiscountPercent(r.schemeType() == Scheme.Type.BUY_X_GET_Y ? null : r.discountPercent());
        s.setValidFrom(r.validFrom());
        s.setValidTo(r.validTo());
    }

    private SchemeResponse toResponse(Scheme s) {
        String productName = s.getProductId() == null ? null : products.findById(s.getProductId()).map(Product::getName).orElse(null);
        String categoryName = s.getCategoryId() == null ? null : categories.findById(s.getCategoryId()).map(Category::getName).orElse(null);
        String scope = productName != null ? productName : "category " + categoryName;
        String summary = switch (s.getSchemeType()) {
            case BUY_X_GET_Y -> "Buy " + plain(s.getBuyQuantity()) + " get " + plain(s.getFreeQuantity()) + " free · " + scope;
            case QUANTITY_SLAB -> plain(s.getDiscountPercent()) + "% off on " + plain(s.getMinQuantity()) + "+ · " + scope;
            case VALUE_SLAB -> plain(s.getDiscountPercent()) + "% off on ₹" + plain(s.getMinValue()) + "+ · " + scope;
        };
        return new SchemeResponse(s.getId(), s.getName(), s.getSchemeType().name(), s.getProductId(), productName,
                s.getCategoryId(), categoryName, s.getBuyQuantity(), s.getFreeQuantity(), s.getMinQuantity(), s.getMinValue(),
                s.getDiscountPercent(), s.getValidFrom(), s.getValidTo(), s.isActive(), summary, s.getCreatedAt());
    }

    private static String plain(BigDecimal v) {
        return v == null ? "" : v.stripTrailingZeros().toPlainString();
    }
}
