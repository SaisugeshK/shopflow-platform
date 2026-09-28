# Inventory

Implementation: `backend/src/main/java/com/shopflow/inventory/InventoryService.java`.

* **Journal:** `stock_movements` is immutable (DB trigger blocks deletes). Types: OPENING, PURCHASE_IN, SALE_OUT,
  SALES_RETURN_IN, PURCHASE_RETURN_OUT, DAMAGE_OUT, LOSS_OUT, ADJUSTMENT_IN, ADJUSTMENT_OUT. Each row stores the
  balance after it and a reference (purchase, order, invoice, return, adjustment).
* **Balance:** `stock_balances.on_hand` and `reserved` are updated in the same transaction as each movement, with the
  balance row locked. Available = on hand − reserved. Check constraints prevent negative values.
* **Reservations:** order creation reserves; accept, cancel, reject, delivery failure and delivery release.
  Outbound movements other than reserved sales cannot use reserved stock.
* **Where stock moves:** purchase post (IN), purchase return post (OUT), order delivery (SALE_OUT), admin-created invoice
  generation (SALE_OUT), cancelling such an invoice (ADJUSTMENT_IN), approved sales return (SALES_RETURN_IN), product
  opening stock (OPENING), manual adjustments (reason required, `STOCK_WRITE`).
* **Low stock:** available ≤ `products.minimum_stock` (`GET /stock/low-stock`, dashboards).
* **Concurrency:** multi-product operations lock balance rows in product-id order (no deadlocks). Tested:
  concurrent orders never oversell (`OrderFlowIntegrationTest.concurrentOrdersNeverOversellStock`).
* **Purchases:** DRAFT → POSTED (stock IN + supplier ledger credit, atomic) or CANCELLED (drafts only). Returns post
  stock OUT and a supplier ledger debit at the original net rate. Supplier payments cannot exceed the balance due.
