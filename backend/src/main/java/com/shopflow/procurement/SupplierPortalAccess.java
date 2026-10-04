package com.shopflow.procurement;

import com.shopflow.audit.AuditAction;
import com.shopflow.audit.AuditService;
import com.shopflow.auth.SessionService;
import com.shopflow.business.BusinessContext;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.procurement.ProcurementDtos.PortalAccessResponse;
import com.shopflow.security.CurrentUser;
import com.shopflow.security.Roles;
import com.shopflow.suppliers.Supplier;
import com.shopflow.suppliers.SupplierRepositories.SupplierRepository;
import com.shopflow.tenancy.ModuleCode;
import com.shopflow.tenancy.TenantModules;
import com.shopflow.users.User;
import com.shopflow.users.UserRepositories.RoleRepository;
import com.shopflow.users.UserRepositories.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Invites a supplier to the supplier portal (§0B.4/§0B.8): a SUPPLIER login (users row) in this tenant for the
 * supplier's mobile number, linked to the supplier record. The same mobile may be a supplier of other businesses too.
 */
@Service
public class SupplierPortalAccess {

    private final SupplierRepository suppliers;
    private final UserRepository users;
    private final RoleRepository roles;
    private final SessionService sessions;
    private final TenantModules modules;
    private final BusinessContext businessContext;
    private final AuditService audit;

    public SupplierPortalAccess(SupplierRepository suppliers, UserRepository users, RoleRepository roles, SessionService sessions,
                                TenantModules modules, BusinessContext businessContext, AuditService audit) {
        this.suppliers = suppliers;
        this.users = users;
        this.roles = roles;
        this.sessions = sessions;
        this.modules = modules;
        this.businessContext = businessContext;
        this.audit = audit;
    }

    public PortalAccessResponse status(UUID supplierId) {
        Supplier s = supplier(supplierId);
        if (s.getUserId() == null) {
            return new PortalAccessResponse(s.getId(), false, null, null, null);
        }
        User u = users.findById(s.getUserId()).orElse(null);
        return u == null ? new PortalAccessResponse(s.getId(), false, null, null, null)
                : new PortalAccessResponse(s.getId(), u.getStatus() == User.UserStatus.ACTIVE, u.getMobileNumber(), u.getStatus().name(), u.getLastLoginAt());
    }

    @Transactional
    public PortalAccessResponse enable(UUID supplierId, String rawMobile, String contactName) {
        modules.require(ModuleCode.SUPPLIER_PORTAL);
        Supplier s = suppliers.findByIdForUpdate(supplierId).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Supplier"));
        if (!s.isActive()) {
            throw BusinessException.validation("supplierId", "Supplier is inactive");
        }
        String mobile = MobileNumbers.normalize(rawMobile != null && !rawMobile.isBlank() ? rawMobile : s.getMobileNumber());
        if (s.getUserId() != null) {
            User existing = users.findById(s.getUserId()).orElseThrow();
            if (!existing.getMobileNumber().equals(mobile)) {
                throw new BusinessException(ErrorCode.CONFLICT, "This supplier already has a portal login on " + MobileNumbers.mask(existing.getMobileNumber())
                        + "; turn it off first to change the number");
            }
            existing.setStatus(User.UserStatus.ACTIVE);
            audit.record(AuditAction.SUPPLIER_UPDATED, "SUPPLIER", s.getId(), null, Map.of("portal", "re-enabled"));
            return status(supplierId);
        }
        users.findByMobileNumber(mobile).ifPresent(u -> {
            throw new BusinessException(ErrorCode.CONFLICT, "This mobile number already has a "
                    + (u.primaryRole() == null ? "" : u.primaryRole().toLowerCase() + " ") + "login in your business; use another number");
        });
        User u = new User();
        u.setBusinessId(businessContext.businessId());
        u.setMobileNumber(mobile);
        u.setFullName(contactName != null && !contactName.isBlank() ? contactName.trim()
                : s.getContactPerson() != null && !s.getContactPerson().isBlank() ? s.getContactPerson() : s.getName());
        u.setEmail(s.getEmail());
        u.setStatus(User.UserStatus.ACTIVE);
        u.setCreatedBy(CurrentUser.id());
        u.getRoles().add(roles.findByCode(Roles.SUPPLIER).orElseThrow());
        users.saveAndFlush(u);
        s.setUserId(u.getId());
        audit.record(AuditAction.SUPPLIER_UPDATED, "SUPPLIER", s.getId(), null, Map.of("portal", "enabled", "mobile", MobileNumbers.mask(mobile)));
        return status(supplierId);
    }

    @Transactional
    public PortalAccessResponse disable(UUID supplierId) {
        Supplier s = supplier(supplierId);
        if (s.getUserId() != null) {
            users.findById(s.getUserId()).ifPresent(u -> {
                u.setStatus(User.UserStatus.INACTIVE);
                sessions.revokeAllForUser(u.getId(), "SUPPLIER_PORTAL_DISABLED");
            });
            audit.record(AuditAction.SUPPLIER_UPDATED, "SUPPLIER", s.getId(), null, Map.of("portal", "disabled"));
        }
        return status(supplierId);
    }

    private Supplier supplier(UUID id) {
        return suppliers.findById(id).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Supplier"));
    }
}
