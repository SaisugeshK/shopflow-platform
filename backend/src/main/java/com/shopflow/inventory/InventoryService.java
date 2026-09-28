package com.shopflow.inventory;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.Money;
import com.shopflow.inventory.InventoryRepositories.StockAdjustmentRepository;
import com.shopflow.inventory.InventoryRepositories.StockBalanceRepository;
import com.shopflow.inventory.InventoryRepositories.StockMovementRepository;
import com.shopflow.inventory.StockMovement.MovementType;
import com.shopflow.products.Product;
import com.shopflow.products.ProductRepositories.ProductRepository;
import com.shopflow.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

/**
 * The only writer of stock. Every change locks the product's balance row (SELECT ... FOR UPDATE), appends an
 * immutable movement and updates the balance in one transaction (§13, §76). Callers touching several products must
 * lock them in a consistent order (sorted by product id) to avoid deadlocks.
 */
@Service
public class InventoryService {

    private final StockBalanceRepository balances;
    private final StockMovementRepository movements;
    private final StockAdjustmentRepository adjustments;
    private final ProductRepository products;
    private final DocumentSequenceService sequences;
    private final BusinessContext businessContext;
    private final AuditService audit;

    public InventoryService(StockBalanceRepository balances, StockMovementRepository movements,
                            StockAdjustmentRepository adjustments, ProductRepository products,
                            DocumentSequenceService sequences, BusinessContext businessContext, AuditService audit) {
        this.balances = balances;
        this.movements = movements;
        this.adjustments = adjustments;
        this.products = products;
        this.sequences = sequences;
        this.businessContext = businessContext;
        this.audit = audit;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void createBalance(UUID productId) {
        balances.save(new StockBalance(productId));
    }

    /**
     * Posts a movement. For outbound movements {@code releaseReserved} is released from the reservation in the same
     * step (used when reserved order stock leaves the warehouse).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public StockMovement post(UUID productId, MovementType type, BigDecimal quantity, BigDecimal unitCost,
                              String referenceType, UUID referenceId, String referenceNumber, String reason,
                              BigDecimal releaseReserved) {
        BigDecimal qty = Money.qty(quantity);
        if (qty.signum() <= 0) {
            throw BusinessException.validation("quantity", "Quantity must be greater than zero");
        }
        StockBalance balance = lock(productId);
        BigDecimal release = releaseReserved == null ? BigDecimal.ZERO : Money.min(Money.qty(releaseReserved), balance.getReserved());
        if (type.inbound()) {
            balance.setOnHand(balance.getOnHand().add(qty));
        } else {
            BigDecimal reservedAfter = balance.getReserved().subtract(release);
            BigDecimal onHandAfter = balance.getOnHand().subtract(qty);
            if (onHandAfter.compareTo(reservedAfter) < 0) {
                throw insufficient(productId, balance.getOnHand().subtract(balance.getReserved()).add(release), qty);
            }
            balance.setReserved(reservedAfter);
            balance.setOnHand(onHandAfter);
        }
        StockMovement movement = new StockMovement(productId, type, qty, unitCost, balance.getOnHand(), referenceType,
                referenceId, referenceNumber, reason, CurrentUser.idIfPresent().orElse(null));
        return movements.save(movement);
    }

    /** Reserves available stock for an order (§76 order creation). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void reserve(UUID productId, BigDecimal quantity) {
        BigDecimal qty = Money.qty(quantity);
        StockBalance balance = lock(productId);
        if (balance.available().compareTo(qty) < 0) {
            throw insufficient(productId, balance.available(), qty);
        }
        balance.setReserved(balance.getReserved().add(qty));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void release(UUID productId, BigDecimal quantity) {
        if (quantity == null || quantity.signum() <= 0) {
            return;
        }
        StockBalance balance = lock(productId);
        balance.setReserved(Money.qty(balance.getReserved().subtract(Money.min(Money.qty(quantity), balance.getReserved()))));
    }

    @Transactional
    public StockAdjustment adjust(UUID productId, MovementType type, BigDecimal quantity, String reason) {
        if (type != MovementType.ADJUSTMENT_IN && type != MovementType.ADJUSTMENT_OUT
                && type != MovementType.DAMAGE_OUT && type != MovementType.LOSS_OUT) {
            throw BusinessException.validation("type", "Adjustment type must be ADJUSTMENT_IN, ADJUSTMENT_OUT, DAMAGE_OUT or LOSS_OUT");
        }
        if (reason == null || reason.isBlank()) {
            throw BusinessException.validation("reason", "A reason is required for stock adjustments");
        }
        Product product = products.findById(productId)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.PRODUCT_NOT_FOUND, "Product"));
        UUID adjustmentId = UUID.randomUUID();
        String number = sequences.next(DocumentType.STOCK_ADJUSTMENT, businessContext.today());
        StockMovement movement = post(productId, type, quantity, product.getPurchasePrice(), "STOCK_ADJUSTMENT",
                adjustmentId, number, reason.trim(), null);
        StockAdjustment adjustment = adjustments.save(new StockAdjustment(adjustmentId, businessContext.businessId(),
                number, productId, type, movement.getQuantity(), reason.trim(), movement.getId(), CurrentUser.id()));
        audit.record(AuditAction.STOCK_ADJUSTED, "PRODUCT", productId, null, Map.of(
                "adjustmentNumber", number, "type", type, "quantity", movement.getQuantity(),
                "balanceAfter", movement.getBalanceAfter(), "reason", reason.trim()));
        return adjustment;
    }

    public StockBalance balance(UUID productId) {
        return balances.findById(productId).orElseThrow(() -> BusinessException.notFound(ErrorCode.PRODUCT_NOT_FOUND, "Stock"));
    }

    private StockBalance lock(UUID productId) {
        return balances.findForUpdate(productId)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.PRODUCT_NOT_FOUND, "Product stock"));
    }

    private BusinessException insufficient(UUID productId, BigDecimal available, BigDecimal requested) {
        String name = products.findById(productId).map(Product::getName).orElse("Product");
        return new BusinessException(ErrorCode.INSUFFICIENT_STOCK,
                "Insufficient stock for " + name + ": available " + available.stripTrailingZeros().toPlainString()
                        + ", requested " + requested.stripTrailingZeros().toPlainString(),
                java.util.List.of(new com.shopflow.common.api.ApiResponse.FieldIssue(productId.toString(), "insufficient stock")));
    }
}
