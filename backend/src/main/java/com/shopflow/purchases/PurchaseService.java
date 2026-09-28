package com.shopflow.purchases;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.billing.TaxCalculator;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.inventory.InventoryService;
import com.shopflow.inventory.StockMovement.MovementType;
import com.shopflow.products.Product;
import com.shopflow.products.ProductService;
import com.shopflow.purchases.PurchaseDtos.CreatePurchaseRequest;
import com.shopflow.purchases.PurchaseDtos.CreatePurchaseReturnRequest;
import com.shopflow.purchases.PurchaseDtos.PurchaseItemRequest;
import com.shopflow.purchases.PurchaseDtos.PurchasePaymentRequest;
import com.shopflow.purchases.PurchaseDtos.PurchaseReturnItemRequest;
import com.shopflow.purchases.PurchaseRepositories.PurchasePaymentRepository;
import com.shopflow.purchases.PurchaseRepositories.PurchaseRepository;
import com.shopflow.purchases.PurchaseRepositories.PurchaseReturnRepository;
import com.shopflow.security.CurrentUser;
import com.shopflow.suppliers.Supplier;
import com.shopflow.suppliers.SupplierAddress;
import com.shopflow.suppliers.SupplierLedgerEntry.EntryType;
import com.shopflow.suppliers.SupplierService;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Purchases (§14) and purchase returns (§18). Posting is transactional: purchase status, stock PURCHASE_IN and the
 * supplier ledger succeed together (§76).
 */
@Service
public class PurchaseService {

    private final PurchaseRepository purchases;
    private final PurchasePaymentRepository payments;
    private final PurchaseReturnRepository returns;
    private final SupplierService suppliers;
    private final ProductService products;
    private final InventoryService inventory;
    private final TaxCalculator calculator;
    private final DocumentSequenceService sequences;
    private final BusinessContext businessContext;
    private final BusinessSettingsService settings;
    private final AuditService audit;

    public PurchaseService(PurchaseRepository purchases, PurchasePaymentRepository payments, PurchaseReturnRepository returns,
                           SupplierService suppliers, ProductService products, InventoryService inventory,
                           TaxCalculator calculator, DocumentSequenceService sequences, BusinessContext businessContext,
                           BusinessSettingsService settings, AuditService audit) {
        this.purchases = purchases;
        this.payments = payments;
        this.returns = returns;
        this.suppliers = suppliers;
        this.products = products;
        this.inventory = inventory;
        this.calculator = calculator;
        this.sequences = sequences;
        this.businessContext = businessContext;
        this.settings = settings;
        this.audit = audit;
    }

    public Purchase get(UUID id) {
        return purchases.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Purchase"));
    }

    public List<PurchasePayment> paymentsFor(UUID purchaseId) {
        return payments.findByPurchaseIdOrderByPaidAtAsc(purchaseId);
    }

