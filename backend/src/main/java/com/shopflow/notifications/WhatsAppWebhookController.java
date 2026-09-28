package com.shopflow.notifications;

import com.shopflow.common.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/integrations/whatsapp")
@Tag(name = "Integrations", description = "Provider callbacks")
public class WhatsAppWebhookController {

    private final WhatsAppService service;

    public WhatsAppWebhookController(WhatsAppService service) {
        this.service = service;
    }

    @PostMapping("/webhook")
    @Operation(summary = "WhatsApp delivery-status webhook", description = "Public. Verifies X-Webhook-Signature; duplicate and out-of-order status events are ignored.")
    public ApiResponse<Map<String, Integer>> webhook(@RequestBody String payload,
                                                     @RequestHeader(value = "X-Webhook-Signature", required = false) String signature) {
        return ApiResponse.ok(Map.of("applied", service.handleWebhook(payload, signature)));
    }
}
