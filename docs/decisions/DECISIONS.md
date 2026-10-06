# Architecture Decisions

Decisions taken while implementing `APPLICATION-ARCHITECTURE.md` where the document was ambiguous, contradictory,
or left a choice open (§0 rule 4, §92 rule 24). Newest decisions are appended at the end. Each entry says what was
decided, why, and where it lives in the code.

---

## D-001 Order state machine: §7.2 is canonical (confirmed by the product owner)

§7.2 and §110 described different order states. **§7.2 is used**:
`PLACED → ACCEPTED → PACKING → READY_FOR_DELIVERY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED`, terminal
alternatives `CANCELLED`, `REJECTED`, `DELIVERY_FAILED`. §110's `PENDING` = `PLACED`, `DISPATCHED` = `OUT_FOR_DELIVERY`.
It matches the API inventory (`/out-for-delivery`, `/deliver`), the tracking UI (§39) and §101.
Code: `orders/OrderStatus.java`, migration `V4` check constraint.

## D-002 Payment status has two levels (confirmed by the product owner)

* **Order / invoice payment status (§8):** `PENDING, PAID, PARTIALLY_PAID, CREDIT, FAILED, REFUNDED, CANCELLED` —
  derived from payments and the invoice (`PaymentService.refreshOrder`). Invoice status follows §30.
* **Payment transaction status (§110):** `UNPAID, PENDING, AUTHORIZED, CAPTURED, PARTIALLY_PAID, FAILED, REFUNDED`
  plus `CANCELLED` for a manually recorded payment voided by staff. Only `CAPTURED`/`PARTIALLY_PAID` count as money
  received. Status only moves forward; late or out-of-order webhooks are ignored.
* **Payment method:** `UPI` (§9) is used; §110's `UPI_MANUAL` is the same thing.

## D-003 Technology versions

Java 21 (LTS), Spring Boot 4.1 (current GA at build time; brings Spring Framework 7, Hibernate 7, Jackson 3),
PostgreSQL 17 in containers (the local developer database is PostgreSQL 18), React 19 + TypeScript + Vite,
TanStack Query, Zustand, React Hook Form + Zod, Recharts, Motion. Package root `com.shopflow` (the document's
`com.example.shop` was a placeholder).

## D-004 Single business, multi-business-ready schema

One business row (`00000000-0000-0000-0000-000000000001`) is seeded; `business_id` is carried on every aggregate
root and resolved through `BusinessContext`, so branches/shops can be added later without destructive changes (§2).

## D-005 Authentication details

* Access token: HS256 JWT, 15 minutes, claims `role`, `perms`, `sid` (session) and `cid` (customer). Every request
  checks the session is still active, so logout, deactivation and blocking take effect immediately.
* Refresh token: opaque 48-byte random value, stored as an HMAC, rotated on every use; re-use of a rotated token
  revokes the whole session (theft detection). Browsers receive it only as an `HttpOnly; SameSite=Strict` cookie
  scoped to `/api/v1/auth` (`X-Client-Type: web`); mobile/API clients receive it in the body.
* CSRF: the API is stateless bearer-token only; the one cookie is SameSite=Strict and path-scoped, and the web app
  calls the API same-origin (Vite proxy in dev, nginx in containers). CSRF protection is therefore disabled.
* OTP: 6 digits, 5 minutes, 5 attempts, 30 s resend cooldown, 5 requests/15 min per number, 30/hour per IP (verify:
  4× that). Stored as `HMAC(secret, requestId:otp)`. No universal bypass code exists. The mock provider logs the OTP
  and exposes it through `GET /api/v1/dev/otp/latest` only when `app.dev-tools.enabled=true` (never in `prod`).
* A new number receives a 30-minute single-purpose **registration token**; it can only call
  `POST /api/v1/customer-registration`.
* Pending customers may sign in with no permissions to see their status (`app.auth.pending-customer-login=ALLOW_LIMITED`,
  switchable to `REJECT`).

## D-006 Permission model

Permission codes from §87 plus `DASHBOARD_OWNER_VIEW`, `SUPPLIER_READ/WRITE`, `RETURN_READ/WRITE`,
`REPORT_FINANCIAL` (profit and GST reports), `CREDIT_OVERRIDE`, and customer-only `CATALOG_BROWSE`, `CUSTOMER_SELF`.
Admins get operational permissions by default; the Owner can grant extra permissions per Admin
(`user_permissions`). Owner accounts are provisioned out-of-band and cannot be changed through the API.

## D-007 Customer-facing endpoints are separate

