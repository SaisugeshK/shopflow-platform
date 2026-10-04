package com.shopflow.products;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** An alternate unit of a product with an exact factor to its base (stock) unit: 1 CASE = 12 PCS (§0B.7). */
@Entity
@Table(name = "product_units")
@Getter
@Setter
@NoArgsConstructor
public class ProductUnit {

    @Id
    private UUID id = UUID.randomUUID();
    @Column(nullable = false)
    private UUID productId;
    @Column(nullable = false)
    private String unit;
    @Column(nullable = false)
    private BigDecimal factor;
    private String barcode;
    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public ProductUnit(UUID productId, String unit, BigDecimal factor, String barcode) {
        this.productId = productId;
        this.unit = unit;
        this.factor = factor;
        this.barcode = barcode;
    }
}
