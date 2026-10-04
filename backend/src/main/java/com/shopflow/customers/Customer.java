package com.shopflow.customers;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "customers")
@Getter
@Setter
public class Customer extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    private UUID userId;
    /** Agent / broker who earns commission on this customer's invoices (§0B.9). */
    private UUID agentId;
    @Column(nullable = false)
    private String customerCode;
    @Column(nullable = false)
    private String shopName;
    @Column(nullable = false)
    private String contactName;
    @Column(nullable = false)
    private String mobileNumber;
    private String alternateMobile;
    private String email;
    private String gstin;
    private String pan;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CustomerStatus status;
    private String statusReason;
    private Instant statusChangedAt;
    private UUID statusChangedBy;
    private String notes;
    private UUID createdBy;
    private UUID updatedBy;

    public boolean isApproved() {
        return status == CustomerStatus.APPROVED;
    }

    public enum CustomerStatus { PENDING_APPROVAL, APPROVED, REJECTED, BLOCKED }
}