Customers use `/api/v1/catalog/**` (never exposes purchase cost), `/api/v1/cart`, `/api/v1/my/**`, and the shared
`/orders`, `/invoices`, `/payments`, `/sales-returns` endpoints, which filter to the caller's own records (404 for
others' records — object-level authorization). Staff product management stays on `/api/v1/products`.

## D-008 Stock reservation and when stock leaves

Order creation **reserves** stock (`stock_balances.reserved`) atomically, locking balance rows in product-id order to
avoid deadlocks. Stock physically leaves (`SALE_OUT`) **on delivery** for order-based sales, and **on invoice
generation** for admin-created (counter) invoices. Accept releases unaccepted quantities; cancel/reject/delivery
failure release the rest. `stock_balances` is a materialised balance maintained in the same transaction as the
immutable `stock_movements` journal; DB check constraints forbid negative on-hand or reserved stock.

## D-009 Partial delivery and invoicing

Configurable (`business_settings.partial_delivery_invoice_policy`): invoice **accepted** quantities (default) or
**delivered** quantities. `order_items.invoiced_quantity` prevents double billing. When less is delivered than was
invoiced, a `SHORT_DELIVERY` credit note is issued automatically.

## D-010 Credit rules

`evaluate` compares (ledger balance + un-invoiced open credit orders + new amount) with the credit limit.
Policy (per customer override, else business default): `BLOCK`, `REQUIRE_ADMIN_APPROVAL` (order is placed with
credit approval `PENDING`; accepting it is the approval), `ALLOW`. Staff generating an admin-created credit invoice
over a `BLOCK` limit need `CREDIT_OVERRIDE`. Customers without credit enabled cannot choose `CREDIT`.

## D-011 Customer ledger and payments

The ledger is append-only; positive balance = customer owes. Invoice generation debits; captured payments,
credit notes and invoice cancellations credit; payment cancellations/refunds debit (`PAYMENT_REVERSAL`).
Payments are allocated to a chosen invoice or to the oldest open invoices (FIFO); money not yet allocated is a
customer advance and is applied automatically when the next invoice is generated (order-linked payments first).

## D-012 Cancellation behaviour

* Posted purchases cannot be cancelled — use a purchase return. Drafts can.
* Cancelling an invoice keeps it (status `CANCELLED`), reverses the ledger, turns allocated payments into customer
  credit, puts stock back for admin-created invoices, and makes order quantities invoiceable again. An invoice with
  approved returns cannot be cancelled.
* Cancelling/rejecting an order or a failed delivery cancels its invoice and refunds captured **online** payments
  through the gateway. Cash already received stays as customer credit until staff refund it.
* Customers may cancel until the configured status (default: before packing); staff until delivery. After delivery
  the sales-return flow applies.

## D-013 Sales returns

Return → review → approve (stock `SALES_RETURN_IN`, `SALES_RETURN` credit note priced at the original net rate and
tax rate, ledger credit) or reject. Refunds are handled as customer credit (ledger); a cash refund is recorded with
the payment refund action. Returns are accepted only for delivered/completed orders or admin-created invoices.

## D-014 Invoice numbering and documents

Numbers come from `document_sequences` (one row per business, document type and financial year, `UPDATE …
RETURNING` row lock), so numbers are unique and never reused; a rolled-back transaction does not consume a number.
Format `PREFIX/2026-27/000001`; prefix/padding/starting number changes apply to the next financial year's sequence.
Other sequences: ORD, PUR, PAY, CN, DN, SR, PR, PP, ADJ, CUST, SUP. Back-dating an invoice requires
`SETTINGS_MANAGE` (Owner).

The invoice PDF is rendered server-side with OpenPDF purely from the invoice snapshot and stored once, so every copy
(download, WhatsApp) is byte-identical. Payment state and credit notes are separate documents and are not printed on
the invoice. A signed-QR image is not rendered yet (no QR library); the IRN/ack block is printed as text when present.

## D-015 GST calculation

