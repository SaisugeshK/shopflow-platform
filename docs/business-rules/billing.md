# Billing

Implementation: `backend/src/main/java/com/shopflow/billing/` (`InvoiceService`, `TaxCalculator`, `CreditNoteService`,
`pdf/InvoicePdfRenderer`).

## Invoice types (§22)

* **Order-based:** `POST /invoices {orderId}` bills the order's uninvoiced quantities (accepted or delivered, per
  `partial_delivery_invoice_policy`). Stock leaves on delivery.
* **Admin-created (counter sale):** `POST /invoices {customerId, paymentType, items}`; the rate defaults to the
  customer's price and may be overridden by staff. Stock leaves when the invoice is generated.

Both start as `DRAFT` (totals already calculated by the server). `POST /invoices/{id}/generate` (idempotent) assigns
the number, snapshots seller (business profile, default bank, terms) and buyer (customer + default address),
re-calculates from the stored lines, stores the unit-cost snapshot, sets the due date (credit days for `CREDIT`),
debits the customer ledger, applies customer advances and (if enabled) registers the e-invoice.

## Calculation (§27) — see D-015

```
gross     = quantity × rate                      (2 dp, half-up)
discount  = discount amount, or gross × discount %
taxable   = gross − discount
CGST=SGST = taxable × (GST% / 2)                 intra-state
IGST      = taxable × GST%                       inter-state
line      = taxable + tax
total     = Σ lines, rounded to the nearest rupee when round-off is enabled (difference shown as round-off)
```

Amount in words uses the Indian system (lakh/crore). HSN-wise tax summary is stored in `invoice_tax_summaries`.

## Status (§30)

`DRAFT → GENERATED → (SENT) → PARTIALLY_PAID → PAID`, `CREDIT` for unpaid credit bills, `CANCELLED`. Status after
generation is derived from paid and credited amounts. Invoices are never deleted.

## Cancellation

Reason required. Reverses the ledger (net of credit notes), releases payment allocations into customer credit,
returns stock for admin-created invoices, and makes order quantities invoiceable again. Not allowed once a sales
return has been approved on the invoice.

## Credit notes

Reduce what is owed without editing the invoice: `SALES_RETURN` (from approved returns), `SHORT_DELIVERY` (automatic),
`PRICE_ADJUSTMENT`/`OTHER` (`POST /invoices/{id}/credit-notes`). Priced at the invoice line's net rate and tax rate;
cannot exceed the uncredited quantity. Excess payment becomes customer credit.

## PDF and delivery (§31, §32)

Server-side A4 PDF from the snapshot, stored once so every copy is identical. `POST /invoices/{id}/send-whatsapp`
queues delivery; history per message (`QUEUED → SENDING → SENT → DELIVERED → READ`, or `FAILED` with retries).
