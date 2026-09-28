package com.shopflow.returns;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "sales_return_items")
@Getter
@Setter
public class SalesReturnItem {

    @Id
    private UUID id = UUID.randomUUID();
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sales_return_id")
    private SalesReturn salesReturn;
    @Column(nullable = false)
    private UUID invoiceItemId;
    @Column(nullable = false)
    private UUID productId;
    @Column(nullable = false)
    private String productName;
    private BigDecimal quantity;
    private String reason;
}