Tax-exclusive pricing. Per line: gross = qty × rate; discount by amount or %; taxable = gross − discount;
intra-state CGST = SGST = taxable × rate/2 %, inter-state IGST = taxable × rate % — each rounded half-up to paise;
invoice round-off to the nearest rupee when enabled. Inter-state is decided by seller vs buyer state code (buyer:
customer's default address; unknown → intra-state). Tax is computed per line and summed so printed lines and
summaries always agree. **Must be validated by the business's tax advisor before production.** `TaxCalculator`
is the single implementation used by orders, invoices, purchases, returns and credit notes.

## D-016 Profit definition

Gross profit = net sales (taxable value after discounts) − cost of goods sold − sales returns (credit-note taxable
value less the returned cost). COGS uses `invoice_items.unit_cost`, a snapshot of the product's purchase price at
invoice generation. Expenses are not included (§40).

## D-017 Mock-first providers

`OtpProvider`, `PaymentGateway`, `WhatsAppProvider`, `EInvoiceProvider`, `StorageProvider`, `NotificationProvider`
each have a mock/local implementation selected by property. Mock test hooks: OTP numbers ending `0000` time out and
`1111` are rejected; the payment gateway simulates SUCCESS, FAILED, PENDING, CANCELLED, TIMEOUT, DUPLICATE_WEBHOOK,
OUT_OF_ORDER, INVALID_SIGNATURE and PARTIAL through signed webhooks (same verification path as production);
WhatsApp numbers ending `9999` fail permanently and `8888` time out twice (retry path). Mock e-invoice identifiers
are prefixed `TEST-ONLY-` and stored as `TEST_IRN`. Production adapters (Razorpay, Meta Cloud API, SMS vendor,
IRP/GSP, S3) are Stage 3 work (§0A) and plug into the same interfaces.

## D-018 Background jobs and rate limiting

`BackgroundJobs` runs after-commit jobs on virtual threads; job state lives in the database (e.g. `whatsapp_messages`)
and a scheduled sweeper retries due messages with exponential backoff and jitter and resumes interrupted ones.
The rate limiter is in-memory: correct for one backend instance. **Before running more than one instance, move the
rate limiter and job queue to a shared store (e.g. Redis)** — tracked in `RELEASE-GATES.md`.

## D-019 Files

Uploads are validated by magic bytes (PNG/JPEG/WebP, ≤ 5 MB), stored through `StorageProvider` under
server-generated keys (path traversal is rejected). Product images and the logo are served from
`/api/v1/files/public/{id}` (unguessable ids) so they work in `<img>` tags; invoice PDFs and receipts are only
served through their authorised endpoints.

## D-020 Undeletable history (database-level)

Triggers reject `DELETE` on `audit_logs`, `stock_movements`, `customer_ledger_entries`, `supplier_ledger_entries`,
`invoices`, `payments` and `order_status_history`, in addition to the application never deleting them.

## D-021 Additional endpoints beyond §51

Added and documented in OpenAPI: `/api/v1/my/**`, `/api/v1/catalog/**`, `/api/v1/notifications/**`,
`/api/v1/customers/{id}/credit|addresses|prices`, `/api/v1/orders/{id}/complete|delivery-failed|payment-intent`,
`/api/v1/invoices/{id}/credit-notes|whatsapp-messages`, `/api/v1/payments/{id}/refund|verify`,
`/api/v1/payments/webhooks/{provider}`, `/api/v1/integrations/whatsapp/webhook`, `/api/v1/purchases/{id}/payments`,
`/api/v1/business/settings|logo|states`, `/api/v1/permissions`, `/api/v1/users/{id}/permissions`,
`/api/v1/files/public/{id}`, and development-only `/api/v1/dev/**`.

## D-022 Response mapping and transactions

Open-session-in-view is disabled. Controllers that map lazy collections do so inside a read-only transaction
(`ReadTx`) after the write transaction commits.

## D-023 Web app scope in Stage 2

The React web app contains the Owner/Admin application **and** a customer portal (`/shop`) implementing the customer
screens (C01–C17), because Stage 2 acceptance requires cart, checkout and order tracking before mobile work starts.
The React Native app (`mobile/`) is reserved and will reuse the same API.

## D-024 Local development database

The developer machine runs PostgreSQL 18 on port 5432; credentials live only in the git-ignored `.env`
(`DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `TEST_DATABASE_URL`). Integration tests use
`TEST_DATABASE_URL` when present (the schema is cleaned and re-migrated per run) and otherwise start PostgreSQL with
Testcontainers (CI). The Podman stack uses its own PostgreSQL 17 container on port 5433.

## D-025 Postman collection

`docs/postman/*.json` is generated from the OpenAPI document (`node scripts/generate-postman.mjs`). Read endpoints and
the curated "Workflow (order to cash)" folder assert exact results. Generated write requests are reference examples
with placeholder bodies and are skipped unless `runWriteExamples=true` (only against a disposable database) — an
earlier run showed placeholder bodies overwrite settings.

## D-026 Demo OTP shown on the login screen

Until a paid SMS provider is activated, demos and testing use the mock OTP provider. With
`app.otp.show-in-response` (env `OTP_SHOW_IN_RESPONSE`), `POST /api/v1/auth/otp/request` also returns `demoOtp`, and
the login screen (web and mobile) shows it in a 20-second toast (no copy button; the mobile app also clears it on sign-in) and a "Demo mode" label. It is on by default in the `dev`
profile and off everywhere else. The application refuses to start if it is enabled with any provider other than
`mock`, so a real OTP can never be echoed. It lets anyone sign in as any number, so it must be off before real
customers use the app.

## D-027 Mobile app started before the formal §119 sign-off, covering every role

On 2026-10-03 the project owner asked to start the React Native app immediately, with every feature the web app has.
§0A/§119 say mobile starts after the web + backend gate is formally accepted; three gate items were still open
(fresh-clone start, invoice PDF design sign-off, backend dependency scan — see `docs/RELEASE-GATES.md`). The owner's
explicit instruction takes precedence; the open items stay tracked.

§6.3 describes a customer mobile app. Per the same instruction the app also contains the Owner/Admin screens. It is
one Expo app: the signed-in role decides the area (`/shop` for customers, `/admin` for staff), exactly like the web
app's `/shop` and `/app`. Staff tabs and the "More" menu are filtered by the same permissions as the web sidebar, and
the backend enforces them regardless.

## D-028 Mobile technology and session storage

Expo SDK 57 with Expo Router (recommended React Native framework; file routes in `mobile/src/app`, screens in
`mobile/src/screens` per §57). The app reuses the web app's API types, formatting rules and status colours. Mobile
clients do not send `X-Client-Type: web`, so the API returns the refresh token in the body; it is kept only in
`expo-secure-store` (Keychain / Keystore). In the browser build (used for development and the Playwright E2E suite)
the refresh token is held in memory only. Charts are drawn with plain views (no native chart dependency); tables
become card/list rows on phones. Dev-profile CORS also allows `http://localhost:8081` (the Expo web dev server);
native apps send no `Origin` header.

## D-029 Mobile keyboard handling

Expo SDK 57 apps draw edge-to-edge on Android, so the window is not resized when the on-screen keyboard opens and
`KeyboardAvoidingView` alone left inputs hidden (seen on a real device on the login screen). Every scrolling screen,
bottom sheet and picker now uses `KeyboardAwareScroll` / `useKeyboardOverlap`: the container measures how much of it
the keyboard covers, pads itself by that amount (footers stay above the keyboard) and scrolls the focused input into
view, also when focus moves between fields. It works in Expo Go (no native keyboard library needed).

## D-030 GCP single-image deployment

For Google Cloud Run the repo-root `Containerfile` builds the web app and copies `web/dist` into the backend's
`classpath:/static`, so one jar serves the API and the SPA from the same origin (`SpaWebConfig` falls back to
`index.html` for deep links; `/api`, `/actuator`, docs paths are never swallowed). Cloud SQL is reached through the
Cloud SQL Postgres socket factory (no public DB IP). Product images use a private GCS bucket via
`GcsStorageProvider` (`app.storage.provider=gcs`, Application Default Credentials) and are streamed through
`/api/v1/files/public/{id}`, which had to be added to the unauthenticated endpoints (plain `<img>` tags carry no
bearer token). The local two-container Podman stack is unchanged.

## D-031 Multi-tenant SaaS with row-level security

ShopFlow is sold to many businesses. The existing `businesses` table is the tenant table and `business_id` the
tenant key. Isolation follows the shared-database, shared-schema ("pool") model: every tenant-owned table, including
child/line tables, carries `business_id NOT NULL`, has `FORCE ROW LEVEL SECURITY`, and a policy keyed on the
per-transaction setting `app.tenant_id`, which the application sets from the signed token. Platform code uses an
audited `app.platform_access` flag. Application filters remain as defence in depth. A database per tenant was
rejected for now (cost and operational overhead on one Cloud SQL instance); it can be offered later for large
clients. Contract: architecture §0B.3.

## D-032 Global identity, per-tenant memberships, one URL

A mobile number is one global user. Roles live in `tenant_memberships` (one row per person per tenant), so one
person can be a customer of several shops or a supplier to several businesses. All tenants share one URL; after OTP
the person picks a business (auto-selected when there is only one) and `POST /auth/select-tenant` issues
tenant-scoped tokens. Refresh tokens are bound to one tenant; switching issues new tokens. Subdomains later.

*Implementation note (2026-10-04):* the identity is the OTP-verified mobile number and each `users` row is that
number's membership in one tenant (`UNIQUE (business_id, mobile_number)`), instead of a separate
`tenant_memberships` table. Every existing reference to `users.id` therefore stayed tenant-scoped with no data
migration; behaviour is the same as designed. Platform admins live in `platform_admins`.

## D-033 Joining a tenant

Customers join a specific business through its join link/QR (`/join/{tenant_code}`) or by entering the shop code at
registration (approval rules unchanged). Admins are invited by the Owner; suppliers are invited from their supplier
record; the first Owner is created by the Super Admin with the tenant.

## D-034 Super Admin (platform) role and console

`SUPER_ADMIN` lives in `platform_admins`, not in any tenant. The first ones come from the
`PLATFORM_SUPER_ADMIN_MOBILES` setting at startup; there is no self-promotion path. The console (web first, mobile in
Phase 5) manages tenants, templates, module switches, suspension and platform admins under `/api/v1/platform/**`.
Looking inside a tenant needs time-boxed, reason-logged support access that the tenant Owner can see.

## D-035 Per-tenant module switches

`tenant_modules` holds which modules each tenant may use (supplier portal, batch/expiry, variants, quotations, …).
The backend returns `403 MODULE_DISABLED` for a disabled module, `/auth/me` lists enabled modules, and both clients
hide disabled menus. Only the Super Admin changes them; changes are audited.

## D-036 Industry coverage and product options

One core for every trade; differences are generic, switchable options (unit conversions, decimals, variants,
batch/expiry with first-expiry-first-out, serial/IMEI with warranty, fixed/MRP/daily-rate pricing, schemes,
invoice charges, barcode labels) pre-set by an industry template chosen at tenant creation. Order: Grocery/FMCG,
Textile, Construction materials first; then Electrical/Hardware, Auto spares, Footwear, Cosmetics, Stationery,
Mobiles, Paints; Pharma last after compliance review. Jewellery and restaurants are out of scope (different
products). Tax rates and thresholds remain settings to be validated with a tax advisor.

## D-037 Purchase orders and supplier portal

Purchase orders go to suppliers who sign in to a supplier portal (module `SUPPLIER_PORTAL`, requires
`PURCHASE_ORDERS`). The supplier may change every term (rate, quantity, availability, delivery date, notes,
substitutes, extra lines, attachments, validity); rounds of quote and counter-offer are unlimited and each is an
immutable revision. The business accepts all or selected lines; goods receipts against accepted lines post stock
and the supplier ledger through the existing purchase posting. Suppliers see only their own POs.

## D-038 Responsive standard with automated viewport checks

Every web route is checked at 360, 390, 768, 1024, 1280 and 1440 px and every mobile screen at phone and tablet
sizes; a page that scrolls sideways or clips a heading/button fails the build. Layout rules (stacked page headers,
"More" actions menu on phones, table→card below 900 px, low-priority columns hidden at ≤ 1100 px, full-screen
dialogs on phones) are in architecture §0B.11.

## D-039 Tenant branding

Inside a tenant the UI shows that business's name and logo (web sidebar and tab title, customer shop header, mobile
headers, workspace switcher). "ShopFlow" is the product name ("Powered by ShopFlow", sign-in, Super Admin console).

## D-040 Self-signup, custom domains and branches (Phase 5)

- **No plans or usage limits.** Subscription plans with limits were built in V12 and removed in V13 at the product
  owner's request (2026-10-04): every business works without limits and nothing shows a plan.
- **Self-signup**: the owner proves the mobile number by OTP and sends the business details; nothing is created until
  the Super Admin approves (which runs the same "Register business" path) or rejects with a reason.
- **Custom domains**: a business may have one domain; the sign-in page opened at that domain behaves like its join
  link. DNS/TLS are set up at deployment.
- **Branches / warehouses** (module `BRANCHES`): stock is kept per branch. Only non-default branches have
  `branch_stock` rows; the default (main) branch holds the rest of the total, so the existing stock totals and every
  movement without a branch stay correct. Clients send the working branch as `X-Branch-Id`; outbound movements check
  the branch's own stock. Transfers move stock between branches (serial-tracked products are not transferred because
  serials have no branch).
- **Super Admin on mobile**: businesses, modules, suspension and sign-up approvals; creating a business and support
  access stay on the web console.
- **Branding**: every "Powered by ShopFlow" footer also names and links the company, TechSpark Software Solutions
  (https://techsparksoftwaresolutions.com).

## D-041 Industry words and units

Each industry has default words for products, customers and suppliers, default variant option names, and a default
list of product units (always including PCS and BOX); the owner can rename the words and choose the units in
Settings → Words & units. The words are applied inside the shared UI components rather than per screen, so every
current and future screen follows them. User data and legal invoice wording are never changed. Units stay codes of
the fixed product unit catalogue, so stock, conversions and reports keep working across businesses.

