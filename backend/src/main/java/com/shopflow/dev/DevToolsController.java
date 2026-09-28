package com.shopflow.dev;

import com.shopflow.common.api.ApiResponse;
import com.shopflow.common.error.BusinessException;
import com.shopflow.common.error.ErrorCode;
import com.shopflow.common.util.MobileNumbers;
import com.shopflow.integrations.otp.MockOtpProvider;
import com.shopflow.integrations.payment.MockPaymentGateway;
import com.shopflow.integrations.whatsapp.MockWhatsAppProvider;
import com.shopflow.notifications.WhatsAppMessage;
import com.shopflow.notifications.WhatsAppService;
import com.shopflow.payments.Payment;
import com.shopflow.payments.PaymentRepositories.PaymentRepository;
import com.shopflow.payments.PaymentWebhookService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * DEVELOPMENT/TEST ONLY helpers for the mock providers (§0A "expose test status in development tools"). The bean
 * exists only when app.dev-tools.enabled=true, which the prod profile forces off.
 */
@RestController
@RequestMapping("/api/v1/dev")
@ConditionalOnProperty(name = "app.dev-tools.enabled", havingValue = "true")
@Tag(name = "Dev Tools", description = "Development-only helpers for mock OTP, payment and WhatsApp providers")
public class DevToolsController {

    private final MockOtpProvider otp;
    private final MockPaymentGateway gateway;
    private final PaymentWebhookService paymentWebhooks;
    private final PaymentRepository payments;
    private final MockWhatsAppProvider whatsApp;
    private final WhatsAppService whatsAppService;
    private final WhatsAppService.WhatsAppMessageRepository messages;

    public DevToolsController(MockOtpProvider otp, MockPaymentGateway gateway, PaymentWebhookService paymentWebhooks,
                              PaymentRepository payments, MockWhatsAppProvider whatsApp, WhatsAppService whatsAppService,
                              WhatsAppService.WhatsAppMessageRepository messages) {
        this.otp = otp;
        this.gateway = gateway;
        this.paymentWebhooks = paymentWebhooks;
        this.payments = payments;
        this.whatsApp = whatsApp;
        this.whatsAppService = whatsAppService;
        this.messages = messages;
    }

    @GetMapping("/otp/latest")
    @Operation(summary = "Latest mock OTP for a mobile number (development only)")
    public ApiResponse<Map<String, String>> latestOtp(@RequestParam String mobileNumber) {
        String mobile = MobileNumbers.normalize(mobileNumber);
        String code = otp.latestFor(mobile).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "OTP"));
        return ApiResponse.ok(Map.of("mobileNumber", mobile, "otp", code));
    }

    @PostMapping("/payments/{paymentId}/simulate")
    @Operation(summary = "Simulate the mock payment checkout outcome", description = "Outcomes: SUCCESS, FAILED, PENDING, CANCELLED, TIMEOUT, DUPLICATE_WEBHOOK, OUT_OF_ORDER, "
            + "INVALID_SIGNATURE, PARTIAL. Signed webhooks go through the same verification pipeline as a real provider.")
    public ApiResponse<SimulationResult> simulatePayment(@PathVariable UUID paymentId, @RequestBody SimulateRequest request) {
        Payment p = payments.findById(paymentId).orElseThrow(() -> BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment"));
        if (p.getProviderOrderId() == null) {
            throw BusinessException.validation("paymentId", "Not an online payment");
        }
        String providerPaymentId = gateway.paymentIdFor(p.getProviderOrderId());
        List<String> results = new ArrayList<>();
        for (MockPaymentGateway.SignedEvent event : gateway.simulate(p.getProviderOrderId(), p.getAmount(), request.outcome())) {
            try {
                results.add(paymentWebhooks.handle(MockPaymentGateway.NAME, event.payload(), event.signature()));
            } catch (BusinessException e) {
                results.add(e.code().name());
            }
        }
        return ApiResponse.ok(new SimulationResult(providerPaymentId, gateway.clientSignature(p.getProviderOrderId(), providerPaymentId), results));
    }

    @PostMapping("/whatsapp/{messageId}/status")
    @Operation(summary = "Simulate a WhatsApp delivery-status callback", description = "status: DELIVERED, READ or FAILED.")
    public ApiResponse<Map<String, Integer>> whatsAppStatus(@PathVariable UUID messageId, @RequestBody WhatsAppStatusRequest request) {
        WhatsAppMessage m = messages.findById(messageId).orElseThrow(() -> BusinessException.notFound(ErrorCode.RESOURCE_NOT_FOUND, "Message"));
        if (m.getProviderMessageId() == null) {
            throw BusinessException.validation("messageId", "Message has not been sent yet");
        }
        String[] hook = whatsApp.statusWebhook(m.getProviderMessageId(), request.status(), request.error());
        return ApiResponse.ok(Map.of("applied", whatsAppService.handleWebhook(hook[0], hook[1])));
    }

    public record SimulateRequest(@NotNull MockPaymentGateway.Outcome outcome) {
    }

    public record SimulationResult(String providerPaymentId, String clientSignature, List<String> webhookResults) {
    }

    public record WhatsAppStatusRequest(@NotNull String status, String error) {
    }
}
