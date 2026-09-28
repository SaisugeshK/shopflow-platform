package com.shopflow.suppliers;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "supplier_addresses")
@Getter
@Setter
public class SupplierAddress extends BaseEntity {

    @Column(nullable = false)
    private UUID supplierId;
    @Column(nullable = false)
    private String addressLine1;
    private String addressLine2;
    @Column(nullable = false)
    private String city;
    @Column(nullable = false)
    private String state;
    @Column(nullable = false)
    private String stateCode;
    @Column(nullable = false)
    private String pincode;
    @Column(name = "is_default", nullable = false)
    private boolean defaultAddress = true;
}
