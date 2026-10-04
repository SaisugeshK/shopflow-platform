package com.shopflow.products;

import com.shopflow.common.error.BusinessException;
import com.shopflow.common.util.Money;
import com.shopflow.products.ProductDtos.UnitOption;
import com.shopflow.products.ProductRepositories.ProductUnitRepository;
import com.shopflow.tenancy.ModuleCode;
import com.shopflow.tenancy.TenantModules;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Industry options of a product (§0B.7): alternate units with exact factors, whole/decimal quantities, and which
 * options a tenant may use (module switches, §0B.6).
 */
@Service
public class ProductOptionsService {

    private final ProductUnitRepository units;
    private final TenantModules modules;

    public ProductOptionsService(ProductUnitRepository units, TenantModules modules) {
        this.units = units;
        this.modules = modules;
    }

    /** The unit a document line uses and its factor to the product's base (stock) unit. */
    public record ResolvedUnit(String unit, BigDecimal factor) {
        public BigDecimal toBase(BigDecimal quantity) {
            return Money.qty(quantity.multiply(factor));
        }

        public boolean base() {
            return factor.compareTo(BigDecimal.ONE) == 0;
        }
    }

    /** {@code unit} null/blank or the base unit ⇒ factor 1; otherwise one of the product's alternate units. */
    public ResolvedUnit resolve(Product product, String unit) {
        if (unit == null || unit.isBlank() || unit.equalsIgnoreCase(product.getUnit().name())) {
            return new ResolvedUnit(product.getUnit().name(), BigDecimal.ONE);
        }
        String code = unit.trim().toUpperCase(Locale.ROOT);
        return units.findByProductIdAndUnit(product.getId(), code)
                .map(u -> new ResolvedUnit(u.getUnit(), u.getFactor()))
                .orElseThrow(() -> BusinessException.validation("unit", product.getName() + " cannot be sold or bought in " + code));
    }

    /** Whole numbers only unless the product allows decimal quantities. */
    public void validateQuantity(Product product, BigDecimal quantity) {
        if (quantity == null) {
            return;
        }
        if (!product.isDecimalQuantity() && quantity.stripTrailingZeros().scale() > 0) {
            throw BusinessException.validation("quantity", product.getName() + " is sold in whole " + product.getUnit().name()
                    + "; enter a whole number");
        }
        if (product.isTrackSerials() && quantity.stripTrailingZeros().scale() > 0) {
            throw BusinessException.validation("quantity", product.getName() + " has serial numbers; enter a whole number");
        }
    }

    /** A product that cannot be sold or stocked itself (variant group template). */
    public void requireSellable(Product product) {
        if (product.isVariantGroup()) {
            throw BusinessException.validation("productId", product.getName() + " is a variant group; choose one of its variants");
        }
    }

    public List<UnitOption> unitsOf(UUID productId) {
        return units.findByProductIdOrderByFactorAsc(productId).stream()
                .map(u -> new UnitOption(u.getUnit(), u.getFactor(), u.getBarcode())).toList();
    }

    public Map<UUID, List<UnitOption>> unitsOf(Collection<UUID> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        return units.findByProductIdIn(productIds).stream()
                .sorted((a, b) -> a.getFactor().compareTo(b.getFactor()))
                .collect(Collectors.groupingBy(ProductUnit::getProductId,
                        Collectors.mapping(u -> new UnitOption(u.getUnit(), u.getFactor(), u.getBarcode()), Collectors.toList())));
    }

    /** Replaces the alternate units of a product (requires the UOM_CONVERSIONS module when any are given). */
    public void replaceUnits(Product product, List<UnitOption> requested) {
        if (requested == null) {
            return;
        }
        if (!requested.isEmpty()) {
            modules.require(ModuleCode.UOM_CONVERSIONS);
        }
        Set<String> seen = new HashSet<>();
        List<ProductUnit> next = new ArrayList<>();
        for (UnitOption o : requested) {
            String code = o.unit() == null ? "" : o.unit().trim().toUpperCase(Locale.ROOT);
            try {
                Product.Unit.valueOf(code);
            } catch (IllegalArgumentException e) {
                throw BusinessException.validation("units", "Unknown unit " + o.unit());
            }
            if (code.equals(product.getUnit().name())) {
                throw BusinessException.validation("units", code + " is already the base unit");
            }
            if (!seen.add(code)) {
                throw BusinessException.validation("units", code + " is listed twice");
            }
            if (o.factor() == null || o.factor().signum() <= 0) {
                throw BusinessException.validation("units", "Factor for " + code + " must be greater than zero");
            }
            BigDecimal factor = o.factor().setScale(4, RoundingMode.HALF_UP);
            next.add(new ProductUnit(product.getId(), code, factor, o.barcode() == null || o.barcode().isBlank() ? null : o.barcode().trim()));
        }
        units.deleteByProductId(product.getId());
        units.flush();
        units.saveAll(next);
    }

    /** Tracking and pricing options need their modules; batch and serial tracking are mutually exclusive. */
    public void checkOptions(Product p) {
        if (p.isTrackBatches()) {
            modules.require(ModuleCode.BATCH_EXPIRY);
        }
        if (p.isTrackSerials()) {
            modules.require(ModuleCode.SERIAL_NUMBERS);
        }
        if (p.isTrackBatches() && p.isTrackSerials()) {
            throw BusinessException.validation("trackSerials", "A product tracks either batches or serial numbers, not both");
        }
        if (p.isTrackSerials() && p.isDecimalQuantity()) {
            throw BusinessException.validation("decimalQuantity", "Serial-numbered products are counted in whole units");
        }
        if (p.getPricingMode() == Product.PricingMode.DAILY_RATE) {
            modules.require(ModuleCode.DAILY_RATES);
        }
        if (p.getPricingMode() == Product.PricingMode.MRP) {
            if (p.getMrp() == null || p.getMrp().signum() <= 0) {
                throw BusinessException.validation("mrp", "Enter the MRP for MRP-based pricing");
            }
            BigDecimal discount = p.getMrpDiscountPercent() == null ? BigDecimal.ZERO : p.getMrpDiscountPercent();
            p.setSellingPrice(Money.of(p.getMrp().multiply(BigDecimal.valueOf(100).subtract(discount))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)));
        }
        if (p.getBarcode() != null && p.getBarcode().isBlank()) {
            p.setBarcode(null);
        }
    }

    public void checkModule(ModuleCode module) {
        modules.require(module);
    }

    public boolean moduleOn(ModuleCode module) {
        return modules.isEnabled(module);
    }
}
