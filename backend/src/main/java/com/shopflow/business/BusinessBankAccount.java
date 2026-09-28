package com.shopflow.business;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "business_bank_accounts")
@Getter
@Setter
public class BusinessBankAccount extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String bankName;
    private String accountName;
    @Column(nullable = false)
    private String accountNumber;
    @Column(nullable = false)
    private String ifsc;
    private String branch;
    @Column(name = "is_default", nullable = false)
    private boolean defaultAccount;
    @Column(nullable = false)
    private boolean active = true;
}
