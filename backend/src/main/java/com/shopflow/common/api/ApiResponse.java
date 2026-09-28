package com.shopflow.common.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.shopflow.common.web.RequestContext;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * Standard response envelope (APPLICATION-ARCHITECTURE.md §50).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(
        boolean success,
        T data,
        String message,
        Pagination pagination,
        ApiError error,
        String requestId) {

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, "Success", null, null, RequestContext.requestId());
    }

    public static <T> ApiResponse<T> ok(T data, String message) {
        return new ApiResponse<>(true, data, message, null, null, RequestContext.requestId());
    }

    public static <E, T> ApiResponse<List<T>> page(Page<E> page, Function<E, T> mapper) {
        List<T> items = page.getContent().stream().map(mapper).toList();
        return new ApiResponse<>(true, items, null, Pagination.of(page), null, RequestContext.requestId());
    }

    public static <T> ApiResponse<List<T>> page(Page<T> page) {
        return new ApiResponse<>(true, page.getContent(), null, Pagination.of(page), null, RequestContext.requestId());
    }

    public static ApiResponse<Void> failure(ApiError error) {
        return new ApiResponse<>(false, null, null, null, error, RequestContext.requestId());
    }

    public record Pagination(int page, int pageSize, long totalItems, int totalPages) {
        static Pagination of(Page<?> page) {
            return new Pagination(page.getNumber() + 1, page.getSize(), page.getTotalElements(), page.getTotalPages());
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ApiError(String code, String message, List<FieldIssue> details) {
    }

    public record FieldIssue(String field, String message) {
    }
}
