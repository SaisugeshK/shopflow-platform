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
import java.time.LocalDate;
import java.util.UUID;

/** A selling scheme (§0B.7), applied only by the backend pricing. */
@Entity
@Table(name = "schemes")
@Getter
@Setter
public class Scheme extends BaseEntity {

    @Column(nullable = false)
    private String name;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Type schemeType;
    private UUID productId;
    private UUID categoryId;
    private BigDecimal buyQuantity;
    private BigDecimal freeQuantity;
    private BigDecimal minQuantity;
    private BigDecimal minValue;
    private BigDecimal discountPercent;
    private LocalDate validFrom;
    private LocalDate validTo;
    @Column(nullable = false)
    private boolean active = true;
    private UUID createdBy;

    /**
     * BUY_X_GET_Y: every {@code buyQuantity} bought gives {@code freeQuantity} of the same product free.
     * QUANTITY_SLAB: {@code minQuantity} or more ⇒ {@code discountPercent}. VALUE_SLAB: line value ≥ {@code minValue}
     * ⇒ {@code discountPercent}.
     */
    public enum Type { BUY_X_GET_Y, QUANTITY_SLAB, VALUE_SLAB }

    public boolean validOn(LocalDate date) {
        return active && (validFrom == null || !date.isBefore(validFrom)) && (validTo == null || !date.isAfter(validTo));
    }

    public boolean appliesTo(UUID product, UUID category) {
        return (productId != null && productId.equals(product)) || (productId == null && categoryId != null && categoryId.equals(category));
    }
}
