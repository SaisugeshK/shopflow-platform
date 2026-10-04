package com.shopflow.branches;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/** Copies the {@code X-Branch-Id} header into {@link BranchContext} for the request and always clears it afterwards. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class BranchHeaderFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Branch-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        BranchContext.clear();
        String raw = request.getHeader(HEADER);
        if (raw != null && !raw.isBlank()) {
            try {
                BranchContext.set(UUID.fromString(raw.trim()));
            } catch (IllegalArgumentException ignored) {
                // A malformed header is treated as "no branch chosen" (the default branch).
            }
        }
        try {
            chain.doFilter(request, response);
        } finally {
            BranchContext.clear();
        }
    }
}
