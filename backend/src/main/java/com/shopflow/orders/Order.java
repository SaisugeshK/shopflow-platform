package com.shopflow.orders;

import com.shopflow.common.domain.BaseEntity;
import com.shopflow.payments.PaymentMethod;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity(name = "SalesOrder")
@Table(name = "orders")
@Getter
@Setter
public class Order extends BaseEntity {

    /** Project / site of a contractor customer (§0B.9). */
    private UUID projectId;

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String orderNumber;
    @Column(nullable = false)
    private UUID customerId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderPaymentStatus paymentStatus;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentMethod paymentMethod;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CreditApprovalStatus creditApprovalStatus = CreditApprovalStatus.NOT_REQUIRED;
    @Column(nullable = false)
    private String source;
    @Column(nullable = false)
    private String deliveryName;
    @Column(nullable = false)
    private String deliveryLine1;
    private String deliveryLine2;
    @Column(nullable = false)
    private String deliveryCity;
    @Column(nullable = false)
    private String deliveryState;
    @Column(nullable = false)
    private String deliveryStateCode;
    @Column(nullable = false)
    private String deliveryPincode;
    @Column(nullable = false)
    private String contactMobile;
    private String orderNote;
    private boolean interState;
    private BigDecimal subtotal;
    private BigDecimal discountTotal;
    private BigDecimal taxableTotal;
    private BigDecimal cgstTotal;
    private BigDecimal sgstTotal;
    private BigDecimal igstTotal;
    private BigDecimal roundOff;
    private BigDecimal grandTotal;
    private BigDecimal paidAmount = BigDecimal.ZERO;
    @Column(nullable = false)
    private Instant placedAt;
    private UUID placedBy;
    private String cancelReason;
    private String rejectReason;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNumber")
    private List<OrderItem> items = new ArrayList<>();

    public String deliveryAddress() {
        StringBuilder sb = new StringBuilder(deliveryLine1);
        if (deliveryLine2 != null && !deliveryLine2.isBlank()) {
            sb.append(", ").append(deliveryLine2);
        }
        return sb.append(", ").append(deliveryCity).append(", ").append(deliveryState).append(" - ").append(deliveryPincode).toString();
    }

    public enum CreditApprovalStatus { NOT_REQUIRED, PENDING, APPROVED, REJECTED }
}
