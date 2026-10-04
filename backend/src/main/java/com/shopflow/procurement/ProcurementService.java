package com.shopflow.procurement;

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
import com.shopflow.files.FileService;
import com.shopflow.files.StoredFile;
import com.shopflow.notifications.NotificationService;
import com.shopflow.procurement.ProcurementDtos.AcceptRequest;
import com.shopflow.procurement.ProcurementDtos.CounterRequest;
import com.shopflow.procurement.ProcurementDtos.CreatePoRequest;
import com.shopflow.procurement.ProcurementDtos.CreateReceiptRequest;
import com.shopflow.procurement.ProcurementDtos.ExtraLine;
import com.shopflow.procurement.ProcurementDtos.LineChange;
import com.shopflow.procurement.ProcurementDtos.PoLineRequest;
import com.shopflow.procurement.ProcurementDtos.QuoteRequest;
import com.shopflow.procurement.ProcurementDtos.ReceiptLineRequest;
import com.shopflow.products.Product;
import com.shopflow.products.ProductOptionsService;
import com.shopflow.products.ProductService;
import com.shopflow.purchases.Purchase;
import com.shopflow.purchases.PurchaseDtos.CreatePurchaseRequest;
import com.shopflow.purchases.PurchaseDtos.PurchaseItemRequest;
import com.shopflow.purchases.PurchaseService;
import com.shopflow.security.CurrentUser;
import com.shopflow.suppliers.Supplier;
import com.shopflow.suppliers.SupplierAddress;
import com.shopflow.suppliers.SupplierRepositories.SupplierRepository;
import com.shopflow.suppliers.SupplierService;
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
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Purchase orders with supplier quotation rounds and goods receipts (§0B.8). The business side needs the
 * PURCHASE_ORDERS module, the supplier side SUPPLIER_PORTAL (ModuleGuard). Every round is stored as an immutable
 * revision with a full snapshot of the lines; a goods receipt creates and posts a purchase, so stock and the supplier
 * ledger go through the existing purchase posting.
 */
@Service
public class ProcurementService {

