package com.shopflow.orders;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "deliveries")
@Getter
@Setter
public class Delivery extends BaseEntity {

    @Column(nullable = false)
    private UUID orderId;
    private int attemptNumber = 1;
    private String deliveryPerson;
    private String deliveryPersonMobile;
    private String vehicleNumber;
    private String notes;
    private Instant dispatchedAt;
    private Instant deliveredAt;
    private Instant failedAt;
    private String failureReason;
    private String proofOfDelivery;
    private String receivedBy;
    private boolean customerConfirmed;
}
