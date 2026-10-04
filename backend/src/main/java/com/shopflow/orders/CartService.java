package com.shopflow.orders;

import com.shopflow.billing.TaxCalculator;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.Money;
import com.shopflow.customers.CustomerAddress;
import com.shopflow.customers.CustomerService;
import com.shopflow.inventory.InventoryRepositories.StockBalanceRepository;
import com.shopflow.inventory.StockBalance;
import com.shopflow.orders.OrderDtos.CartLine;
import com.shopflow.orders.OrderDtos.CartResponse;
import com.shopflow.orders.OrderRepositories.CartRepository;
import com.shopflow.products.PricingService;
import com.shopflow.products.Product;
import com.shopflow.products.ProductOptionsService;
import com.shopflow.products.ProductService;
import com.shopflow.products.SchemeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Server-side cart. Only product ids and quantities are stored; every read re-prices with the same calculator used
 * at checkout, so the preview matches the order (§37).
 */
@Service
public class CartService {

    private final CartRepository carts;
    private final ProductService products;
    private final PricingService pricing;
    private final StockBalanceRepository balances;
    private final TaxCalculator calculator;
    private final CustomerService customers;
    private final BusinessSettingsService settings;
    private final ProductOptionsService options;
    private final SchemeService schemes;

    public CartService(CartRepository carts, ProductService products, PricingService pricing, StockBalanceRepository balances,
                       TaxCalculator calculator, CustomerService customers, BusinessSettingsService settings,
                       ProductOptionsService options, SchemeService schemes) {
        this.options = options;
        this.schemes = schemes;
        this.carts = carts;
        this.products = products;
        this.pricing = pricing;
        this.balances = balances;
        this.calculator = calculator;
        this.customers = customers;
        this.settings = settings;
    }

    @Transactional
    public Cart cart(UUID customerId) {
        return carts.findByCustomerId(customerId).orElseGet(() -> {
            Cart c = new Cart();
            c.setCustomerId(customerId);
            return carts.saveAndFlush(c);
        });
    }

    @Transactional
    public CartResponse view(UUID customerId) {
        return toResponse(cart(customerId), customerId);
    }

    @Transactional
    public CartResponse addItem(UUID customerId, UUID productId, BigDecimal quantity, String unit) {
        Product product = products.get(productId);
        if (!product.isActive()) {
            throw new BusinessException(ErrorCode.PRODUCT_INACTIVE, product.getName() + " is not available");
        }
        options.requireSellable(product);
        ProductOptionsService.ResolvedUnit resolved = options.resolve(product, unit);
        String unitKey = resolved.base() ? null : resolved.unit();
        Cart cart = cart(customerId);
        if (cart.getItems().size() >= 200) {
            throw BusinessException.validation("items", "The cart can hold at most 200 products");
        }
        CartItem item = cart.getItems().stream()
                .filter(i -> i.getProductId().equals(productId) && java.util.Objects.equals(i.getUnit(), unitKey)).findFirst().orElse(null);
        BigDecimal next = Money.qty(item == null ? quantity : item.getQuantity().add(quantity));
        options.validateQuantity(product, resolved.toBase(next));
        if (item == null) {
            item = new CartItem();
            item.setCart(cart);
            item.setProductId(productId);
            item.setUnit(unitKey);
            item.setUnitFactor(resolved.factor());
            item.setQuantity(next);
            cart.getItems().add(item);
        } else {
            item.setQuantity(next);
        }
        carts.saveAndFlush(cart);
        return toResponse(cart, customerId);
    }

    @Transactional
    public CartResponse updateItem(UUID customerId, UUID itemId, BigDecimal quantity) {
        Cart cart = cart(customerId);
        CartItem item = cart.getItems().stream().filter(i -> i.getId().equals(itemId)).findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Cart item"));
        options.validateQuantity(products.get(item.getProductId()), Money.qty(quantity.multiply(item.getUnitFactor())));
        item.setQuantity(Money.qty(quantity));
        carts.saveAndFlush(cart);
        return toResponse(cart, customerId);
    }

    @Transactional
    public CartResponse removeItem(UUID customerId, UUID itemId) {
        Cart cart = cart(customerId);
        cart.getItems().removeIf(i -> i.getId().equals(itemId));
        carts.saveAndFlush(cart);
        return toResponse(cart, customerId);
    }

