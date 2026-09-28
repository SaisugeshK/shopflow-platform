# Orders

Implementation: `backend/src/main/java/com/shopflow/orders/` (`OrderService`, `OrderStatus`, `CartService`).

## States (§7.2)

| From | Allowed next | Action / endpoint | Who |
|---|---|---|---|
| PLACED | ACCEPTED | `POST /orders/{id}/accept` (optional accepted qty per line) | ORDER_WRITE |
| PLACED | REJECTED | `POST /orders/{id}/reject` (reason) | ORDER_WRITE |
| PLACED, ACCEPTED | CANCELLED | `POST /orders/{id}/cancel` (reason) | customer (per setting) or ORDER_WRITE |
| PACKING, READY_FOR_DELIVERY, OUT_FOR_DELIVERY | CANCELLED | `POST /orders/{id}/cancel` | ORDER_WRITE |
| ACCEPTED | PACKING | `POST /orders/{id}/packing` (blocked while credit approval is pending) | ORDER_WRITE |
| PACKING | READY_FOR_DELIVERY | `POST /orders/{id}/ready-for-delivery` | ORDER_WRITE |
| READY_FOR_DELIVERY | OUT_FOR_DELIVERY | `POST /orders/{id}/out-for-delivery` (person, vehicle) | ORDER_WRITE |
| OUT_FOR_DELIVERY | DELIVERED | `POST /orders/{id}/deliver` (delivered qty per line) | ORDER_WRITE |
| OUT_FOR_DELIVERY | DELIVERY_FAILED | `POST /orders/{id}/delivery-failed` (reason) | ORDER_WRITE |
| DELIVERED | COMPLETED | `POST /orders/{id}/complete` | ORDER_WRITE |

`COMPLETED`, `CANCELLED`, `REJECTED` and `DELIVERY_FAILED` are terminal. Every transition writes an immutable
`order_status_history` row (previous, new, who, when, note) and an audit record, and notifies the customer.

## Checkout

1. Customer must be `APPROVED`; product must be active; a delivery address is required.
2. Prices come from the backend: customer-specific price if set, else the product selling price. The client never
   sends prices. GST is intra-state (CGST+SGST) or inter-state (IGST) by seller vs delivery state code.
3. Stock is reserved for every line in one transaction; insufficient available stock (on hand − reserved) fails the
   whole order (`INSUFFICIENT_STOCK`).
4. `CREDIT` orders are checked against the credit profile (see `credit.md`).
5. `ONLINE` orders get a payment intent; if the gateway is down the order still stands and the customer retries from
   the order page.
6. `Idempotency-Key` makes retries return the same order.

## Quantities per line (§20)

`ordered`, `accepted`, `packed`, `delivered`, `cancelled`, `returned`, `invoiced`, `reserved`;
pending = accepted − delivered − cancelled. Accept releases unaccepted stock. Delivery posts `SALE_OUT` for the
delivered quantity, cancels any shortfall and releases remaining reservations. Order totals are re-priced for the
effective quantity (accepted − cancelled).

## Cancellation (§19)

Customer window: `business_settings.customer_cancel_allowed_until` (`PLACED`, `ACCEPTED` default, or `NEVER`).
Staff can cancel before delivery. Cancelling releases stock, cancels the order's invoice and refunds captured online
payments. After delivery, use a sales return.
