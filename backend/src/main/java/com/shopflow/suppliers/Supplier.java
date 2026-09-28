package com.shopflow.suppliers;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "suppliers")
@Getter
@Setter
public class Supplier extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String supplierCode;
    @Column(nullable = false)
    private String name;
    private String contactPerson;
    private String mobileNumber;
    private String email;
    private String gstin;
    private String pan;
    private String paymentTerms;
    private int creditDays;
    @Column(nullable = false)
    private boolean active = true;
    private UUID createdBy;
    private UUID updatedBy;
}
