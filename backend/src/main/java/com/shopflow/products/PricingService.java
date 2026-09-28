package com.shopflow.products;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Money;
import com.shopflow.products.ProductDtos.CustomerPriceResponse;
import com.shopflow.products.ProductRepositories.ProductPriceRepository;
import com.shopflow.products.ProductRepositories.ProductRepository;
import com.shopflow.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Resolves the unit selling price for a customer: a customer-specific price when one is active, otherwise the
 * product's default selling price. The frontend never supplies prices (§12).
 */
@Service
public class PricingService {

    private final ProductPriceRepository prices;
    private final ProductRepository products;
    private final AuditService audit;

    public PricingService(ProductPriceRepository prices, ProductRepository products, AuditService audit) {
        this.prices = prices;
        this.products = products;
        this.audit = audit;
    }

    public BigDecimal priceFor(Product product, UUID customerId) {
        if (customerId == null) {
            return Money.of(product.getSellingPrice());
        }
        return prices.findByProductIdAndCustomerIdAndActiveTrue(product.getId(), customerId)
                .map(p -> Money.of(p.getPrice()))
                .orElse(Money.of(product.getSellingPrice()));
    }

    /** Customer-specific prices for the given products, keyed by product id. */
    public Map<UUID, BigDecimal> customerPrices(UUID customerId, Collection<UUID> productIds) {
        if (customerId == null || productIds.isEmpty()) {
            return Map.of();
        }
        return prices.findByCustomerIdAndProductIdInAndActiveTrue(customerId, productIds).stream()
                .collect(Collectors.toMap(ProductPrice::getProductId, p -> Money.of(p.getPrice())));
    }

    public List<CustomerPriceResponse> listForCustomer(UUID customerId) {
        List<ProductPrice> list = prices.findByCustomerIdAndActiveTrue(customerId);
        Map<UUID, Product> byId = products.findByIdIn(list.stream().map(ProductPrice::getProductId).toList()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        return list.stream().map(p -> {
            Product product = byId.get(p.getProductId());
            return new CustomerPriceResponse(p.getProductId(), product.getSku(), product.getName(),
                    product.getSellingPrice(), p.getPrice(), p.getUpdatedAt());
        }).toList();
    }

    @Transactional
    public CustomerPriceResponse setPrice(UUID customerId, UUID productId, BigDecimal price) {
        Product product = products.findById(productId)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.PRODUCT_NOT_FOUND, "Product"));
        ProductPrice existing = prices.findByProductIdAndCustomerIdAndActiveTrue(productId, customerId).orElse(null);
        BigDecimal old = existing == null ? null : existing.getPrice();
        if (existing != null) {
            // Price rows are versioned: deactivate the old row and insert a new one so history is kept.
            existing.setActive(false);
            prices.saveAndFlush(existing);
        }
        ProductPrice p = new ProductPrice();
        p.setProductId(productId);
        p.setCustomerId(customerId);
        p.setPrice(Money.of(price));
        p.setCreatedBy(CurrentUser.id());
        prices.save(p);
        audit.record(AuditAction.CUSTOMER_PRICE_CHANGED, "CUSTOMER", customerId,
                Map.of("productId", productId, "price", String.valueOf(old)), Map.of("productId", productId, "price", p.getPrice()));
        return new CustomerPriceResponse(productId, product.getSku(), product.getName(), product.getSellingPrice(), p.getPrice(), p.getUpdatedAt());
    }

    @Transactional
    public void removePrice(UUID customerId, UUID productId) {
        prices.findByProductIdAndCustomerIdAndActiveTrue(productId, customerId).ifPresent(p -> {
            p.setActive(false);
            audit.record(AuditAction.CUSTOMER_PRICE_CHANGED, "CUSTOMER", customerId,
                    Map.of("productId", productId, "price", p.getPrice()), Map.of("productId", productId, "price", "DEFAULT"));
        });
    }
}
