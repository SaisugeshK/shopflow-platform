package com.shopflow.users;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepositories {

    interface UserRepository extends JpaRepository<User, UUID> {
        Optional<User> findByMobileNumber(String mobileNumber);

        boolean existsByMobileNumber(String mobileNumber);

        @Query("""
                SELECT DISTINCT u FROM User u JOIN u.roles r
                WHERE r.code IN :roles
                  AND (:q IS NULL OR lower(u.fullName) LIKE lower(concat('%', CAST(:q AS string), '%')) OR u.mobileNumber LIKE concat('%', CAST(:q AS string), '%'))
                  AND (:status IS NULL OR u.status = :status)
                """)
        Page<User> search(@Param("roles") List<String> roles, @Param("q") String q, @Param("status") User.UserStatus status, Pageable pageable);

        @Query("SELECT DISTINCT u FROM User u JOIN u.roles r WHERE r.code IN :roles AND u.status = com.shopflow.users.User.UserStatus.ACTIVE")
        List<User> findActiveByRoles(@Param("roles") List<String> roles);
    }

    interface RoleRepository extends JpaRepository<Role, UUID> {
        Optional<Role> findByCode(String code);
    }

    interface PermissionRepository extends JpaRepository<Permission, UUID> {
        List<Permission> findAllByOrderByCodeAsc();

        List<Permission> findByCodeIn(List<String> codes);
    }
}
