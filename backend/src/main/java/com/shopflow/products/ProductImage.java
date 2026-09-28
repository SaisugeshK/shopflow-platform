package com.shopflow.products;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "product_images")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProductImage {

    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID productId;
    @Column(nullable = false)
    private UUID fileId;
    private int sortOrder;
    @Column(name = "is_primary", nullable = false)
    private boolean primaryImage;
    @Column(nullable = false)
    private Instant createdAt;

    ProductImage(UUID productId, UUID fileId, int sortOrder, boolean primaryImage) {
        this.id = UUID.randomUUID();
        this.productId = productId;
        this.fileId = fileId;
        this.sortOrder = sortOrder;
        this.primaryImage = primaryImage;
        this.createdAt = Instant.now();
    }
}
