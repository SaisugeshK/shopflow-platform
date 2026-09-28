package com.shopflow.common.web;

import org.slf4j.MDC;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Access to per-request metadata (request id, client IP, user agent) outside the web layer.
 */
public final class RequestContext {

    public static final String REQUEST_ID_HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";

    private RequestContext() {
    }

    public static String requestId() {
        return MDC.get(MDC_KEY);
    }

    public static String clientIp() {
        HttpServletRequest request = current();
        return request == null ? null : request.getRemoteAddr();
    }

    public static String userAgent() {
        HttpServletRequest request = current();
        if (request == null) {
            return null;
        }
        String ua = request.getHeader("User-Agent");
        return ua == null ? null : ua.substring(0, Math.min(ua.length(), 300));
    }

    private static HttpServletRequest current() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            return attrs.getRequest();
        }
        return null;
    }
}
