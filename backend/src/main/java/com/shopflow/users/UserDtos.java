package com.shopflow.users;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class UserDtos {

    private UserDtos() {
    }

    public record CreateStaffUserRequest(
            @NotBlank String mobileNumber,
            @NotBlank @Size(max = 200) String fullName,
            @Email @Size(max = 200) String email,
            List<String> extraPermissions) {
    }

    public record UpdateStaffUserRequest(
            @Size(max = 200) String fullName,
            @Email @Size(max = 200) String email) {
    }

    public record SetPermissionsRequest(@NotNull List<String> permissions) {
    }

    public record UserResponse(UUID id, String mobileNumber, String fullName, String email, String role, String status,
                               List<String> extraPermissions, List<String> effectivePermissions, Instant lastLoginAt,
                               Instant createdAt) {
    }

    public record PermissionResponse(String code, String description) {
    }
}
