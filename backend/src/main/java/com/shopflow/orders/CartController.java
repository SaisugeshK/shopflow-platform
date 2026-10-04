package com.shopflow.orders;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.customers.CustomerService;
import com.shopflow.orders.OrderDtos.CartItemRequest;
import com.shopflow.orders.OrderDtos.CartResponse;
import com.shopflow.orders.OrderDtos.UpdateCartItemRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/cart")
@Tag(name = "Cart", description = "The signed-in customer's cart; totals are recalculated by the backend")
@SecurityRequirement(name = "bearerAuth")
@PreAuthorize("hasAuthority('CUSTOMER_SELF')")
public class CartController {

    private final CartService cart;
    private final CustomerService customers;

    public CartController(CartService cart, CustomerService customers) {
        this.cart = cart;
        this.customers = customers;
    }

    @GetMapping
    @Operation(summary = "Get my cart", description = "Lines are re-priced for the customer; checkoutReady=false when a line is unavailable or short of stock.")
    public ApiResponse<CartResponse> get() {
        return ApiResponse.ok(cart.view(customerId()));
    }

    @PostMapping("/items")
    @Operation(summary = "Add a product", description = "Adds to the quantity when the product is already in the cart. Errors: PRODUCT_INACTIVE.")
    public ApiResponse<CartResponse> add(@Valid @RequestBody CartItemRequest request) {
        return ApiResponse.ok(cart.addItem(customerId(), request.productId(), request.quantity(), request.unit()));
    }

    @PatchMapping("/items/{id}")
    @Operation(summary = "Change a line quantity")
    public ApiResponse<CartResponse> update(@PathVariable UUID id, @Valid @RequestBody UpdateCartItemRequest request) {
        return ApiResponse.ok(cart.updateItem(customerId(), id, request.quantity()));
    }

    @DeleteMapping("/items/{id}")
    @Operation(summary = "Remove a line")
    public ApiResponse<CartResponse> remove(@PathVariable UUID id) {
        return ApiResponse.ok(cart.removeItem(customerId(), id));
    }

    @DeleteMapping
    @Operation(summary = "Empty the cart")
    public ApiResponse<Void> clear() {
        cart.clear(customerId());
        return ApiResponse.ok(null);
    }

    private UUID customerId() {
        return customers.currentApprovedCustomer().getId();
    }
}
