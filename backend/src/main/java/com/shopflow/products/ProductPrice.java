package com.shopflow.products;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

/** A customer-specific selling price that overrides the product's default selling price. */
@Entity
@Table(name = "product_prices")
@Getter
@Setter
public class ProductPrice extends BaseEntity {

    @Column(nullable = false)
    private UUID productId;
    @Column(nullable = false)
    private UUID customerId;
    @Column(nullable = false)
    private BigDecimal price;
    @Column(nullable = false)
    private boolean active = true;
    private UUID createdBy;
}
