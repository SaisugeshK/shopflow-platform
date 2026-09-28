package com.shopflow.products;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "products")
@Getter
@Setter
public class Product extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String sku;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private UUID categoryId;
    private UUID brandId;
    private String description;
    private String hsnCode;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Unit unit;
    /** Internal cost. Never exposed to customers (§36, §92.6). */
    @Column(nullable = false)
    private BigDecimal purchasePrice;
    @Column(nullable = false)
    private BigDecimal sellingPrice;
    private BigDecimal mrp;
    @Column(nullable = false)
    private BigDecimal gstRate;
    @Column(nullable = false)
    private BigDecimal minimumStock = BigDecimal.ZERO;
    @Column(nullable = false)
    private boolean active = true;
    @Column(nullable = false)
    private boolean featured;
    private UUID createdBy;
    private UUID updatedBy;

    public enum Unit { PCS, BOX, PACK, KG, G, L, ML, M, DOZEN, SET, CARTON, BAG }
}