    public Page<Purchase> search(String q, UUID supplierId, Purchase.Status status, LocalDate from, LocalDate to, Pageable pageable) {
        Specification<Purchase> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                p.add(cb.or(cb.like(cb.lower(root.get("purchaseNumber")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("supplierInvoiceNumber"), "")), like)));
            }
            if (supplierId != null) {
                p.add(cb.equal(root.get("supplierId"), supplierId));
            }
            if (status != null) {
                p.add(cb.equal(root.get("status"), status));
            }
            if (from != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("purchaseDate"), from));
            }
            if (to != null) {
                p.add(cb.lessThanOrEqualTo(root.get("purchaseDate"), to));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return purchases.findAll(spec, pageable);
    }

    @Transactional
    public Purchase create(CreatePurchaseRequest r) {
        Supplier supplier = suppliers.get(r.supplierId());
        if (!supplier.isActive()) {
            throw BusinessException.validation("supplierId", "Supplier is inactive");
        }
        LocalDate date = r.purchaseDate() != null ? r.purchaseDate() : businessContext.today();
        if (date.isAfter(businessContext.today())) {
            throw BusinessException.validation("purchaseDate", "Purchase date cannot be in the future");
        }
        boolean interState = TaxCalculator.isInterState(businessStateCode(),
                suppliers.address(supplier.getId()).map(SupplierAddress::getStateCode)
                        .orElse(supplier.getGstin() != null ? supplier.getGstin().substring(0, 2) : null));

        Map<UUID, Product> productMap = products.getAll(r.items().stream().map(PurchaseItemRequest::productId).toList())
                .stream().collect(Collectors.toMap(Product::getId, Function.identity()));
        List<TaxCalculator.Line> lines = new ArrayList<>();
        for (PurchaseItemRequest item : r.items()) {
            Product product = productMap.get(item.productId());
            if (product == null) {
                throw BusinessException.validation("items", "Product " + item.productId() + " not found");
            }
            BigDecimal taxRate = item.taxRate() != null ? item.taxRate() : product.getGstRate();
            lines.add(new TaxCalculator.Line(item.quantity(), item.rate(), item.discountPercent(), item.discountAmount(), taxRate, product.getHsnCode()));
        }
        TaxCalculator.Result calc = calculate(lines, interState);

        Purchase p = new Purchase();
        p.setBusinessId(businessContext.businessId());
        p.setPurchaseNumber(sequences.next(DocumentType.PURCHASE, date));
        p.setPurchaseDate(date);
        p.setSupplierId(supplier.getId());
        p.setSupplierInvoiceNumber(Validation.trim(r.supplierInvoiceNumber()));
        p.setSupplierInvoiceDate(r.supplierInvoiceDate());
        p.setInterState(interState);
        p.setNotes(Validation.trim(r.notes()));
        p.setCreatedBy(CurrentUser.id());
        applyTotals(p, calc);
        for (int i = 0; i < r.items().size(); i++) {
            PurchaseItemRequest req = r.items().get(i);
            Product product = productMap.get(req.productId());
            TaxCalculator.LineResult lr = calc.lines().get(i);
            PurchaseItem item = new PurchaseItem();
            item.setPurchase(p);
            item.setLineNumber(i + 1);
            item.setProductId(product.getId());
            item.setProductName(product.getName());
            item.setHsnCode(product.getHsnCode());
            item.setUnit(product.getUnit().name());
            item.setQuantity(Money.qty(req.quantity()));
            item.setRate(Money.of(req.rate()));
            item.setDiscountPercent(lr.discountPercent());
            item.setDiscountAmount(lr.discountAmount());
            item.setTaxRate(lines.get(i).taxRate());
            item.setGrossAmount(lr.gross());
            item.setTaxableAmount(lr.taxable());
            item.setCgstAmount(lr.cgst());
            item.setSgstAmount(lr.sgst());
            item.setIgstAmount(lr.igst());
            item.setLineTotal(lr.total());
            p.getItems().add(item);
        }
        purchases.saveAndFlush(p);
        audit.record(AuditAction.PURCHASE_CREATED, "PURCHASE", p.getId(), null,
                Map.of("purchaseNumber", p.getPurchaseNumber(), "grandTotal", p.getGrandTotal()));
        if (Boolean.TRUE.equals(r.post())) {
            post(p.getId());
        }
        return p;
    }

    /** DRAFT → POSTED: stock in and supplier ledger credit, in one transaction. */
    @Transactional
    public Purchase post(UUID id) {
        Purchase p = purchases.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Purchase"));
        if (p.getStatus() == Purchase.Status.POSTED) {
            return p;
        }
        if (p.getStatus() != Purchase.Status.DRAFT) {
            throw new BusinessException(ErrorCode.PURCHASE_INVALID_STATUS, "Only draft purchases can be posted");
        }
        p.getItems().stream().sorted(Comparator.comparing(PurchaseItem::getProductId)).forEach(item -> {
            BigDecimal unitCost = item.getTaxableAmount().divide(item.getQuantity(), 2, RoundingMode.HALF_UP);
            inventory.post(item.getProductId(), MovementType.PURCHASE_IN, item.getQuantity(), unitCost, "PURCHASE",
                    p.getId(), p.getPurchaseNumber(), "Purchase received", null);
        });
        suppliers.credit(p.getSupplierId(), EntryType.PURCHASE, "PURCHASE", p.getId(), p.getPurchaseNumber(),
                p.getGrandTotal(), "Purchase " + p.getPurchaseNumber()
                        + (p.getSupplierInvoiceNumber() != null ? " (supplier invoice " + p.getSupplierInvoiceNumber() + ")" : ""));
        p.setStatus(Purchase.Status.POSTED);
        p.setPostedAt(Instant.now());
        p.setPostedBy(CurrentUser.id());
        audit.record(AuditAction.PURCHASE_POSTED, "PURCHASE", id, Map.of("status", "DRAFT"), Map.of("status", "POSTED"));
        return p;
    }

    /** Only drafts can be cancelled; posted purchases are corrected with a purchase return (§86). */
    @Transactional
    public Purchase cancel(UUID id, String reason) {
        Purchase p = purchases.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Purchase"));
        if (p.getStatus() != Purchase.Status.DRAFT) {
            throw new BusinessException(ErrorCode.PURCHASE_INVALID_STATUS,
                    "Posted purchases cannot be cancelled; create a purchase return instead");
        }
        p.setStatus(Purchase.Status.CANCELLED);
        p.setCancelledAt(Instant.now());
        p.setCancelledBy(CurrentUser.id());
        p.setCancelReason(reason.trim());
        audit.record(AuditAction.PURCHASE_CANCELLED, "PURCHASE", id, Map.of("status", "DRAFT"), Map.of("status", "CANCELLED", "reason", reason));
        return p;
    }

    @Transactional
    public PurchasePayment recordPayment(UUID purchaseId, PurchasePaymentRequest r) {
        Purchase p = purchases.findByIdForUpdate(purchaseId).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Purchase"));
        if (p.getStatus() != Purchase.Status.POSTED) {
            throw new BusinessException(ErrorCode.PURCHASE_INVALID_STATUS, "Payments can only be recorded for posted purchases");
        }
        BigDecimal due = p.getGrandTotal().subtract(p.getPaidAmount());
        BigDecimal amount = Money.of(r.amount());
        if (amount.compareTo(due) > 0) {
            throw new BusinessException(ErrorCode.PAYMENT_INVALID_AMOUNT, "Payment exceeds the balance due of " + due);
        }
        Instant paidAt = r.paidAt() != null ? r.paidAt() : Instant.now();
        String number = sequences.next(DocumentType.PURCHASE_PAYMENT, LocalDate.ofInstant(paidAt, businessContext.zone()));
        PurchasePayment payment = payments.save(new PurchasePayment(purchaseId, number, amount, r.method(),
                Validation.trim(r.referenceNumber()), paidAt, Validation.trim(r.notes()), CurrentUser.id()));
        p.setPaidAmount(p.getPaidAmount().add(amount));
        p.setPaymentStatus(p.getPaidAmount().compareTo(p.getGrandTotal()) >= 0 ? Purchase.PaymentStatus.PAID : Purchase.PaymentStatus.PARTIALLY_PAID);
        suppliers.debit(p.getSupplierId(), EntryType.PURCHASE_PAYMENT, "PURCHASE_PAYMENT", payment.getId(), number,
                amount, "Payment for " + p.getPurchaseNumber());
        audit.record(AuditAction.PURCHASE_PAYMENT_CREATED, "PURCHASE", purchaseId, null,
                Map.of("paymentNumber", number, "amount", amount, "method", r.method()));
        return payment;
    }

    // ---------------------------------------------------------------- returns

    public PurchaseReturn getReturn(UUID id) {
        return returns.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Purchase return"));
    }

    public Page<PurchaseReturn> searchReturns(UUID supplierId, PurchaseReturn.Status status, Pageable pageable) {
        Specification<PurchaseReturn> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            if (supplierId != null) {
                p.add(cb.equal(root.get("supplierId"), supplierId));
            }
            if (status != null) {
                p.add(cb.equal(root.get("status"), status));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return returns.findAll(spec, pageable);
    }

    @Transactional
    public PurchaseReturn createReturn(CreatePurchaseReturnRequest r) {
        Purchase purchase = get(r.purchaseId());
        if (purchase.getStatus() != Purchase.Status.POSTED) {
            throw new BusinessException(ErrorCode.PURCHASE_INVALID_STATUS, "Returns can only be created for posted purchases");
        }
        Map<UUID, PurchaseItem> itemMap = purchase.getItems().stream().collect(Collectors.toMap(PurchaseItem::getId, Function.identity()));
        Set<UUID> seen = new HashSet<>();
        List<TaxCalculator.Line> lines = new ArrayList<>();
        List<PurchaseItem> sourceItems = new ArrayList<>();
        for (PurchaseReturnItemRequest ri : r.items()) {
            PurchaseItem source = itemMap.get(ri.purchaseItemId());
            if (source == null || !seen.add(ri.purchaseItemId())) {
                throw new BusinessException(ErrorCode.RETURN_INVALID_QUANTITY, "Invalid or duplicate purchase item");
            }
            BigDecimal returnable = source.getQuantity().subtract(source.getReturnedQuantity()).subtract(draftReturnedQuantity(purchase.getId(), source.getId()));
            if (Money.qty(ri.quantity()).compareTo(returnable) > 0) {
                throw new BusinessException(ErrorCode.RETURN_INVALID_QUANTITY,
                        "Cannot return more than " + returnable.stripTrailingZeros().toPlainString() + " of " + source.getProductName());
            }
            // Return value uses the original net rate (after discount) so the reversal mirrors the purchase.
            BigDecimal netRate = source.getTaxableAmount().divide(source.getQuantity(), 2, RoundingMode.HALF_UP);
            lines.add(new TaxCalculator.Line(ri.quantity(), netRate, null, null, source.getTaxRate(), source.getHsnCode()));
            sourceItems.add(source);
        }
        TaxCalculator.Result calc = calculate(lines, purchase.isInterState());
        LocalDate date = r.returnDate() != null ? r.returnDate() : businessContext.today();
        PurchaseReturn pr = new PurchaseReturn();
        pr.setBusinessId(businessContext.businessId());
        pr.setReturnNumber(sequences.next(DocumentType.PURCHASE_RETURN, date));
        pr.setPurchaseId(purchase.getId());
        pr.setSupplierId(purchase.getSupplierId());
        pr.setReturnDate(date);
        pr.setReason(r.reason().trim());
        pr.setTaxableTotal(calc.taxable());
        pr.setCgstTotal(calc.cgst());
        pr.setSgstTotal(calc.sgst());
        pr.setIgstTotal(calc.igst());
        pr.setRoundOff(calc.roundOff());
        pr.setGrandTotal(calc.grandTotal());
        pr.setCreatedBy(CurrentUser.id());
        for (int i = 0; i < sourceItems.size(); i++) {
            PurchaseItem source = sourceItems.get(i);
            TaxCalculator.LineResult lr = calc.lines().get(i);
            PurchaseReturnItem item = new PurchaseReturnItem();
            item.setPurchaseReturn(pr);
            item.setPurchaseItemId(source.getId());
            item.setProductId(source.getProductId());
            item.setProductName(source.getProductName());
            item.setQuantity(Money.qty(lines.get(i).quantity()));
            item.setRate(lines.get(i).rate());
            item.setTaxRate(source.getTaxRate());
            item.setTaxableAmount(lr.taxable());
            item.setCgstAmount(lr.cgst());
            item.setSgstAmount(lr.sgst());
            item.setIgstAmount(lr.igst());
            item.setLineTotal(lr.total());
            pr.getItems().add(item);
        }
        returns.saveAndFlush(pr);
        audit.record(AuditAction.PURCHASE_RETURN_CREATED, "PURCHASE_RETURN", pr.getId(), null,
                Map.of("returnNumber", pr.getReturnNumber(), "grandTotal", pr.getGrandTotal()));
        if (Boolean.TRUE.equals(r.post())) {
            postReturn(pr.getId());
        }
        return pr;
    }

    /** Stock OUT and supplier ledger debit, together (§18). */
    @Transactional
    public PurchaseReturn postReturn(UUID id) {
        PurchaseReturn pr = returns.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Purchase return"));
        if (pr.getStatus() == PurchaseReturn.Status.POSTED) {
            return pr;
        }
        Purchase purchase = purchases.findByIdForUpdate(pr.getPurchaseId()).orElseThrow();
        Map<UUID, PurchaseItem> itemMap = purchase.getItems().stream().collect(Collectors.toMap(PurchaseItem::getId, Function.identity()));
        pr.getItems().stream().sorted(Comparator.comparing(PurchaseReturnItem::getProductId)).forEach(ri -> {
            PurchaseItem source = itemMap.get(ri.getPurchaseItemId());
            BigDecimal remaining = source.getQuantity().subtract(source.getReturnedQuantity());
            if (ri.getQuantity().compareTo(remaining) > 0) {
                throw new BusinessException(ErrorCode.RETURN_INVALID_QUANTITY, "Return exceeds the remaining quantity of " + source.getProductName());
            }
            inventory.post(ri.getProductId(), MovementType.PURCHASE_RETURN_OUT, ri.getQuantity(), ri.getRate(),
                    "PURCHASE_RETURN", pr.getId(), pr.getReturnNumber(), pr.getReason(), null);
            source.setReturnedQuantity(source.getReturnedQuantity().add(ri.getQuantity()));
        });
        suppliers.debit(pr.getSupplierId(), EntryType.PURCHASE_RETURN, "PURCHASE_RETURN", pr.getId(), pr.getReturnNumber(),
                pr.getGrandTotal(), "Return against " + purchase.getPurchaseNumber());
        pr.setStatus(PurchaseReturn.Status.POSTED);
        pr.setPostedAt(Instant.now());
        pr.setPostedBy(CurrentUser.id());
        audit.record(AuditAction.PURCHASE_RETURN_POSTED, "PURCHASE_RETURN", id, Map.of("status", "DRAFT"), Map.of("status", "POSTED"));
        return pr;
    }

    private BigDecimal draftReturnedQuantity(UUID purchaseId, UUID purchaseItemId) {
        return returns.findByPurchaseId(purchaseId).stream()
                .filter(r -> r.getStatus() == PurchaseReturn.Status.DRAFT)
                .flatMap(r -> r.getItems().stream())
                .filter(i -> i.getPurchaseItemId().equals(purchaseItemId))
                .map(PurchaseReturnItem::getQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private TaxCalculator.Result calculate(List<TaxCalculator.Line> lines, boolean interState) {
        try {
            return calculator.calculate(lines, interState, settings.taxSettings().isRoundOffEnabled());
        } catch (IllegalArgumentException e) {
            throw BusinessException.validation("items", e.getMessage());
        }
    }

    private static void applyTotals(Purchase p, TaxCalculator.Result calc) {
        p.setSubtotal(calc.subtotal());
        p.setDiscountTotal(calc.discount());
        p.setTaxableTotal(calc.taxable());
        p.setCgstTotal(calc.cgst());
        p.setSgstTotal(calc.sgst());
        p.setIgstTotal(calc.igst());
        p.setRoundOff(calc.roundOff());
        p.setGrandTotal(calc.grandTotal());
    }

    private String businessStateCode() {
        return settings.business().getStateCode();
    }
}
