package com.shopflow.business;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.StringJoiner;
import java.util.UUID;

@Entity
@Table(name = "businesses")
@Getter
@Setter
public class Business extends BaseEntity {

    @Column(nullable = false)
    private String name;
    private String legalName;
    private UUID logoFileId;
    private String addressLine1;
    private String addressLine2;
    private String city;
    private String state;
    private String stateCode;
    private String pincode;
    private String phone;
    private String mobile;
    private String email;
    private String gstin;
    private String pan;
    @Column(nullable = false)
    private String timezone;
    @Column(nullable = false)
    private String currency;
    @Column(nullable = false)
    private int financialYearStartMonth;
    private String termsAndConditions;
    private String authorizedSignatory;

    public String formattedAddress() {
        StringJoiner joiner = new StringJoiner(", ");
        for (String part : new String[]{addressLine1, addressLine2, city, state, pincode}) {
            if (part != null && !part.isBlank()) {
                joiner.add(part);
            }
        }
        return joiner.toString();
    }
}
