package com.shopflow.products;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "brands")
@Getter
@Setter
public class Brand extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private boolean active = true;
}
