package com.shopflow.products;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "categories")
@Getter
@Setter
public class Category extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    private UUID parentId;
    @Column(nullable = false)
    private String name;
    private String description;
    private int sortOrder;
    @Column(nullable = false)
    private boolean active = true;
}
