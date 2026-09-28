package com.shopflow.common.error;

import com.shopflow.common.api.ApiResponse.FieldIssue;

import java.util.List;

public class BusinessException extends RuntimeException {

    private final ErrorCode code;
    private final List<FieldIssue> details;

    public BusinessException(ErrorCode code, String message) {
        this(code, message, List.of());
    }

    public BusinessException(ErrorCode code, String message, List<FieldIssue> details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public ErrorCode code() {
        return code;
    }

    public List<FieldIssue> details() {
        return details;
    }

    public static BusinessException notFound(ErrorCode code, String what) {
        return new BusinessException(code, what + " not found");
    }

    public static BusinessException validation(String field, String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, message, List.of(new FieldIssue(field, message)));
    }
}
