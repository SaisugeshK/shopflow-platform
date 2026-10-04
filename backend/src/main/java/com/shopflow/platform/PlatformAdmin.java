package com.shopflow.platform;

import com.shopflow.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** A platform operator (SUPER_ADMIN, §0B.5). Not tenant data: the table has no business_id and no RLS. */
@Entity
@Table(name = "platform_admins")
@Getter
@Setter
public class PlatformAdmin extends BaseEntity {

    @Column(nullable = false)
    private String mobileNumber;
    @Column(nullable = false)
    private String fullName;
    @Column(nullable = false)
    private String status = "ACTIVE";
    private Instant lastLoginAt;

    public boolean isActive() {
        return "ACTIVE".equals(status);
    }
}
