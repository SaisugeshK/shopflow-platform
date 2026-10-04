package com.shopflow.tenancy;

import com.shopflow.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Rejects API calls into a module the tenant does not have with 403 MODULE_DISABLED (§0B.6). Coarse URL rules live
 * here; finer rules (e.g. credit sales, product options) are checked in the services.
 */
@Configuration(proxyBeanMethods = false)
public class ModuleGuard implements WebMvcConfigurer {

    private record Rule(Pattern path, ModuleCode module) {
    }

    private static final List<Rule> RULES = List.of(
            new Rule(Pattern.compile("^/api/v1/(cart|catalog)(/.*)?$"), ModuleCode.CUSTOMER_PORTAL),
            new Rule(Pattern.compile("^/api/v1/(sales-returns|purchase-returns)(/.*)?$"), ModuleCode.RETURNS),
            new Rule(Pattern.compile("^/api/v1/invoices/[^/]+/(send-whatsapp|whatsapp-messages)$"), ModuleCode.WHATSAPP),
            new Rule(Pattern.compile("^/api/v1/invoices/whatsapp-messages/.*$"), ModuleCode.WHATSAPP),
            new Rule(Pattern.compile("^/api/v1/orders/[^/]+/payment-intent$"), ModuleCode.ONLINE_PAYMENTS),
            new Rule(Pattern.compile("^/api/v1/purchase-orders(/.*)?$"), ModuleCode.PURCHASE_ORDERS),
            new Rule(Pattern.compile("^/api/v1/goods-receipts(/.*)?$"), ModuleCode.PURCHASE_ORDERS),
            new Rule(Pattern.compile("^/api/v1/supplier-portal(/.*)?$"), ModuleCode.SUPPLIER_PORTAL),
            new Rule(Pattern.compile("^/api/v1/quotations(/.*)?$"), ModuleCode.QUOTATIONS),
            new Rule(Pattern.compile("^/api/v1/delivery-challans(/.*)?$"), ModuleCode.DELIVERY_CHALLAN),
            new Rule(Pattern.compile("^/api/v1/daily-rates(/.*)?$"), ModuleCode.DAILY_RATES),
            new Rule(Pattern.compile("^/api/v1/schemes(/.*)?$"), ModuleCode.SCHEMES),
            new Rule(Pattern.compile("^/api/v1/job-work(/.*)?$"), ModuleCode.JOB_WORK),
            new Rule(Pattern.compile("^/api/v1/projects(/.*)?$"), ModuleCode.PROJECT_ACCOUNTS),
            new Rule(Pattern.compile("^/api/v1/commissions(/.*)?$"), ModuleCode.COMMISSION),
            new Rule(Pattern.compile("^/api/v1/invoices/[^/]+/eway-bill$"), ModuleCode.EWAY_BILL),
            new Rule(Pattern.compile("^/api/v1/my/quotations(/.*)?$"), ModuleCode.QUOTATIONS),
            new Rule(Pattern.compile("^/api/v1/my/projects(/.*)?$"), ModuleCode.PROJECT_ACCOUNTS),
            new Rule(Pattern.compile("^/api/v1/(branches|stock-transfers)(/.*)?$"), ModuleCode.BRANCHES),
            new Rule(Pattern.compile("^/api/v1/serials(/.*)?$"), ModuleCode.SERIAL_NUMBERS),
            new Rule(Pattern.compile("^/api/v1/batches(/.*)?$"), ModuleCode.BATCH_EXPIRY),
            new Rule(Pattern.compile("^/api/v1/labels(/.*)?$"), ModuleCode.BARCODE_LABELS));

    private final TenantModules modules;

    public ModuleGuard(TenantModules modules) {
        this.modules = modules;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                if (TenantContext.tenantId().isEmpty() || CurrentUser.isPlatform()) {
                    return true;
                }
                String uri = request.getRequestURI();
                if (!uri.startsWith("/api/v1/auth/")) {
                    // A customer/supplier of a tenant without that portal cannot use the app (sign-out still works).
                    if (CurrentUser.isCustomer()) {
                        modules.require(ModuleCode.CUSTOMER_PORTAL);
                    }
                    if (CurrentUser.isSupplier()) {
                        modules.require(ModuleCode.SUPPLIER_PORTAL);
                    }
                }
                for (Rule rule : RULES) {
                    if (rule.path().matcher(uri).matches()) {
                        modules.require(rule.module());
                    }
                }
                return true;
            }
        }).addPathPatterns("/api/**");
    }
}
