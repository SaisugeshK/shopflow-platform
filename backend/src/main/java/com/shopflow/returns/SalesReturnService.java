package com.shopflow.returns;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.billing.BillingRepositories.InvoiceRepository;
import com.shopflow.billing.CreditNote;
import com.shopflow.billing.CreditNoteService;
import com.shopflow.billing.Invoice;
import com.shopflow.billing.InvoiceItem;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.customers.Customer;
import com.shopflow.customers.CustomerService;
import com.shopflow.inventory.InventoryService;
import com.shopflow.inventory.StockMovement.MovementType;
import com.shopflow.notifications.NotificationService;
import com.shopflow.orders.Order;
import com.shopflow.orders.OrderItem;
import com.shopflow.orders.OrderRepositories.OrderRepository;
import com.shopflow.orders.OrderStatus;
import com.shopflow.returns.SalesReturnDtos.CreateSalesReturnRequest;
import com.shopflow.returns.SalesReturnDtos.ReturnLineRequest;
import com.shopflow.security.CurrentUser;
import jakarta.persistence.LockModeType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Sales returns (§17): request → review → approve (stock IN + credit note + ledger, atomically) or reject.
 * The original invoice is never modified; the credit note carries the reversal.
 */
@Service
public class SalesReturnService {

    private final SalesReturnRepository returns;
    private final InvoiceRepository invoices;
    private final OrderRepository orders;
    private final CreditNoteService creditNotes;
    private final InventoryService inventory;
    private final CustomerService customers;
    private final DocumentSequenceService sequences;
    private final BusinessContext businessContext;
    private final NotificationService notifications;
    private final AuditService audit;

    public SalesReturnService(SalesReturnRepository returns, InvoiceRepository invoices, OrderRepository orders,
                              CreditNoteService creditNotes, InventoryService inventory, CustomerService customers,
                              DocumentSequenceService sequences, BusinessContext businessContext,
                              NotificationService notifications, AuditService audit) {
        this.returns = returns;
        this.invoices = invoices;
        this.orders = orders;
        this.creditNotes = creditNotes;
        this.inventory = inventory;
        this.customers = customers;
        this.sequences = sequences;
        this.businessContext = businessContext;
        this.notifications = notifications;
        this.audit = audit;
    }

    public SalesReturn get(UUID id) {
        SalesReturn r = returns.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Sales return"));
        if (CurrentUser.isCustomer() && !r.getCustomerId().equals(CurrentUser.customerId())) {
            throw BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Sales return");
        }
        return r;
    }