    @Transactional
    public void clear(UUID customerId) {
        carts.findByCustomerId(customerId).ifPresent(c -> {
            c.getItems().clear();
            carts.saveAndFlush(c);
        });
    }

    private CartResponse toResponse(Cart cart, UUID customerId) {
        List<CartItem> items = cart.getItems();
        Map<UUID, Product> productMap = products.getAll(items.stream().map(CartItem::getProductId).toList()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        Map<UUID, StockBalance> stock = balances.findByProductIdIn(productMap.keySet()).stream()
                .collect(Collectors.toMap(StockBalance::getProductId, Function.identity()));
        Map<UUID, BigDecimal> custom = pricing.customerPrices(customerId, productMap.keySet());
        String buyerState = customers.defaultAddress(customerId).map(CustomerAddress::getStateCode).orElse(null);
        boolean interState = TaxCalculator.isInterState(settings.business().getStateCode(), buyerState);
        boolean showStock = settings.settings().isShowStockToCustomers();

        List<TaxCalculator.Line> lines = new ArrayList<>();
        List<CartItem> priced = new ArrayList<>();
        List<BigDecimal> prices = new ArrayList<>();
        List<SchemeService.Line> schemeLines = new ArrayList<>();
        for (CartItem i : items) {
            Product p = productMap.get(i.getProductId());
            BigDecimal price = Money.of(custom.getOrDefault(p.getId(), Money.of(p.getSellingPrice())).multiply(i.getUnitFactor()));
            prices.add(price);
            schemeLines.add(new SchemeService.Line(p.getId(), p.getCategoryId(), Money.qty(i.getQuantity().multiply(i.getUnitFactor())),
                    Money.of(price.multiply(i.getQuantity()))));
            priced.add(i);
        }
        // Same scheme rules as order placement, so the preview matches the order.
        List<SchemeService.Outcome> outcomes = schemes.evaluate(schemeLines);
        for (int idx = 0; idx < priced.size(); idx++) {
            CartItem i = priced.get(idx);
            Product p = productMap.get(i.getProductId());
            SchemeService.Outcome o = outcomes.get(idx);
            lines.add(new TaxCalculator.Line(i.getQuantity(), prices.get(idx), o.hasDiscount() ? o.discountPercent() : null, null,
                    p.getGstRate(), p.getHsnCode()));
        }
        TaxCalculator.Result calc = calculator.calculate(lines, interState, settings.taxSettings().isRoundOffEnabled());
        List<CartLine> result = new ArrayList<>();
        boolean ready = !priced.isEmpty();
        for (int idx = 0; idx < priced.size(); idx++) {
            CartItem i = priced.get(idx);
            Product p = productMap.get(i.getProductId());
            TaxCalculator.LineResult lr = calc.lines().get(idx);
            StockBalance b = stock.get(p.getId());
            BigDecimal available = b == null ? BigDecimal.ZERO : b.available();
            String issue = null;
            if (!p.isActive()) {
                issue = "No longer available";
            } else if (available.compareTo(Money.qty(i.getQuantity().multiply(i.getUnitFactor()))) < 0) {
                issue = showStock ? "Only " + available.stripTrailingZeros().toPlainString() + " available" : "Insufficient stock";
            }
            if (issue != null) {
                ready = false;
            }
            String stockStatus = available.signum() <= 0 ? "OUT_OF_STOCK" : available.compareTo(p.getMinimumStock()) <= 0 ? "LOW_STOCK" : "IN_STOCK";
            SchemeService.Outcome o = outcomes.get(idx);
            String schemeName = o.hasFreeGoods() ? o.freeSchemeName() : o.hasDiscount() ? o.discountSchemeName() : null;
            result.add(new CartLine(i.getId(), p.getId(), p.getSku(), p.getName(), i.getUnit() != null ? i.getUnit() : p.getUnit().name(),
                    products.toCatalog(List.of(p), customerId).getFirst().imageUrl(), i.getQuantity(),
                    lines.get(idx).rate(), p.getMrp(), lr.discountAmount(), p.getGstRate(), lr.taxable(), lr.tax(),
                    lr.total(), stockStatus, issue, i.getUnitFactor(), schemeName, o.hasFreeGoods() ? o.freeQuantity() : null));
        }
        return new CartResponse(cart.getId(), result, result.size(), calc.subtotal(), calc.discount(), calc.taxable(),
                calc.cgst(), calc.sgst(), calc.igst(), calc.roundOff(), calc.grandTotal(), interState, ready);
    }
}
