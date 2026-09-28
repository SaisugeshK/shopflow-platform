package com.shopflow.users;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.api.PageQuery;
import com.shopflow.users.UserDtos.CreateStaffUserRequest;
import com.shopflow.users.UserDtos.PermissionResponse;
import com.shopflow.users.UserDtos.SetPermissionsRequest;
import com.shopflow.users.UserDtos.UpdateStaffUserRequest;
import com.shopflow.users.UserDtos.UserResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Users", description = "Owner/Admin staff accounts and permissions")
@SecurityRequirement(name = "bearerAuth")
@PreAuthorize("hasAuthority('USER_MANAGE')")
public class UserController {

    private final UserService service;

    public UserController(UserService service) {
        this.service = service;
    }

    @GetMapping("/users")
    @Operation(summary = "List staff users", description = "Owner and Admin accounts. Requires USER_MANAGE.")
    public ApiResponse<List<UserResponse>> list(@RequestParam(required = false) String q,
                                                @RequestParam(required = false) User.UserStatus status,
                                                @RequestParam(required = false) Integer page,
                                                @RequestParam(required = false) Integer pageSize,
                                                @RequestParam(required = false) String sort) {
        var pageable = PageQuery.of(page, pageSize, sort, PageQuery.fields("fullName", "createdAt", "lastLoginAt"),
                Sort.by("fullName"));
        return ApiResponse.page(service.searchStaff(q, status, pageable), this::toResponse);
    }

    @GetMapping("/users/{id}")
    @Operation(summary = "Get a staff user")
    public ApiResponse<UserResponse> get(@PathVariable UUID id) {
        return ApiResponse.ok(toResponse(service.get(id)));
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create an Admin user", description = "Owner accounts cannot be created through the API.")
    public ApiResponse<UserResponse> create(@Valid @RequestBody CreateStaffUserRequest request) {
        return ApiResponse.ok(toResponse(service.createAdmin(request)), "Admin user created");
    }

    @PatchMapping("/users/{id}")
    @Operation(summary = "Update a staff user")
    public ApiResponse<UserResponse> update(@PathVariable UUID id, @Valid @RequestBody UpdateStaffUserRequest request) {
        return ApiResponse.ok(toResponse(service.updateStaff(id, request)));
    }

    @PostMapping("/users/{id}/activate")
    @Operation(summary = "Activate a staff user")
    public ApiResponse<UserResponse> activate(@PathVariable UUID id) {
        return ApiResponse.ok(toResponse(service.setActive(id, true)));
    }

    @PostMapping("/users/{id}/deactivate")
    @Operation(summary = "Deactivate a staff user", description = "Revokes all of the user's sessions immediately.")
    public ApiResponse<UserResponse> deactivate(@PathVariable UUID id) {
        return ApiResponse.ok(toResponse(service.setActive(id, false)));
    }

    @PutMapping("/users/{id}/permissions")
    @Operation(summary = "Replace a user's extra permissions", description = "Grants on top of the role's permissions. Takes effect on the user's next token refresh.")
    public ApiResponse<List<String>> setPermissions(@PathVariable UUID id, @Valid @RequestBody SetPermissionsRequest request) {
        return ApiResponse.ok(service.setExtraPermissions(id, request.permissions()));
    }

    @GetMapping("/permissions")
    @Operation(summary = "List all permission codes")
    public ApiResponse<List<PermissionResponse>> permissions() {
        return ApiResponse.ok(service.allPermissions().stream()
                .map(p -> new PermissionResponse(p.getCode(), p.getDescription())).toList());
    }

    private UserResponse toResponse(User u) {
        return new UserResponse(u.getId(), u.getMobileNumber(), u.getFullName(), u.getEmail(), u.primaryRole(),
                u.getStatus().name(), service.extraPermissions(u.getId()), List.copyOf(service.effectivePermissions(u)),
                u.getLastLoginAt(), u.getCreatedAt());
    }
}