    public Page<SalesReturn> search(UUID customerId, SalesReturn.Status status, Pageable pageable) {
        Specification<SalesReturn> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            UUID scope = CurrentUser.isCustomer() ? CurrentUser.customerId() : customerId;
            if (scope != null) {
                p.add(cb.equal(root.get("customerId"), scope));
            }
            if (status != null) {
                p.add(cb.equal(root.get("status"), status));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return returns.findAll(spec, pageable);
    }

    @Transactional
    public SalesReturn create(CreateSalesReturnRequest r) {
        Invoice invoice = invoices.findByIdForUpdate(r.invoiceId())
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, "Invoice"));
        if (CurrentUser.isCustomer()) {
            Customer c = customers.currentApprovedCustomer();
            if (!invoice.getCustomerId().equals(c.getId())) {
                throw BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, "Invoice");
            }
        }
        if (!invoice.getStatus().isPosted()) {
            throw new BusinessException(ErrorCode.INVOICE_INVALID_STATUS, "Returns can only be raised against generated invoices");
        }
        if (invoice.getOrderId() != null) {
            Order order = orders.findById(invoice.getOrderId()).orElseThrow();
            if (order.getStatus() != OrderStatus.DELIVERED && order.getStatus() != OrderStatus.COMPLETED) {
                throw new BusinessException(ErrorCode.RETURN_INVALID_STATUS, "Returns are accepted only after delivery; cancel the order instead");
            }
        }
        Set<UUID> seen = new HashSet<>();
        SalesReturn sr = new SalesReturn();
        sr.setBusinessId(businessContext.businessId());
        sr.setReturnNumber(sequences.next(DocumentType.SALES_RETURN, businessContext.today()));
        sr.setInvoiceId(invoice.getId());
        sr.setOrderId(invoice.getOrderId());
        sr.setCustomerId(invoice.getCustomerId());
        sr.setReason(r.reason().trim());
        sr.setRequestedBy(CurrentUser.id());
        for (ReturnLineRequest line : r.items()) {
            InvoiceItem item = invoice.getItems().stream().filter(i -> i.getId().equals(line.invoiceItemId())).findFirst()
                    .orElseThrow(() -> BusinessException.validation("invoiceItemId", "Line not found on this invoice"));
            if (!seen.add(item.getId())) {
                throw BusinessException.validation("invoiceItemId", "Duplicate line");
            }
            BigDecimal returnable = returnable(invoice, item);
            if (Money.qty(line.quantity()).compareTo(returnable) > 0) {
                throw new BusinessException(ErrorCode.RETURN_INVALID_QUANTITY, "At most " + returnable.stripTrailingZeros().toPlainString()
                        + " of " + item.getProductName() + " can be returned");
            }
            SalesReturnItem ri = new SalesReturnItem();
            ri.setSalesReturn(sr);
            ri.setInvoiceItemId(item.getId());
            ri.setProductId(item.getProductId());
            ri.setProductName(item.getProductName());
            ri.setQuantity(Money.qty(line.quantity()));
            ri.setReason(Validation.trim(line.reason()));
            sr.getItems().add(ri);
        }
        returns.saveAndFlush(sr);
        audit.record(AuditAction.RETURN_CREATED, "SALES_RETURN", sr.getId(), null,
                Map.of("returnNumber", sr.getReturnNumber(), "invoiceId", invoice.getId()));
        if (CurrentUser.isCustomer()) {
            notifications.notifyStaff("RETURN_REQUESTED", "Return request " + sr.getReturnNumber(),
                    "Against invoice " + invoice.getInvoiceNumber(), "SALES_RETURN", sr.getId());
        }
        if (Boolean.TRUE.equals(r.approve()) && !CurrentUser.isCustomer()) {
            return approve(sr.getId(), null);
        }
        return sr;
    }

    /** Invoiced − credited − quantity already in open or approved returns. */
    private BigDecimal returnable(Invoice invoice, InvoiceItem item) {
        BigDecimal credited = creditNotes.creditedQuantity(invoice.getId(), item.getId());
        BigDecimal requested = returns.findByInvoiceId(invoice.getId()).stream()
                .filter(r -> r.getStatus() == SalesReturn.Status.REQUESTED)
                .flatMap(r -> r.getItems().stream())
                .filter(i -> i.getInvoiceItemId().equals(item.getId()))
                .map(SalesReturnItem::getQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return item.getQuantity().subtract(credited).subtract(requested).max(BigDecimal.ZERO);
    }

    @Transactional
    public SalesReturn approve(UUID id, String note) {
        SalesReturn sr = returns.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Sales return"));
        if (sr.getStatus() != SalesReturn.Status.REQUESTED) {
            throw new BusinessException(ErrorCode.RETURN_INVALID_STATUS, "Only requested returns can be approved");
        }
        Invoice invoice = invoices.findByIdForUpdate(sr.getInvoiceId()).orElseThrow();
        List<CreditNoteService.Line> lines = new ArrayList<>();
        for (SalesReturnItem ri : sr.getItems()) {
            InvoiceItem item = invoice.getItems().stream().filter(i -> i.getId().equals(ri.getInvoiceItemId())).findFirst().orElseThrow();
            lines.add(new CreditNoteService.Line(item, ri.getQuantity()));
            item.setReturnedQuantity(item.getReturnedQuantity().add(ri.getQuantity()));
        }
        sr.getItems().stream().sorted(Comparator.comparing(SalesReturnItem::getProductId)).forEach(ri -> {
            InvoiceItem item = invoice.getItems().stream().filter(i -> i.getId().equals(ri.getInvoiceItemId())).findFirst().orElseThrow();
            inventory.post(ri.getProductId(), MovementType.SALES_RETURN_IN, ri.getQuantity(), item.getUnitCost(), "SALES_RETURN",
                    sr.getId(), sr.getReturnNumber(), sr.getReason(), null);
        });
        CreditNote creditNote = creditNotes.issue(invoice, lines, CreditNote.ReasonType.SALES_RETURN,
                "Sales return " + sr.getReturnNumber() + ": " + sr.getReason(), "SALES_RETURN", sr.getId());
        if (sr.getOrderId() != null) {
            orders.findByIdForUpdate(sr.getOrderId()).ifPresent(order -> {
                for (SalesReturnItem ri : sr.getItems()) {
                    InvoiceItem item = invoice.getItems().stream().filter(i -> i.getId().equals(ri.getInvoiceItemId())).findFirst().orElseThrow();
                    order.getItems().stream().filter(oi -> oi.getId().equals(item.getOrderItemId())).findFirst()
                            .ifPresent((OrderItem oi) -> oi.setReturnedQuantity(oi.getReturnedQuantity().add(ri.getQuantity())));
                }
            });
        }
        sr.setStatus(SalesReturn.Status.APPROVED);
        sr.setCreditNoteId(creditNote.getId());
        sr.setReviewNote(Validation.trim(note));
        sr.setReviewedAt(Instant.now());
        sr.setReviewedBy(CurrentUser.id());
        audit.record(AuditAction.RETURN_APPROVED, "SALES_RETURN", id, Map.of("status", "REQUESTED"),
                Map.of("status", "APPROVED", "creditNote", creditNote.getCreditNoteNumber(), "amount", creditNote.getGrandTotal()));
        notifyCustomer(sr, "RETURN_APPROVED", "Return " + sr.getReturnNumber() + " approved",
                "Credit note " + creditNote.getCreditNoteNumber() + " for " + creditNote.getGrandTotal() + " issued.");
        return sr;
    }

    @Transactional
    public SalesReturn reject(UUID id, String note) {
        SalesReturn sr = returns.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Sales return"));
        if (sr.getStatus() != SalesReturn.Status.REQUESTED) {
            throw new BusinessException(ErrorCode.RETURN_INVALID_STATUS, "Only requested returns can be rejected");
        }
        sr.setStatus(SalesReturn.Status.REJECTED);
        sr.setReviewNote(note);
        sr.setReviewedAt(Instant.now());
        sr.setReviewedBy(CurrentUser.id());
        audit.record(AuditAction.RETURN_REJECTED, "SALES_RETURN", id, Map.of("status", "REQUESTED"), Map.of("status", "REJECTED", "note", note));
        notifyCustomer(sr, "RETURN_REJECTED", "Return " + sr.getReturnNumber() + " rejected", note);
        return sr;
    }

    private void notifyCustomer(SalesReturn sr, String type, String title, String body) {
        Customer c = customers.get(sr.getCustomerId());
        if (c.getUserId() != null) {
            notifications.notifyUser(c.getUserId(), type, title, body, "SALES_RETURN", sr.getId());
        }
    }

    public interface SalesReturnRepository extends JpaRepository<SalesReturn, UUID>, JpaSpecificationExecutor<SalesReturn> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT r FROM SalesReturn r WHERE r.id = :id")
        Optional<SalesReturn> findByIdForUpdate(@Param("id") UUID id);

        List<SalesReturn> findByInvoiceId(UUID invoiceId);
    }
}
