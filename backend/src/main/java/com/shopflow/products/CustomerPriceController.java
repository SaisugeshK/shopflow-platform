package com.shopflow.products;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.customers.CustomerService;
import com.shopflow.products.ProductDtos.CustomerPriceRequest;
import com.shopflow.products.ProductDtos.CustomerPriceResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customers/{customerId}/prices")
@Tag(name = "Customer Pricing", description = "Customer-specific product prices")
@SecurityRequirement(name = "bearerAuth")
public class CustomerPriceController {

    private final PricingService pricing;
    private final CustomerService customers;

    public CustomerPriceController(PricingService pricing, CustomerService customers) {
        this.pricing = pricing;
        this.customers = customers;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    @Operation(summary = "List a customer's special prices")
    public ApiResponse<List<CustomerPriceResponse>> list(@PathVariable UUID customerId) {
        customers.get(customerId);
        return ApiResponse.ok(pricing.listForCustomer(customerId));
    }

    @PutMapping("/{productId}")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE') and hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Set a customer's price for a product", description = "Applies to new orders and invoices only.")
    public ApiResponse<CustomerPriceResponse> set(@PathVariable UUID customerId, @PathVariable UUID productId,
                                                  @Valid @RequestBody CustomerPriceRequest request) {
        customers.get(customerId);
        return ApiResponse.ok(pricing.setPrice(customerId, productId, request.price()));
    }

    @DeleteMapping("/{productId}")
    @PreAuthorize("hasAuthority('CUSTOMER_WRITE') and hasAuthority('PRODUCT_WRITE')")
    @Operation(summary = "Remove a customer's special price", description = "The product's default selling price applies again.")
    public ApiResponse<Void> remove(@PathVariable UUID customerId, @PathVariable UUID productId) {
        pricing.removePrice(customerId, productId);
        return ApiResponse.ok(null);
    }
}
