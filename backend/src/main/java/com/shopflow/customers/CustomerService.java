package com.shopflow.customers;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.auth.SessionService;
import com.shopflow.business.BusinessContext;
import com.shopflow.business.BusinessSettings;
import com.shopflow.business.BusinessSettingsService;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.sequence.DocumentSequenceService;
import com.shopflow.common.sequence.DocumentType;
import com.shopflow.common.util.IndianStates;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.common.util.Money;
import com.shopflow.common.util.Validation;
import com.shopflow.customers.Customer.CustomerStatus;
import com.shopflow.customers.CustomerDtos.AddressRequest;
import com.shopflow.customers.CustomerDtos.AddressResponse;
import com.shopflow.customers.CustomerDtos.CreateCustomerRequest;
import com.shopflow.customers.CustomerDtos.CreditProfileRequest;
import com.shopflow.customers.CustomerDtos.CreditProfileResponse;
import com.shopflow.customers.CustomerDtos.CustomerDetail;
import com.shopflow.customers.CustomerDtos.CustomerSummary;
import com.shopflow.customers.CustomerDtos.RegistrationRequest;
import com.shopflow.customers.CustomerDtos.UpdateCustomerRequest;
import com.shopflow.customers.CustomerRepositories.CustomerAddressRepository;
import com.shopflow.customers.CustomerRepositories.CustomerCreditProfileRepository;
import com.shopflow.customers.CustomerRepositories.CustomerLedgerRepository;
import com.shopflow.customers.CustomerRepositories.CustomerRepository;
import com.shopflow.notifications.NotificationService;
import com.shopflow.security.CurrentUser;
import com.shopflow.security.Permissions;
import com.shopflow.security.Roles;
import com.shopflow.users.User;
import com.shopflow.users.UserRepositories.RoleRepository;
import com.shopflow.users.UserRepositories.UserRepository;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class CustomerService {

    private final CustomerRepository customers;
    private final CustomerAddressRepository addresses;
    private final CustomerCreditProfileRepository creditProfiles;
    private final CustomerLedgerRepository ledgerRepository;
    private final CreditService creditService;
    private final UserRepository users;
    private final RoleRepository roles;
    private final DocumentSequenceService sequences;
    private final BusinessContext businessContext;
    private final BusinessSettingsService settings;
    private final SessionService sessions;
    private final NotificationService notifications;
    private final AuditService audit;
    private final NamedParameterJdbcTemplate jdbc;

    private final com.shopflow.saas.PlanLimits limits;

    public CustomerService(CustomerRepository customers, CustomerAddressRepository addresses,
                           CustomerCreditProfileRepository creditProfiles, CustomerLedgerRepository ledgerRepository,
                           CreditService creditService, UserRepository users, RoleRepository roles,
                           DocumentSequenceService sequences, BusinessContext businessContext,
                           BusinessSettingsService settings, SessionService sessions,
                           NotificationService notifications, AuditService audit, NamedParameterJdbcTemplate jdbc, com.shopflow.saas.PlanLimits limits) {
        this.limits = limits;
        this.customers = customers;
        this.addresses = addresses;
        this.creditProfiles = creditProfiles;
        this.ledgerRepository = ledgerRepository;
        this.creditService = creditService;
        this.users = users;
        this.roles = roles;
        this.sequences = sequences;
        this.businessContext = businessContext;
        this.settings = settings;
        this.sessions = sessions;
        this.notifications = notifications;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------- registration

    /** Self-registration after OTP verification. The account starts PENDING_APPROVAL (§4.2). */
    @Transactional
    public Customer register(String verifiedMobile, RegistrationRequest r) {
        limits.check(com.shopflow.saas.PlanLimits.Limit.CUSTOMERS);
        if (users.existsByMobileNumber(verifiedMobile)) {
            throw new BusinessException(ErrorCode.CUSTOMER_ALREADY_REGISTERED, "This mobile number is already registered. Please sign in.");
        }
        enforceIdentityRequirements(r.gstin(), r.pan());
        User user = newCustomerUser(verifiedMobile, r.contactName(), r.email());
        Customer customer = newCustomer(verifiedMobile, r.shopName(), r.contactName(), r.email(), r.gstin(), r.pan(),
                r.alternateMobile(), null, CustomerStatus.PENDING_APPROVAL, user.getId());
        addAddressInternal(customer.getId(), r.address(), true);
        createCreditProfile(customer.getId(), null);
        audit.recordAs(user.getId(), Roles.CUSTOMER, AuditAction.CUSTOMER_REGISTERED, "CUSTOMER", customer.getId(), null,
                Map.of("customerCode", customer.getCustomerCode(), "shopName", customer.getShopName()));
        notifications.notifyStaff("CUSTOMER_REGISTERED", "New customer registration",
                customer.getShopName() + " is waiting for approval", "CUSTOMER", customer.getId());
        return customer;
    }

    /** Staff-created customers are approved immediately and get a login for the mobile number. */
    @Transactional
    public Customer create(CreateCustomerRequest r) {
        limits.check(com.shopflow.saas.PlanLimits.Limit.CUSTOMERS);
        String mobile = MobileNumbers.normalize(r.mobileNumber());
        if (users.existsByMobileNumber(mobile)
                || customers.findByBusinessIdAndMobileNumber(businessContext.businessId(), mobile).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT, "A customer or user with this mobile number already exists");
        }
        enforceIdentityRequirements(r.gstin(), r.pan());
        User user = newCustomerUser(mobile, r.contactName(), r.email());
        Customer customer = newCustomer(mobile, r.shopName(), r.contactName(), r.email(), r.gstin(), r.pan(),
                r.alternateMobile(), r.notes(), CustomerStatus.APPROVED, user.getId());
        customer.setCreatedBy(CurrentUser.id());
        addAddressInternal(customer.getId(), r.address(), true);
        createCreditProfile(customer.getId(), r.credit());
        audit.record(AuditAction.CUSTOMER_CREATED, "CUSTOMER", customer.getId(), null,
                Map.of("customerCode", customer.getCustomerCode(), "shopName", customer.getShopName()));
        return customer;
    }

    private void enforceIdentityRequirements(String gstin, String pan) {
        BusinessSettings s = settings.settings();
        if (s.isGstinRequiredForCustomers() && (gstin == null || gstin.isBlank())) {
            throw BusinessException.validation("gstin", "GSTIN is required");
        }
        if (s.isPanRequiredForCustomers() && (pan == null || pan.isBlank())) {
            throw BusinessException.validation("pan", "PAN is required");
        }
    }

    private User newCustomerUser(String mobile, String name, String email) {
        User user = new User();
        user.setBusinessId(businessContext.businessId());
        user.setMobileNumber(mobile);
        user.setFullName(name.trim());
        user.setEmail(Validation.trim(email));
        user.setStatus(User.UserStatus.ACTIVE);
        user.getRoles().add(roles.findByCode(Roles.CUSTOMER).orElseThrow());
        return users.save(user);
    }

    private Customer newCustomer(String mobile, String shopName, String contactName, String email, String gstin,
                                 String pan, String alternateMobile, String notes, CustomerStatus status, UUID userId) {
        Customer c = new Customer();
        c.setBusinessId(businessContext.businessId());
        c.setUserId(userId);
        c.setCustomerCode(sequences.next(DocumentType.CUSTOMER, businessContext.today()));
        c.setShopName(shopName.trim());
        c.setContactName(contactName.trim());
        c.setMobileNumber(mobile);
        c.setAlternateMobile(MobileNumbers.normalizeOptional(alternateMobile));
        c.setEmail(Validation.trim(email));
        c.setGstin(Validation.upper(gstin));
        c.setPan(Validation.upper(pan));
        c.setNotes(Validation.trim(notes));
        c.setStatus(status);
        c.setStatusChangedAt(Instant.now());
        return customers.save(c);
    }

    private void createCreditProfile(UUID customerId, CreditProfileRequest r) {
        BusinessSettings s = settings.settings();
        CustomerCreditProfile p = new CustomerCreditProfile();
        p.setCustomerId(customerId);
        p.setCreditEnabled(false);
        p.setCreditLimit(s.getDefaultCreditLimit());
        p.setCreditDays(s.getDefaultCreditDays());
        if (r != null) {
            applyCredit(p, r);
        }
        creditProfiles.save(p);
    }

    // ---------------------------------------------------------------- queries

    public Customer get(UUID id) {
        return customers.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.CUSTOMER_NOT_FOUND, "Customer"));
    }

    public java.util.Optional<Customer> findByUserId(UUID userId) {
        return customers.findByUserId(userId);
    }

    /** For customer-facing endpoints: the caller's own customer record, which must be approved. */
    public Customer currentApprovedCustomer() {
        Customer c = get(CurrentUser.customerId());
        requireApproved(c);
        return c;
    }

    public static void requireApproved(Customer c) {
        switch (c.getStatus()) {
            case APPROVED -> { }
            case BLOCKED -> throw new BusinessException(ErrorCode.CUSTOMER_BLOCKED, "This customer account is blocked");
            default -> throw new BusinessException(ErrorCode.CUSTOMER_NOT_APPROVED, "This customer account is not approved yet");
        }
    }

    @Transactional(readOnly = true)
    public Page<CustomerSummary> search(String q, CustomerStatus status, Boolean hasOutstanding, Pageable pageable) {
        Specification<Customer> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("businessId"), businessContext.businessId()));
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("shopName")), like),
                        cb.like(cb.lower(root.get("contactName")), like),
                        cb.like(root.get("mobileNumber"), like),
                        cb.like(cb.lower(root.get("customerCode")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("gstin"), "")), like)));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (hasOutstanding != null) {
                Subquery<BigDecimal> sq = query.subquery(BigDecimal.class);
                var e = sq.from(CustomerLedgerEntry.class);
                sq.select(cb.coalesce(cb.diff(cb.sum(e.<BigDecimal>get("debit")), cb.sum(e.<BigDecimal>get("credit"))), BigDecimal.ZERO))
                        .where(cb.equal(e.get("customerId"), root.get("id")));
                predicates.add(hasOutstanding ? cb.greaterThan(sq, BigDecimal.ZERO) : cb.lessThanOrEqualTo(sq, BigDecimal.ZERO));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        Page<Customer> page = customers.findAll(spec, pageable);
        Map<UUID, Map<String, Object>> aggregates = aggregates(page.getContent().stream().map(Customer::getId).toList());
        List<CustomerSummary> content = page.getContent().stream().map(c -> {
            Map<String, Object> a = aggregates.getOrDefault(c.getId(), Map.of());
            Timestamp last = (Timestamp) a.get("last_txn");
            return new CustomerSummary(c.getId(), c.getCustomerCode(), c.getShopName(), c.getContactName(),
                    c.getMobileNumber(), c.getGstin(), c.getStatus().name(), (String) a.get("city"),
                    Money.of((BigDecimal) a.get("outstanding")), Money.of((BigDecimal) a.get("credit_limit")),
                    a.get("credit_days") == null ? 0 : ((Number) a.get("credit_days")).intValue(),
                    Money.of((BigDecimal) a.get("total_sales")), last == null ? null : last.toInstant(), c.getCreatedAt());
        }).toList();
        return new PageImpl<>(content, pageable, page.getTotalElements());
    }

    private Map<UUID, Map<String, Object>> aggregates(List<UUID> ids) {
        Map<UUID, Map<String, Object>> result = new HashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        jdbc.query("""
                SELECT c.id,
                       COALESCE((SELECT SUM(l.debit) - SUM(l.credit) FROM customer_ledger_entries l WHERE l.customer_id = c.id), 0) AS outstanding,
                       COALESCE((SELECT SUM(i.grand_total) FROM invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('DRAFT','CANCELLED')), 0) AS total_sales,
                       (SELECT MAX(l.created_at) FROM customer_ledger_entries l WHERE l.customer_id = c.id) AS last_txn,
                       (SELECT a.city FROM customer_addresses a WHERE a.customer_id = c.id AND a.active ORDER BY a.is_default DESC, a.created_at LIMIT 1) AS city,
                       cp.credit_limit, cp.credit_days
                FROM customers c LEFT JOIN customer_credit_profiles cp ON cp.customer_id = c.id
                WHERE c.id IN (:ids)
                """, new MapSqlParameterSource("ids", ids), rs -> {
            Map<String, Object> row = new HashMap<>();
            row.put("outstanding", rs.getBigDecimal("outstanding"));
            row.put("total_sales", rs.getBigDecimal("total_sales"));
            row.put("last_txn", rs.getTimestamp("last_txn"));
            row.put("city", rs.getString("city"));
            row.put("credit_limit", rs.getBigDecimal("credit_limit"));
            row.put("credit_days", rs.getObject("credit_days"));
            result.put(rs.getObject("id", UUID.class), row);
        });
        return result;
    }

    @Transactional(readOnly = true)
    public CustomerDetail detail(UUID id) {
        Customer c = get(id);
        return new CustomerDetail(c.getId(), c.getCustomerCode(), c.getShopName(), c.getContactName(),
                c.getMobileNumber(), c.getAlternateMobile(), c.getEmail(), c.getGstin(), c.getPan(), c.getStatus().name(),
                c.getStatusReason(), c.getStatusChangedAt(), CurrentUser.isStaff() ? c.getNotes() : null, c.getUserId() != null,
                listAddresses(id), CreditProfileResponse.of(creditService.profile(id)), creditService.outstanding(id),
                c.getCreatedAt(), c.getUpdatedAt(), CurrentUser.isStaff() ? c.getAgentId() : null);
    }

    public List<AddressResponse> listAddresses(UUID customerId) {
        return addresses.findByCustomerIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(customerId).stream()
                .map(AddressResponse::of).toList();
    }

    public CustomerAddress address(UUID customerId, UUID addressId) {
        return addresses.findByIdAndCustomerId(addressId, customerId)
                .filter(CustomerAddress::isActive)
                .orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Address"));
    }

    public java.util.Optional<CustomerAddress> defaultAddress(UUID customerId) {
        return addresses.findByCustomerIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(customerId).stream().findFirst();
    }

    // ---------------------------------------------------------------- updates

    @Transactional
    public Customer update(UUID id, UpdateCustomerRequest r, boolean selfService) {
        Customer c = get(id);
        Map<String, Object> before = snapshot(c);
        if (r.shopName() != null && !r.shopName().isBlank()) {
            c.setShopName(r.shopName().trim());
        }
        if (r.contactName() != null && !r.contactName().isBlank()) {
            c.setContactName(r.contactName().trim());
        }
        if (r.gstin() != null) {
            c.setGstin(Validation.upper(r.gstin()));
        }
        if (r.pan() != null) {
            c.setPan(Validation.upper(r.pan()));
        }
        if (r.email() != null) {
            c.setEmail(Validation.trim(r.email()));
        }
        if (r.alternateMobile() != null) {
            c.setAlternateMobile(MobileNumbers.normalizeOptional(r.alternateMobile()));
        }
        if (!selfService && r.notes() != null) {
            c.setNotes(Validation.trim(r.notes()));
        }
        enforceIdentityRequirements(c.getGstin(), c.getPan());
        c.setUpdatedBy(CurrentUser.id());
        customers.saveAndFlush(c);
        audit.record(AuditAction.CUSTOMER_UPDATED, "CUSTOMER", id, before, snapshot(c));
        return c;
    }

    @Transactional
    public Customer approve(UUID id, String reason) {
        Customer c = get(id);
        if (c.getStatus() == CustomerStatus.APPROVED) {
            return c;
        }
        CustomerStatus previous = c.getStatus();
        changeStatus(c, CustomerStatus.APPROVED, reason);
        audit.record(AuditAction.CUSTOMER_APPROVED, "CUSTOMER", id, Map.of("status", previous), Map.of("status", c.getStatus()));
        if (c.getUserId() != null) {
            notifications.notifyUser(c.getUserId(), "CUSTOMER_APPROVED", "Your account is approved",
                    "You can now browse products and place orders.", "CUSTOMER", id);
        }
        return c;
    }

    @Transactional
    public Customer reject(UUID id, String reason) {
        Customer c = get(id);
        if (c.getStatus() != CustomerStatus.PENDING_APPROVAL) {
            throw new BusinessException(ErrorCode.CONFLICT, "Only pending registrations can be rejected");
        }
        changeStatus(c, CustomerStatus.REJECTED, reason);
        if (c.getUserId() != null) {
            sessions.revokeAllForUser(c.getUserId(), "CUSTOMER_REJECTED");
        }
        audit.record(AuditAction.CUSTOMER_REJECTED, "CUSTOMER", id, null, Map.of("status", c.getStatus(), "reason", String.valueOf(reason)));
        return c;
    }

    @Transactional
    public Customer block(UUID id, String reason) {
        Customer c = get(id);
        CustomerStatus previous = c.getStatus();
        changeStatus(c, CustomerStatus.BLOCKED, reason);
        if (c.getUserId() != null) {
            sessions.revokeAllForUser(c.getUserId(), "CUSTOMER_BLOCKED");
        }
        audit.record(AuditAction.CUSTOMER_BLOCKED, "CUSTOMER", id, Map.of("status", previous),
                Map.of("status", c.getStatus(), "reason", String.valueOf(reason)));
        return c;
    }

    private void changeStatus(Customer c, CustomerStatus status, String reason) {
        c.setStatus(status);
        c.setStatusReason(Validation.trim(reason));
        c.setStatusChangedAt(Instant.now());
        c.setStatusChangedBy(CurrentUser.id());
        customers.saveAndFlush(c);
    }

    /** Credit-policy overrides (e.g. ALLOW over limit) require CREDIT_OVERRIDE. */
    @Transactional
    public CreditProfileResponse updateCredit(UUID customerId, CreditProfileRequest r) {
        get(customerId);
        CustomerCreditProfile p = creditService.profile(customerId);
        CreditProfileResponse before = CreditProfileResponse.of(p);
        if ((r.creditPolicy() != null || Boolean.TRUE.equals(r.clearCreditPolicy()))
                && !CurrentUser.hasPermission(Permissions.CREDIT_OVERRIDE)) {
            throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, "Changing the credit policy requires CREDIT_OVERRIDE");
        }
        applyCredit(p, r);
        p.setUpdatedBy(CurrentUser.id());
        creditProfiles.saveAndFlush(p);
        CreditProfileResponse after = CreditProfileResponse.of(p);
        audit.record(AuditAction.CUSTOMER_CREDIT_CHANGED, "CUSTOMER", customerId, before, after);
        return after;
    }

    private static void applyCredit(CustomerCreditProfile p, CreditProfileRequest r) {
        if (r.creditEnabled() != null) {
            p.setCreditEnabled(r.creditEnabled());
        }
        if (r.creditLimit() != null) {
            p.setCreditLimit(Money.of(r.creditLimit()));
        }
        if (r.creditDays() != null) {
            p.setCreditDays(r.creditDays());
        }
        if (Boolean.TRUE.equals(r.clearCreditPolicy())) {
            p.setCreditPolicy(null);
        } else if (r.creditPolicy() != null) {
            p.setCreditPolicy(r.creditPolicy());
        }
    }

    @Transactional
    public AddressResponse addAddress(UUID customerId, AddressRequest r) {
        get(customerId);
        boolean first = listAddresses(customerId).isEmpty();
        return AddressResponse.of(addAddressInternal(customerId, r, first || Boolean.TRUE.equals(r.isDefault())));
    }

    @Transactional
    public AddressResponse updateAddress(UUID customerId, UUID addressId, AddressRequest r) {
        CustomerAddress a = address(customerId, addressId);
        fillAddress(a, r);
        if (Boolean.TRUE.equals(r.isDefault()) && !a.isDefaultAddress()) {
            clearDefaultAddress(customerId);
            a.setDefaultAddress(true);
        }
        addresses.saveAndFlush(a);
        return AddressResponse.of(a);
    }

    /** Addresses are deactivated rather than deleted because orders snapshot them. */
    @Transactional
    public void removeAddress(UUID customerId, UUID addressId) {
        CustomerAddress a = address(customerId, addressId);
        a.setActive(false);
        boolean wasDefault = a.isDefaultAddress();
        a.setDefaultAddress(false);
        addresses.saveAndFlush(a);
        if (wasDefault) {
            addresses.findByCustomerIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(customerId).stream().findFirst()
                    .ifPresent(next -> next.setDefaultAddress(true));
        }
    }

    private CustomerAddress addAddressInternal(UUID customerId, AddressRequest r, boolean makeDefault) {
        if (makeDefault) {
            clearDefaultAddress(customerId);
        }
        CustomerAddress a = new CustomerAddress();
        a.setCustomerId(customerId);
        fillAddress(a, r);
        a.setDefaultAddress(makeDefault);
        return addresses.saveAndFlush(a);
    }

    private void clearDefaultAddress(UUID customerId) {
        addresses.findByCustomerIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(customerId).stream()
                .filter(CustomerAddress::isDefaultAddress)
                .forEach(existing -> {
                    existing.setDefaultAddress(false);
                    addresses.saveAndFlush(existing);
                });
    }

    private static void fillAddress(CustomerAddress a, AddressRequest r) {
        a.setLabel(Validation.trim(r.label()));
        a.setAddressLine1(r.addressLine1().trim());
        a.setAddressLine2(Validation.trim(r.addressLine2()));
        a.setCity(r.city().trim());
        a.setState(r.state().trim());
        a.setStateCode(IndianStates.resolve(r.state(), r.stateCode()));
        a.setPincode(r.pincode().trim());
    }

    private static Map<String, Object> snapshot(Customer c) {
        Map<String, Object> m = new HashMap<>();
        m.put("shopName", c.getShopName());
        m.put("contactName", c.getContactName());
        m.put("gstin", c.getGstin());
        m.put("pan", c.getPan());
        m.put("email", c.getEmail());
        m.put("alternateMobile", c.getAlternateMobile());
        m.put("status", c.getStatus());
        return m;
    }

    public long countPending() {
        return customers.countByStatus(CustomerStatus.PENDING_APPROVAL);
    }

    public Page<CustomerLedgerEntry> ledger(UUID customerId, Pageable pageable) {
        return ledgerRepository.findByCustomerId(customerId, pageable);
    }
}
