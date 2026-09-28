package com.shopflow.users;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
public class User extends BaseEntity {

    @Column(nullable = false)
    private UUID businessId;
    @Column(nullable = false)
    private String mobileNumber;
    @Column(nullable = false)
    private String fullName;
    private String email;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status = UserStatus.ACTIVE;
    private Instant lastLoginAt;
    private UUID createdBy;
    private UUID updatedBy;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"), inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();

    /** Each account has exactly one role in this release; the join table allows more later. */
    public String primaryRole() {
        return roles.stream().map(Role::getCode).findFirst().orElse(null);
    }

    public boolean hasRole(String code) {
        return roles.stream().anyMatch(r -> r.getCode().equals(code));
    }

    public enum UserStatus { ACTIVE, INACTIVE, BLOCKED }
}
