# Customer credit and outstanding

Implementation: `backend/src/main/java/com/shopflow/customers/CreditService.java`, `CustomerLedgerService.java`.

## Ledger (§10)

Append-only `customer_ledger_entries`; positive balance means the customer owes the business.

| Event | Entry | Side |
|---|---|---|
| Invoice generated | INVOICE | debit |
| Payment captured | PAYMENT | credit |
| Credit note | CREDIT_NOTE | credit |
| Invoice cancelled | INVOICE_CANCELLATION | credit |
| Payment cancelled / refunded | PAYMENT_REVERSAL | debit |

Postings lock the customer row, so running balances are consistent. A negative balance is customer credit (advance),
applied automatically to the next invoice.

## Credit profile

Per customer: credit enabled, limit, credit days (due date = invoice date + days), optional policy override
(`CREDIT_OVERRIDE` required to set). Business defaults for new customers and the default policy live in
`business_settings`.

## Validation

Exposure = max(ledger balance, 0) + value of open, un-invoiced CREDIT orders + the new amount.

* Within limit → allowed.
* Over limit → policy: `BLOCK` (`CREDIT_LIMIT_EXCEEDED`), `REQUIRE_ADMIN_APPROVAL` (order placed with credit approval
  pending; accepting it approves), `ALLOW`.
* Credit not enabled → `CREDIT_NOT_ENABLED`.

## Reporting

`GET /customers/{id}/outstanding` and `/my/outstanding`: ledger balance, open invoice amount and count, overdue
amount, oldest due date, limit, available credit, days. Reports: Customers, Outstanding (days overdue per invoice).