    public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, UUID>, JpaSpecificationExecutor<PurchaseOrder> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("SELECT p FROM PurchaseOrder p WHERE p.id = :id")
        Optional<PurchaseOrder> findByIdForUpdate(@Param("id") UUID id);
    }

    public enum Actor { BUSINESS, SUPPLIER, SYSTEM }

    private final PurchaseOrderRepository orders;
    private final SupplierRepository supplierRepository;
    private final SupplierService suppliers;
    private final ProductService products;
    private final ProductOptionsService options;
    private final PurchaseService purchases;
    private final TaxCalculator calculator;
    private final DocumentSequenceService sequences;
    private final BusinessContext businessContext;
    private final BusinessSettingsService settings;
    private final NamedParameterJdbcTemplate jdbc;
    private final FileService files;
    private final NotificationService notifications;
    private final AuditService audit;
    private final ObjectMapper mapper;

    public ProcurementService(PurchaseOrderRepository orders, SupplierRepository supplierRepository, SupplierService suppliers,
                              ProductService products, ProductOptionsService options, PurchaseService purchases,
                              TaxCalculator calculator, DocumentSequenceService sequences, BusinessContext businessContext,
                              BusinessSettingsService settings, NamedParameterJdbcTemplate jdbc, FileService files,
                              NotificationService notifications, AuditService audit, ObjectMapper mapper) {
        this.orders = orders;
        this.supplierRepository = supplierRepository;
        this.suppliers = suppliers;
        this.products = products;
        this.options = options;
        this.purchases = purchases;
        this.calculator = calculator;
        this.sequences = sequences;
        this.businessContext = businessContext;
        this.settings = settings;
        this.jdbc = jdbc;
        this.files = files;
        this.notifications = notifications;
        this.audit = audit;
        this.mapper = mapper;
    }

    // ---------------------------------------------------------------------------------------------------------
    // Queries
    // ---------------------------------------------------------------------------------------------------------

    public Page<PurchaseOrder> search(String q, PurchaseOrder.Status status, UUID supplierId, boolean excludeDrafts, Pageable pageable) {
        Specification<PurchaseOrder> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            if (q != null && !q.isBlank()) {
                p.add(cb.like(cb.lower(root.get("poNumber")), "%" + q.trim().toLowerCase() + "%"));
            }
            if (status != null) {
                p.add(cb.equal(root.get("status"), status));
            }
            if (supplierId != null) {
                p.add(cb.equal(root.get("supplierId"), supplierId));
            }
            if (excludeDrafts) {
                p.add(cb.notEqual(root.get("status"), PurchaseOrder.Status.DRAFT));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return orders.findAll(spec, pageable);
    }

    @Transactional
    public PurchaseOrder get(UUID id) {
        PurchaseOrder po = orders.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Purchase order"));
        expireIfDue(po);
        return po;
    }

    // ---------------------------------------------------------------------------------------------------------
    // Business side
    // ---------------------------------------------------------------------------------------------------------

    @Transactional
    public PurchaseOrder create(CreatePoRequest r) {
        Supplier supplier = suppliers.get(r.supplierId());
        if (!supplier.isActive()) {
            throw BusinessException.validation("supplierId", "Supplier is inactive");
        }
        LocalDate date = r.orderDate() != null ? r.orderDate() : businessContext.today();
        PurchaseOrder po = new PurchaseOrder();
        po.setBusinessId(businessContext.businessId());
        po.setPoNumber(sequences.next(DocumentType.PURCHASE_ORDER, date));
        po.setSupplierId(supplier.getId());
        po.setOrderDate(date);
        po.setExpectedDate(r.expectedDate());
        po.setNotes(Validation.trim(r.notes()));
        po.setInterState(interState(supplier));
        po.setCreatedBy(CurrentUser.id());
        Map<UUID, Product> productMap = products.getAll(r.lines().stream().map(PoLineRequest::productId).toList()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        int n = 1;
        for (PoLineRequest l : r.lines()) {
            Product p = productMap.get(l.productId());
            if (p == null) {
                throw BusinessException.validation("lines", "Product " + l.productId() + " not found");
            }
            options.requireSellable(p);
            ProductOptionsService.ResolvedUnit unit = options.resolve(p, l.unit());
            options.validateQuantity(p, unit.toBase(l.quantity()));
            PurchaseOrderLine line = new PurchaseOrderLine();
            line.setPurchaseOrder(po);
            line.setLineNumber(n++);
            line.setProductId(p.getId());
            line.setDescription(p.getName());
            line.setHsnCode(p.getHsnCode());
            line.setUnit(unit.unit());
            line.setUnitFactor(unit.factor());
            line.setQuantity(Money.qty(l.quantity()));
            line.setRate(l.rate() != null ? Money.of(l.rate()) : Money.of(p.getPurchasePrice().multiply(unit.factor())));
            line.setDiscountPercent(l.discountPercent() == null ? BigDecimal.ZERO : l.discountPercent());
            line.setTaxRate(l.taxRate() != null ? l.taxRate() : p.getGstRate());
            line.setLineNote(Validation.trim(l.note()));
            po.getLines().add(line);
        }
        recalculate(po);
        orders.saveAndFlush(po);
        audit.record(AuditAction.PURCHASE_CREATED, "PURCHASE_ORDER", po.getId(), null, Map.of("poNumber", po.getPoNumber(), "grandTotal", po.getGrandTotal()));
        if (Boolean.TRUE.equals(r.send())) {
            return send(po.getId(), null);
        }
        return po;
    }

    /** Draft → SENT: the supplier can now see and quote it. */
    @Transactional
    public PurchaseOrder send(UUID id, String note) {
        PurchaseOrder po = lock(id);
        require(po, PurchaseOrder.Status.DRAFT);
        po.setStatus(PurchaseOrder.Status.SENT);
        po.setSentAt(Instant.now());
        revision(po, Actor.BUSINESS, "SENT", note);
        notifySupplier(po, "PO_SENT", "New purchase order " + po.getPoNumber(), "Please review and send your quotation.");
        return po;
    }

    /** Business counter-offer on a quotation. In a draft, the same call simply edits the lines. */
    @Transactional
    public PurchaseOrder counter(UUID id, CounterRequest r) {
        PurchaseOrder po = lock(id);
        if (po.getStatus() != PurchaseOrder.Status.QUOTED && po.getStatus() != PurchaseOrder.Status.DRAFT) {
            throw invalid(po, "Counter-offers are possible after the supplier has quoted");
        }
        applyChanges(po, r.lines(), Actor.BUSINESS);
        if (r.expectedDate() != null) {
            po.setExpectedDate(r.expectedDate());
        }
        recalculate(po);
        if (po.getStatus() == PurchaseOrder.Status.DRAFT) {
            if (r.note() != null) {
                po.setNotes(Validation.trim(r.note()));
            }
            return po;
        }
        po.setStatus(PurchaseOrder.Status.COUNTERED);
        revision(po, Actor.BUSINESS, "COUNTERED", r.note());
        notifySupplier(po, "PO_COUNTERED", "Counter-offer on " + po.getPoNumber(), "The buyer changed the terms; please review and quote again.");
        return po;
    }

    @Transactional
    public PurchaseOrder accept(UUID id, AcceptRequest r) {
        PurchaseOrder po = lock(id);
        if (po.getStatus() != PurchaseOrder.Status.QUOTED) {
            throw invalid(po, "Only a quotation from the supplier can be accepted");
        }
        Set<UUID> selected = r == null || r.lineIds() == null || r.lineIds().isEmpty() ? null : new HashSet<>(r.lineIds());
        Map<UUID, UUID> links = r == null || r.productLinks() == null ? Map.of() : r.productLinks();
        int accepted = 0;
        for (PurchaseOrderLine line : po.getLines()) {
            if (line.getStatus() != PurchaseOrderLine.LineStatus.OPEN) {
                continue;
            }
            boolean take = (selected == null || selected.contains(line.getId()))
                    && line.getAvailability() != PurchaseOrderLine.Availability.UNAVAILABLE && line.getQuantity().signum() > 0;
            if (take && line.getProductId() == null) {
                UUID productId = links.get(line.getId());
                if (productId == null) {
                    throw BusinessException.validation("productLinks", "Link the supplier's extra line \"" + line.getDescription() + "\" to one of your products");
                }
                Product p = products.get(productId);
                options.requireSellable(p);
                line.setProductId(p.getId());
                line.setHsnCode(p.getHsnCode());
                line.setUnit(p.getUnit().name());
                line.setUnitFactor(BigDecimal.ONE);
            }
            line.setStatus(take ? PurchaseOrderLine.LineStatus.ACCEPTED : PurchaseOrderLine.LineStatus.REJECTED);
            accepted += take ? 1 : 0;
        }
        if (accepted == 0) {
            throw BusinessException.validation("lineIds", "Accept at least one available line, or reject the quotation");
        }
        recalculate(po);
        po.setStatus(PurchaseOrder.Status.ACCEPTED);
        po.setAcceptedAt(Instant.now());
        revision(po, Actor.BUSINESS, "ACCEPTED", r == null ? null : r.note());
        notifySupplier(po, "PO_ACCEPTED", "Purchase order " + po.getPoNumber() + " accepted",
                accepted + " line(s) accepted for " + po.getGrandTotal() + ". Please deliver.");
        return po;
    }

    @Transactional
    public PurchaseOrder reject(UUID id, String reason) {
        PurchaseOrder po = lock(id);
        if (!po.getStatus().negotiating()) {
            throw invalid(po, "Only an order under negotiation can be rejected");
        }
        po.setStatus(PurchaseOrder.Status.REJECTED);
        po.setCancelReason(reason.trim());
        revision(po, Actor.BUSINESS, "REJECTED", reason);
        notifySupplier(po, "PO_REJECTED", "Purchase order " + po.getPoNumber() + " rejected", reason.trim());
        return po;
    }

    @Transactional
    public PurchaseOrder cancel(UUID id, String reason) {
        PurchaseOrder po = lock(id);
        boolean received = po.getLines().stream().anyMatch(l -> l.getReceivedQuantity().signum() > 0);
        if (received || PurchaseOrder.Status.FINAL.contains(po.getStatus()) || po.getStatus() == PurchaseOrder.Status.PARTIALLY_RECEIVED) {
            throw invalid(po, "This purchase order can no longer be cancelled" + (received ? "; close it instead" : ""));
        }
        PurchaseOrder.Status before = po.getStatus();
        po.setStatus(PurchaseOrder.Status.CANCELLED);
        po.setCancelledAt(Instant.now());
        po.setCancelReason(reason.trim());
        if (before != PurchaseOrder.Status.DRAFT) {
            revision(po, Actor.BUSINESS, "CANCELLED", reason);
            notifySupplier(po, "PO_CANCELLED", "Purchase order " + po.getPoNumber() + " cancelled", reason.trim());
        }
        return po;
    }

    /** Ends an accepted or partly received order; nothing more will be received against it. */
    @Transactional
    public PurchaseOrder close(UUID id, String note) {
        PurchaseOrder po = lock(id);
        if (!po.getStatus().receivable() && po.getStatus() != PurchaseOrder.Status.RECEIVED) {
            throw invalid(po, "Only accepted or received orders can be closed");
        }
        po.setStatus(PurchaseOrder.Status.CLOSED);
        po.setClosedAt(Instant.now());
        revision(po, Actor.BUSINESS, "CLOSED", note);
        return po;
    }

    /**
     * Goods receipt against accepted lines (partial deliveries allowed). Good quantity (received − damaged) goes into a
     * new purchase that is posted at once; rate or quantity mismatches against the accepted order are flagged.
     */
    @Transactional
    public UUID receive(UUID id, CreateReceiptRequest r) {
        PurchaseOrder po = lock(id);
        if (!po.getStatus().receivable()) {
            throw invalid(po, "Goods can be received only against an accepted order");
        }
        Map<UUID, PurchaseOrderLine> lineMap = po.getLines().stream().collect(Collectors.toMap(PurchaseOrderLine::getId, Function.identity()));
        LocalDate date = r.receiptDate() != null ? r.receiptDate() : businessContext.today();
        List<PurchaseItemRequest> items = new ArrayList<>();
        List<Map<String, Object>> grnLines = new ArrayList<>();
        boolean mismatch = false;
        for (ReceiptLineRequest rl : r.lines()) {
            PurchaseOrderLine line = lineMap.get(rl.poLineId());
            if (line == null || line.getStatus() != PurchaseOrderLine.LineStatus.ACCEPTED) {
                throw BusinessException.validation("lines", "Line " + rl.poLineId() + " is not an accepted line of this order");
            }
            BigDecimal received = Money.qty(rl.receivedQuantity());
            BigDecimal damaged = rl.damagedQuantity() == null ? BigDecimal.ZERO : Money.qty(rl.damagedQuantity());
            if (damaged.compareTo(received) > 0) {
                throw BusinessException.validation("damagedQuantity", "Damaged quantity of " + line.getDescription() + " exceeds the received quantity");
            }
            BigDecimal good = received.subtract(damaged);
            BigDecimal rate = rl.rate() != null ? Money.of(rl.rate()) : line.getRate();
            List<String> notes = new ArrayList<>();
            if (rate.compareTo(line.getRate()) != 0) {
                notes.add("rate " + rate + " vs ordered " + line.getRate());
            }
            if (good.compareTo(line.pendingQuantity()) > 0) {
                notes.add("excess: " + plain(good.subtract(line.pendingQuantity())) + " more than pending");
            }
            if (damaged.signum() > 0) {
                notes.add(plain(damaged) + " damaged");
            }
            mismatch |= !notes.isEmpty();
            if (good.signum() > 0) {
                items.add(new PurchaseItemRequest(line.getProductId(), good, rate, line.getDiscountPercent(), null, line.getTaxRate(),
                        line.getUnit(), rl.batchNumber(), rl.mfgDate(), rl.expiryDate(), rl.serialNumbers()));
            }
            line.setReceivedQuantity(Money.qty(line.getReceivedQuantity().add(good)));
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("line", line);
            g.put("received", received);
            g.put("damaged", damaged);
            g.put("rate", rate);
            g.put("request", rl);
            g.put("note", notes.isEmpty() ? null : String.join("; ", notes));
            grnLines.add(g);
        }
        if (items.isEmpty()) {
            throw BusinessException.validation("lines", "Nothing was received in good condition");
        }
        Purchase purchase = purchases.create(new CreatePurchaseRequest(po.getSupplierId(), date, Validation.trim(r.supplierInvoiceNumber()),
                r.supplierInvoiceDate(), items, "Goods receipt against " + po.getPoNumber()
                + (r.notes() != null && !r.notes().isBlank() ? " — " + r.notes().trim() : ""), true));
        UUID grnId = UUID.randomUUID();
        String grnNumber = sequences.next(DocumentType.GOODS_RECEIPT, date);
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO goods_receipts (id, grn_number, purchase_order_id, supplier_id, receipt_date, supplier_invoice_number,
                    supplier_invoice_date, purchase_id, notes, has_mismatch, created_by, created_at)
                VALUES (:id, :n, :po, :s, :d, :inv, :invd, :pur, :notes, :mm, :by, :now)
                """, new MapSqlParameterSource().addValue("id", grnId).addValue("n", grnNumber).addValue("po", po.getId())
                .addValue("s", po.getSupplierId()).addValue("d", Date.valueOf(date)).addValue("inv", Validation.trim(r.supplierInvoiceNumber()))
                .addValue("invd", r.supplierInvoiceDate() == null ? null : Date.valueOf(r.supplierInvoiceDate()))
                .addValue("pur", purchase.getId()).addValue("notes", Validation.trim(r.notes())).addValue("mm", mismatch)
                .addValue("by", CurrentUser.id()).addValue("now", now));
        for (Map<String, Object> g : grnLines) {
            PurchaseOrderLine line = (PurchaseOrderLine) g.get("line");
            ReceiptLineRequest rl = (ReceiptLineRequest) g.get("request");
            jdbc.update("""
                    INSERT INTO goods_receipt_lines (id, goods_receipt_id, po_line_id, product_id, received_quantity, damaged_quantity, rate,
                        batch_number, mfg_date, expiry_date, serial_numbers, mismatch_note)
                    VALUES (:id, :g, :l, :p, :r, :dmg, :rate, :b, :mfg, :exp, :ser, :note)
                    """, new MapSqlParameterSource().addValue("id", UUID.randomUUID()).addValue("g", grnId).addValue("l", line.getId())
                    .addValue("p", line.getProductId()).addValue("r", g.get("received")).addValue("dmg", g.get("damaged"))
                    .addValue("rate", g.get("rate")).addValue("b", Validation.trim(rl.batchNumber()))
                    .addValue("mfg", rl.mfgDate() == null ? null : Date.valueOf(rl.mfgDate()))
                    .addValue("exp", rl.expiryDate() == null ? null : Date.valueOf(rl.expiryDate()))
                    .addValue("ser", rl.serialNumbers() == null || rl.serialNumbers().isEmpty() ? null : String.join(",", rl.serialNumbers()))
                    .addValue("note", g.get("note")));
        }
        boolean complete = po.getLines().stream().filter(l -> l.getStatus() == PurchaseOrderLine.LineStatus.ACCEPTED)
                .allMatch(l -> l.pendingQuantity().signum() == 0);
        po.setStatus(complete ? PurchaseOrder.Status.RECEIVED : PurchaseOrder.Status.PARTIALLY_RECEIVED);
        revision(po, Actor.BUSINESS, "RECEIVED", grnNumber + (mismatch ? " (with differences)" : ""));
        audit.record(AuditAction.PURCHASE_POSTED, "GOODS_RECEIPT", grnId, null, Map.of("grnNumber", grnNumber, "poNumber", po.getPoNumber(),
                "purchaseNumber", purchase.getPurchaseNumber(), "mismatch", mismatch));
        notifySupplier(po, "PO_RECEIVED", "Goods received for " + po.getPoNumber(), grnNumber + (complete ? " — order complete" : " — partly received"));
        return grnId;
    }

    // ---------------------------------------------------------------------------------------------------------
    // Supplier side (portal)
    // ---------------------------------------------------------------------------------------------------------

    /** The supplier record of the signed-in SUPPLIER user. */
    public Supplier currentSupplier() {
        Supplier s = supplierRepository.findByUserId(CurrentUser.id())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_FORBIDDEN, "No supplier account is linked to this login"));
        if (!s.isActive()) {
            throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE, "This supplier account is inactive");
        }
        return s;
    }

    /** A purchase order of the signed-in supplier (never drafts, never another supplier's). */
    @Transactional
    public PurchaseOrder portalGet(UUID id) {
        Supplier s = currentSupplier();
        PurchaseOrder po = orders.findById(id).filter(p -> p.getSupplierId().equals(s.getId()) && p.getStatus() != PurchaseOrder.Status.DRAFT)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Purchase order"));
        expireIfDue(po);
        return po;
    }

    /** The supplier's quotation: may change every line (rate, quantity, availability, dates, notes) and add lines. */
    @Transactional
    public PurchaseOrder quote(UUID id, QuoteRequest r) {
        PurchaseOrder po = portalGet(id);
        po = lock(po.getId());
        if (po.getStatus() != PurchaseOrder.Status.SENT && po.getStatus() != PurchaseOrder.Status.COUNTERED) {
            throw invalid(po, "A quotation can be sent while the order is waiting for one");
        }
        applyChanges(po, r.lines(), Actor.SUPPLIER);
        if (r.extraLines() != null) {
            int n = po.getLines().stream().mapToInt(PurchaseOrderLine::getLineNumber).max().orElse(0) + 1;
            for (ExtraLine e : r.extraLines()) {
                PurchaseOrderLine line = new PurchaseOrderLine();
                line.setPurchaseOrder(po);
                line.setLineNumber(n++);
                line.setAddedBy("SUPPLIER");
                line.setDescription(e.description().trim());
                line.setQuantity(Money.qty(e.quantity()));
                line.setRate(Money.of(e.rate()));
                line.setTaxRate(e.taxRate() == null ? BigDecimal.ZERO : e.taxRate());
                line.setLineNote(Validation.trim(e.note()));
                line.setUnit(e.unit() == null || e.unit().isBlank() ? "PCS" : e.unit().trim().toUpperCase());
                if (e.productId() != null) {
                    Product p = products.get(e.productId());
                    line.setProductId(p.getId());
                    line.setHsnCode(p.getHsnCode());
                    line.setUnit(p.getUnit().name());
                }
                po.getLines().add(line);
            }
        }
        if (r.quoteValidUntil() != null) {
            if (r.quoteValidUntil().isBefore(businessContext.today())) {
                throw BusinessException.validation("quoteValidUntil", "The quotation validity date is in the past");
            }
            po.setQuoteValidUntil(r.quoteValidUntil());
        }
        if (r.expectedDate() != null) {
            po.setExpectedDate(r.expectedDate());
        }
        po.setSupplierNote(Validation.trim(r.note()));
        recalculate(po);
        po.setStatus(PurchaseOrder.Status.QUOTED);
        po.setQuotedAt(Instant.now());
        revision(po, Actor.SUPPLIER, "QUOTED", r.note());
        notifications.notifyStaff("PO_QUOTED", "Quotation for " + po.getPoNumber(),
                supplierName(po) + " quoted " + po.getGrandTotal(), "PURCHASE_ORDER", po.getId());
        return po;
    }

    @Transactional
    public PurchaseOrder decline(UUID id, String reason) {
        PurchaseOrder po = lock(portalGet(id).getId());
        if (po.getStatus() != PurchaseOrder.Status.SENT && po.getStatus() != PurchaseOrder.Status.COUNTERED) {
            throw invalid(po, "Only an order waiting for your quotation can be declined");
        }
        po.setStatus(PurchaseOrder.Status.REJECTED);
        po.setCancelReason(reason.trim());
        revision(po, Actor.SUPPLIER, "DECLINED", reason);
        notifications.notifyStaff("PO_DECLINED", "Supplier declined " + po.getPoNumber(), supplierName(po) + ": " + reason.trim(),
                "PURCHASE_ORDER", po.getId());
        return po;
    }

    // ---------------------------------------------------------------------------------------------------------
    // Revisions, attachments, receipts (read)
    // ---------------------------------------------------------------------------------------------------------

    public List<ProcurementDtos.RevisionResponse> revisions(UUID poId) {
        return jdbc.query("SELECT * FROM purchase_order_revisions WHERE purchase_order_id = :id ORDER BY revision",
                Map.of("id", poId), (rs, i) -> new ProcurementDtos.RevisionResponse(rs.getObject("id", UUID.class), rs.getInt("revision"),
                        rs.getString("actor_type"), rs.getString("actor_name"), rs.getString("action"), rs.getString("note"),
                        rs.getBigDecimal("grand_total"), rs.getTimestamp("created_at").toInstant(), parse(rs.getString("snapshot"))));
    }

    public List<ProcurementDtos.AttachmentResponse> attachments(UUID poId) {
        return jdbc.query("SELECT id, file_name, uploaded_by_type, created_at FROM purchase_order_attachments WHERE purchase_order_id = :id ORDER BY created_at",
                Map.of("id", poId), (rs, i) -> new ProcurementDtos.AttachmentResponse(rs.getObject("id", UUID.class), rs.getString("file_name"),
                        rs.getString("uploaded_by_type"), rs.getTimestamp("created_at").toInstant()));
    }

    @Transactional
    public ProcurementDtos.AttachmentResponse attach(UUID poId, MultipartFile file, Actor actor) {
        StoredFile stored = files.storeDocument(file, "PO_ATTACHMENT");
        UUID id = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO purchase_order_attachments (id, purchase_order_id, file_id, file_name, uploaded_by_type, uploaded_by, created_at)
                VALUES (:id, :po, :f, :n, :t, :by, :now)
                """, new MapSqlParameterSource().addValue("id", id).addValue("po", poId).addValue("f", stored.getId())
                .addValue("n", stored.getOriginalName()).addValue("t", actor.name()).addValue("by", CurrentUser.id()).addValue("now", now));
        return new ProcurementDtos.AttachmentResponse(id, stored.getOriginalName(), actor.name(), now.toInstant());
    }

    public StoredFile attachmentFile(UUID poId, UUID attachmentId) {
        List<UUID> ids = jdbc.queryForList("SELECT file_id FROM purchase_order_attachments WHERE id = :a AND purchase_order_id = :po",
                Map.of("a", attachmentId, "po", poId), UUID.class);
        if (ids.isEmpty()) {
            throw BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Attachment");
        }
        return files.get(ids.getFirst());
    }

    public List<ProcurementDtos.ReceiptResponse> receipts(UUID poId, UUID supplierId) {
        MapSqlParameterSource p = new MapSqlParameterSource();
        StringBuilder sql = new StringBuilder("""
                SELECT g.*, po.po_number, pu.purchase_number FROM goods_receipts g
                JOIN purchase_orders po ON po.id = g.purchase_order_id LEFT JOIN purchases pu ON pu.id = g.purchase_id WHERE 1 = 1
                """);
        if (poId != null) {
            sql.append(" AND g.purchase_order_id = :po");
            p.addValue("po", poId);
        }
        if (supplierId != null) {
            sql.append(" AND g.supplier_id = :s");
            p.addValue("s", supplierId);
        }
        sql.append(" ORDER BY g.created_at DESC LIMIT 200");
        List<ProcurementDtos.ReceiptResponse> list = jdbc.query(sql.toString(), p, (rs, i) -> new ProcurementDtos.ReceiptResponse(
                rs.getObject("id", UUID.class), rs.getString("grn_number"), rs.getObject("purchase_order_id", UUID.class),
                rs.getString("po_number"), rs.getDate("receipt_date").toLocalDate(), rs.getString("supplier_invoice_number"),
                rs.getDate("supplier_invoice_date") == null ? null : rs.getDate("supplier_invoice_date").toLocalDate(),
                rs.getObject("purchase_id", UUID.class), rs.getString("purchase_number"), rs.getBoolean("has_mismatch"),
                rs.getString("notes"), rs.getTimestamp("created_at").toInstant(), new ArrayList<>()));
        for (ProcurementDtos.ReceiptResponse g : list) {
            g.lines().addAll(jdbc.query("""
                    SELECT gl.*, l.description FROM goods_receipt_lines gl JOIN purchase_order_lines l ON l.id = gl.po_line_id
                    WHERE gl.goods_receipt_id = :g ORDER BY l.line_number
                    """, Map.of("g", g.id()), (rs, i) -> new ProcurementDtos.ReceiptLineResponse(rs.getObject("id", UUID.class),
                    rs.getObject("po_line_id", UUID.class), rs.getString("description"), rs.getBigDecimal("received_quantity"),
                    rs.getBigDecimal("damaged_quantity"), rs.getBigDecimal("rate"), rs.getString("batch_number"),
                    rs.getDate("expiry_date") == null ? null : rs.getDate("expiry_date").toLocalDate(),
                    rs.getString("serial_numbers") == null ? List.of() : List.of(rs.getString("serial_numbers").split(",")),
                    rs.getString("mismatch_note"))));
        }
        return list;
    }

    // ---------------------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------------------

    private void applyChanges(PurchaseOrder po, List<LineChange> changes, Actor actor) {
        if (changes == null) {
            return;
        }
        Map<UUID, PurchaseOrderLine> lineMap = po.getLines().stream().collect(Collectors.toMap(PurchaseOrderLine::getId, Function.identity()));
        for (LineChange c : changes) {
            PurchaseOrderLine line = lineMap.get(c.lineId());
            if (line == null) {
                throw BusinessException.validation("lines", "Line " + c.lineId() + " is not part of this order");
            }
            if (line.getStatus() != PurchaseOrderLine.LineStatus.OPEN) {
                throw BusinessException.validation("lines", "Line " + line.getLineNumber() + " is already " + line.getStatus().name().toLowerCase());
            }
            if (c.quantity() != null) {
                line.setQuantity(Money.qty(c.quantity()));
            }
            if (c.rate() != null) {
                line.setRate(Money.of(c.rate()));
            }
            if (c.discountPercent() != null) {
                line.setDiscountPercent(c.discountPercent());
            }
            if (c.taxRate() != null) {
                line.setTaxRate(c.taxRate());
            }
            if (c.availability() != null) {
                line.setAvailability(c.availability());
            }
            if (c.deliveryDate() != null) {
                line.setDeliveryDate(c.deliveryDate());
            }
            if (c.note() != null) {
                line.setLineNote(Validation.trim(c.note()));
            }
            if (c.substituteNote() != null && actor == Actor.SUPPLIER) {
                line.setSubstituteNote(Validation.trim(c.substituteNote()));
            }
        }
    }

    /** Totals over lines that are still part of the deal (not rejected, available, quantity > 0). */
    private void recalculate(PurchaseOrder po) {
        List<PurchaseOrderLine> counted = new ArrayList<>();
        List<TaxCalculator.Line> calc = new ArrayList<>();
        for (PurchaseOrderLine l : po.getLines()) {
            boolean counts = l.getStatus() != PurchaseOrderLine.LineStatus.REJECTED
                    && l.getAvailability() != PurchaseOrderLine.Availability.UNAVAILABLE && l.getQuantity().signum() > 0;
            if (counts) {
                counted.add(l);
                calc.add(new TaxCalculator.Line(l.getQuantity(), l.getRate(), l.getDiscountPercent(), null, l.getTaxRate(), l.getHsnCode()));
            } else {
                l.setTaxableAmount(BigDecimal.ZERO);
                l.setTaxAmount(BigDecimal.ZERO);
                l.setLineTotal(BigDecimal.ZERO);
            }
        }
        if (calc.isEmpty()) {
            po.setSubtotal(BigDecimal.ZERO);
            po.setTaxableTotal(BigDecimal.ZERO);
            po.setTaxTotal(BigDecimal.ZERO);
            po.setGrandTotal(BigDecimal.ZERO);
            return;
        }
        TaxCalculator.Result r;
        try {
            r = calculator.calculate(calc, po.isInterState(), settings.taxSettings().isRoundOffEnabled());
        } catch (IllegalArgumentException e) {
            throw BusinessException.validation("lines", e.getMessage());
        }
        for (int i = 0; i < counted.size(); i++) {
            TaxCalculator.LineResult lr = r.lines().get(i);
            counted.get(i).setTaxableAmount(lr.taxable());
            counted.get(i).setTaxAmount(lr.tax());
            counted.get(i).setLineTotal(lr.total());
        }
        po.setSubtotal(r.subtotal());
        po.setTaxableTotal(r.taxable());
        po.setTaxTotal(r.totalTax());
        po.setGrandTotal(r.grandTotal());
    }

    private void revision(PurchaseOrder po, Actor actor, String action, String note) {
        po.setRevision(po.getRevision() + 1);
        orders.saveAndFlush(po);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("status", po.getStatus().name());
        snapshot.put("expectedDate", po.getExpectedDate() == null ? null : po.getExpectedDate().toString());
        snapshot.put("quoteValidUntil", po.getQuoteValidUntil() == null ? null : po.getQuoteValidUntil().toString());
        snapshot.put("supplierNote", po.getSupplierNote());
        snapshot.put("grandTotal", po.getGrandTotal());
        List<Map<String, Object>> lines = new ArrayList<>();
        for (PurchaseOrderLine l : po.getLines()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("lineId", l.getId());
            m.put("lineNumber", l.getLineNumber());
            m.put("description", l.getDescription());
            m.put("unit", l.getUnit());
            m.put("quantity", l.getQuantity());
            m.put("rate", l.getRate());
            m.put("discountPercent", l.getDiscountPercent());
            m.put("taxRate", l.getTaxRate());
            m.put("lineTotal", l.getLineTotal());
            m.put("availability", l.getAvailability().name());
            m.put("deliveryDate", l.getDeliveryDate() == null ? null : l.getDeliveryDate().toString());
            m.put("note", l.getLineNote());
            m.put("substituteNote", l.getSubstituteNote());
            m.put("addedBy", l.getAddedBy());
            m.put("status", l.getStatus().name());
            lines.add(m);
        }
        snapshot.put("lines", lines);
        String actorName = switch (actor) {
            case SUPPLIER -> supplierName(po);
            case SYSTEM -> "System";
            case BUSINESS -> jdbc.queryForList("SELECT full_name FROM users WHERE id = :id", Map.of("id", CurrentUser.idIfPresent().orElse(new UUID(0, 0))), String.class)
                    .stream().findFirst().orElse(businessContext.displayName());
        };
        jdbc.update("""
                INSERT INTO purchase_order_revisions (id, purchase_order_id, revision, actor_type, actor_user_id, actor_name, action, note, grand_total, snapshot, created_at)
                VALUES (:id, :po, :rev, :type, :uid, :name, :action, :note, :total, :snap, :now)
                """, new MapSqlParameterSource().addValue("id", UUID.randomUUID()).addValue("po", po.getId()).addValue("rev", po.getRevision())
                .addValue("type", actor.name()).addValue("uid", actor == Actor.SYSTEM ? null : CurrentUser.idIfPresent().orElse(null))
                .addValue("name", actorName).addValue("action", action).addValue("note", Validation.trim(note))
                .addValue("total", po.getGrandTotal()).addValue("snap", mapper.writeValueAsString(snapshot))
                .addValue("now", Timestamp.from(Instant.now())));
    }

    /** A quotation whose validity date has passed expires (checked whenever the order is read or acted on). */
    private void expireIfDue(PurchaseOrder po) {
        if ((po.getStatus() == PurchaseOrder.Status.QUOTED) && po.getQuoteValidUntil() != null
                && po.getQuoteValidUntil().isBefore(businessContext.today())) {
            po.setStatus(PurchaseOrder.Status.EXPIRED);
            revision(po, Actor.SYSTEM, "EXPIRED", "Quotation validity ended on " + po.getQuoteValidUntil());
        }
    }

    private PurchaseOrder lock(UUID id) {
        PurchaseOrder po = orders.findByIdForUpdate(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Purchase order"));
        expireIfDue(po);
        return po;
    }

    private static void require(PurchaseOrder po, PurchaseOrder.Status status) {
        if (po.getStatus() != status) {
            throw invalid(po, "The purchase order is " + po.getStatus().name().toLowerCase().replace('_', ' '));
        }
    }

    private static BusinessException invalid(PurchaseOrder po, String message) {
        return new BusinessException(ErrorCode.PURCHASE_INVALID_STATUS, message + " (status " + po.getStatus() + ")");
    }

    private boolean interState(Supplier supplier) {
        return TaxCalculator.isInterState(settings.business().getStateCode(),
                suppliers.address(supplier.getId()).map(SupplierAddress::getStateCode)
                        .orElse(supplier.getGstin() != null ? supplier.getGstin().substring(0, 2) : null));
    }

    private String supplierName(PurchaseOrder po) {
        return suppliers.get(po.getSupplierId()).getName();
    }

    private void notifySupplier(PurchaseOrder po, String type, String title, String body) {
        Supplier s = suppliers.get(po.getSupplierId());
        if (s.getUserId() != null) {
            notifications.notifyUser(s.getUserId(), type, title, body, "PURCHASE_ORDER", po.getId());
        }
    }

    private Object parse(String json) {
        try {
            return mapper.readTree(json);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String plain(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString();
    }
}
