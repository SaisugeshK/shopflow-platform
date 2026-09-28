package com.shopflow.suppliers;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.IndianStates;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.security.CurrentUser;
import com.shopflow.suppliers.SupplierDtos.SupplierAddressDto;
import com.shopflow.suppliers.SupplierDtos.SupplierRequest;
import com.shopflow.suppliers.SupplierDtos.SupplierResponse;
import com.shopflow.suppliers.SupplierLedgerEntry.EntryType;
import com.shopflow.suppliers.SupplierRepositories.SupplierAddressRepository;
import com.shopflow.suppliers.SupplierRepositories.SupplierLedgerRepository;
import com.shopflow.suppliers.SupplierRepositories.SupplierRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class SupplierService {

    private final SupplierRepository suppliers;
    private final SupplierAddressRepository addresses;
    private final SupplierLedgerRepository ledger;
    private final DocumentSequenceService sequences;
    private final BusinessContext businessContext;
    private final AuditService audit;

    public SupplierService(SupplierRepository suppliers, SupplierAddressRepository addresses, SupplierLedgerRepository ledger,
                           DocumentSequenceService sequences, BusinessContext businessContext, AuditService audit) {
        this.suppliers = suppliers;
        this.addresses = addresses;
        this.ledger = ledger;
        this.sequences = sequences;
        this.businessContext = businessContext;
        this.audit = audit;
    }

    public Supplier get(UUID id) {
        return suppliers.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Supplier"));
    }

    public java.util.Optional<SupplierAddress> address(UUID supplierId) {
        return addresses.findFirstBySupplierIdOrderByDefaultAddressDescCreatedAtAsc(supplierId);
    }

    public Page<Supplier> search(String q, Boolean active, Pageable pageable) {
        Specification<Supplier> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                p.add(cb.or(cb.like(cb.lower(root.get("name")), like), cb.like(cb.lower(root.get("supplierCode")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("gstin"), "")), like),
                        cb.like(cb.coalesce(root.get("mobileNumber"), ""), like)));
            }
            if (active != null) {
                p.add(cb.equal(root.get("active"), active));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return suppliers.findAll(spec, pageable);
    }

    @Transactional
    public Supplier create(SupplierRequest r) {
        if (r.name() == null || r.name().isBlank()) {
            throw BusinessException.validation("name", "Supplier name is required");
        }
        Supplier s = new Supplier();
        s.setBusinessId(businessContext.businessId());
        s.setSupplierCode(sequences.next(DocumentType.SUPPLIER, businessContext.today()));
        apply(s, r);
        s.setCreatedBy(CurrentUser.id());
        suppliers.saveAndFlush(s);
        if (r.address() != null) {
            SupplierAddress a = new SupplierAddress();
            a.setSupplierId(s.getId());
            fill(a, r.address());
            addresses.save(a);
        }
        audit.record(AuditAction.SUPPLIER_CREATED, "SUPPLIER", s.getId(), null, Map.of("code", s.getSupplierCode(), "name", s.getName()));
        return s;
    }

    @Transactional
    public Supplier update(UUID id, SupplierRequest r) {
        Supplier s = get(id);
        Map<String, Object> before = Map.of("name", s.getName(), "gstin", String.valueOf(s.getGstin()), "active", s.isActive());
        apply(s, r);
        s.setUpdatedBy(CurrentUser.id());
        suppliers.saveAndFlush(s);
        if (r.address() != null) {
            SupplierAddress a = address(id).orElseGet(() -> {
                SupplierAddress n = new SupplierAddress();
                n.setSupplierId(id);
                return n;
            });
            fill(a, r.address());
            addresses.save(a);
        }
        audit.record(AuditAction.SUPPLIER_UPDATED, "SUPPLIER", id, before,
                Map.of("name", s.getName(), "gstin", String.valueOf(s.getGstin()), "active", s.isActive()));
        return s;
    }

    private static void apply(Supplier s, SupplierRequest r) {
        if (r.name() != null && !r.name().isBlank()) {
            s.setName(r.name().trim());
        }
        if (r.contactPerson() != null) {
            s.setContactPerson(Validation.trim(r.contactPerson()));
        }
        if (r.mobileNumber() != null) {
            s.setMobileNumber(MobileNumbers.normalizeOptional(r.mobileNumber()));
        }
        if (r.email() != null) {
            s.setEmail(Validation.trim(r.email()));
        }
        if (r.gstin() != null) {
            s.setGstin(Validation.upper(r.gstin()));
        }
        if (r.pan() != null) {
            s.setPan(Validation.upper(r.pan()));
        }
        if (r.paymentTerms() != null) {
            s.setPaymentTerms(Validation.trim(r.paymentTerms()));
        }
        if (r.creditDays() != null) {
            s.setCreditDays(r.creditDays());
        }
        if (r.active() != null) {
            s.setActive(r.active());
        }
    }

    private static void fill(SupplierAddress a, SupplierAddressDto d) {
        a.setAddressLine1(d.addressLine1().trim());
        a.setAddressLine2(Validation.trim(d.addressLine2()));
        a.setCity(d.city().trim());
        a.setState(d.state().trim());
        a.setStateCode(IndianStates.resolve(d.state(), d.stateCode()));
        a.setPincode(d.pincode().trim());
    }

    // ---------------------------------------------------------------- ledger

    /** Business owes the supplier more (purchase posted). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void credit(UUID supplierId, EntryType type, String refType, UUID refId, String refNumber, BigDecimal amount, String narration) {
        post(supplierId, type, refType, refId, refNumber, Money.ZERO, Money.of(amount), narration);
    }

    /** Business owes the supplier less (payment, return, cancellation). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void debit(UUID supplierId, EntryType type, String refType, UUID refId, String refNumber, BigDecimal amount, String narration) {
        post(supplierId, type, refType, refId, refNumber, Money.of(amount), Money.ZERO, narration);
    }

    private void post(UUID supplierId, EntryType type, String refType, UUID refId, String refNumber, BigDecimal debit,
                      BigDecimal credit, String narration) {
        suppliers.findByIdForUpdate(supplierId).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Supplier"));
        BigDecimal balance = Money.of(ledger.balance(supplierId)).add(credit).subtract(debit);
        ledger.save(new SupplierLedgerEntry(supplierId, businessContext.today(), type, refType, refId, refNumber, debit,
                credit, balance, narration, CurrentUser.idIfPresent().orElse(null)));
    }

    public BigDecimal balance(UUID supplierId) {
        return Money.of(ledger.balance(supplierId));
    }

    public Page<SupplierLedgerEntry> ledger(UUID supplierId, Pageable pageable) {
        return ledger.findBySupplierId(supplierId, pageable);
    }

    public SupplierResponse toResponse(Supplier s) {
        SupplierAddressDto address = address(s.getId()).map(a -> new SupplierAddressDto(a.getAddressLine1(),
                a.getAddressLine2(), a.getCity(), a.getState(), a.getStateCode(), a.getPincode())).orElse(null);
        return new SupplierResponse(s.getId(), s.getSupplierCode(), s.getName(), s.getContactPerson(), s.getMobileNumber(),
                s.getEmail(), s.getGstin(), s.getPan(), s.getPaymentTerms(), s.getCreditDays(), s.isActive(), address,
                balance(s.getId()), s.getCreatedAt());
    }
}
