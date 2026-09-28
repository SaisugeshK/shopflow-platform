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
import com.shopflow.products.ProductService;
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

    public CartService(CartRepository carts, ProductService products, PricingService pricing, StockBalanceRepository balances,
                       TaxCalculator calculator, CustomerService customers, BusinessSettingsService settings) {
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
    public CartResponse addItem(UUID customerId, UUID productId, BigDecimal quantity) {
        Product product = products.get(productId);
        if (!product.isActive()) {
            throw new BusinessException(ErrorCode.PRODUCT_INACTIVE, product.getName() + " is not available");
        }
        Cart cart = cart(customerId);
        if (cart.getItems().size() >= 200) {
            throw BusinessException.validation("items", "The cart can hold at most 200 products");
        }
        CartItem item = cart.getItems().stream().filter(i -> i.getProductId().equals(productId)).findFirst().orElse(null);
        if (item == null) {
            item = new CartItem();
            item.setCart(cart);
            item.setProductId(productId);
            item.setQuantity(Money.qty(quantity));
            cart.getItems().add(item);
        } else {
            item.setQuantity(Money.qty(item.getQuantity().add(quantity)));
        }
        carts.saveAndFlush(cart);
        return toResponse(cart, customerId);
    }

    @Transactional
    public CartResponse updateItem(UUID customerId, UUID itemId, BigDecimal quantity) {
        Cart cart = cart(customerId);
        CartItem item = cart.getItems().stream().filter(i -> i.getId().equals(itemId)).findFirst()
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Cart item"));
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
        for (CartItem i : items) {
            Product p = productMap.get(i.getProductId());
            BigDecimal price = custom.getOrDefault(p.getId(), Money.of(p.getSellingPrice()));
            lines.add(new TaxCalculator.Line(i.getQuantity(), price, null, null, p.getGstRate(), p.getHsnCode()));
            priced.add(i);
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
            } else if (available.compareTo(i.getQuantity()) < 0) {
                issue = showStock ? "Only " + available.stripTrailingZeros().toPlainString() + " available" : "Insufficient stock";
            }
            if (issue != null) {
                ready = false;
            }
            String stockStatus = available.signum() <= 0 ? "OUT_OF_STOCK" : available.compareTo(p.getMinimumStock()) <= 0 ? "LOW_STOCK" : "IN_STOCK";
            result.add(new CartLine(i.getId(), p.getId(), p.getSku(), p.getName(), p.getUnit().name(),
                    products.toCatalog(List.of(p), customerId).getFirst().imageUrl(), i.getQuantity(),
                    lines.get(idx).rate(), p.getMrp(), lr.discountAmount(), p.getGstRate(), lr.taxable(), lr.tax(),
                    lr.total(), stockStatus, issue));
        }
        return new CartResponse(cart.getId(), result, result.size(), calc.subtotal(), calc.discount(), calc.taxable(),
                calc.cgst(), calc.sgst(), calc.igst(), calc.roundOff(), calc.grandTotal(), interState, ready);
    }
}
