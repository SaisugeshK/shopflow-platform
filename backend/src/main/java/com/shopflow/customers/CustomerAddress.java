package com.shopflow.customers;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "customer_addresses")
@Getter
@Setter
public class CustomerAddress extends BaseEntity {

    @Column(nullable = false)
    private UUID customerId;
    private String label;
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
    private boolean defaultAddress;
    @Column(nullable = false)
    private boolean active = true;

    public String formatted() {
        StringBuilder sb = new StringBuilder(addressLine1);
        if (addressLine2 != null && !addressLine2.isBlank()) {
            sb.append(", ").append(addressLine2);
        }
        sb.append(", ").append(city).append(", ").append(state).append(" - ").append(pincode);
        return sb.toString();
    }
}
