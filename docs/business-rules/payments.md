# Payments

Implementation: `backend/src/main/java/com/shopflow/payments/` (`PaymentService`, `PaymentWebhookService`),
gateway boundary `integrations/payment/PaymentGateway`.

## Manual payments (cash, UPI, bank transfer, other)

`POST /payments` (PAYMENT_WRITE, `Idempotency-Key` supported). Status `CAPTURED` immediately. Ledger credit, then
allocation: to the given invoice (amount ≤ its outstanding) or FIFO to the oldest open invoices; the rest is customer
credit. A receipt is issued (`GET /payments/{id}/receipt`, PDF).

* **Cancel** (entry made in error, manual payments only): reverses allocations and posts a `PAYMENT_REVERSAL`.
* **Refund**: full or partial; online payments are refunded through the gateway; allocations are released as needed.

## Online payments (§96, §110)

1. Checkout (or `POST /orders/{id}/payment-intent`) creates a provider order and a payment row `UNPAID`.
2. The client completes checkout with the provider and may call `POST /payments/{id}/verify` with the provider's
   signature; this only moves the payment to `PENDING` — **a client response never captures a payment**.
3. The provider webhook `POST /payments/webhooks/{provider}` (header `X-Webhook-Signature`) is verified, stored raw in
   `payment_gateway_events`, de-duplicated by event id, and applied in one transaction. `payment.captured` → ledger
   credit, allocation to the order's invoice if one exists (else held and applied at invoicing), order status refresh.
4. Invalid signatures are stored as `REJECTED` and answered with 400. Duplicate events return `DUPLICATE`.
   Out-of-order events (e.g. `authorized` after `captured`) are ignored. Captured amounts lower than expected are
   recorded as `PARTIALLY_PAID`.

Development uses the mock gateway; `POST /api/v1/dev/payments/{id}/simulate {outcome}` produces the provider's signed
events. Production (Stage 3) plugs a Razorpay adapter into the same interface — no secrets ever reach the clients.
