# APPLICATION-ARCHITECTURE.md

# Premium Wholesale / Retail Shop Management Platform

**Document status:** Implementation source of truth / build contract\
**Audience:** Claude Code / AI coding agents, backend/frontend/mobile
developers, QA, DevOps\
**Application model:** One shop/business, one shared Java backend, one
PostgreSQL database, React Web first, React Native Mobile second\
**Primary clients:** React Web first, React Native Mobile second (same backend)\
**Backend:** Java + Maven\
**Container/build:** Podman\
**Authentication:** Mobile number + OTP\
**Roles:** OWNER, ADMIN, CUSTOMER

------------------------------------------------------------------------

## 0. How This Document Must Be Used

This document is the **single source of truth for implementation**.

An AI coding agent must:

1.  Read this document before creating or changing architecture.
2.  Follow the technology choices, module boundaries, naming
    conventions, API contracts, database rules, UI design system, and
    workflows defined here.
3.  Never invent a competing architecture when a rule already exists
    here.
4.  If a requirement is genuinely ambiguous, choose the least
    destructive/configurable implementation and record the assumption in
    `docs/DECISIONS.md`.
5.  Never silently change database meaning, financial calculations,
    invoice numbering, authentication, permissions, or transaction state
    machines.
6.  Keep frontend, mobile, backend, database, API documentation, tests,
    and Postman collection synchronized.
7.  Prefer reusable components/services over duplicated implementations.
8.  Never hard-delete financial transactions, invoices, payments, stock
    movements, or audit records.
9.  Treat all money and tax calculations as financial data requiring
    deterministic, auditable calculations.
10. Every completed module must include implementation, validation,
    tests, API documentation, and required UI states.

### Definition of done

A feature is not complete until:

-   Database migration exists.
-   Backend domain/service/repository/API implementation exists.
-   Validation and authorization exist.
-   API documentation exists.
-   Postman request exists.
-   Web UI exists when applicable.
-   Mobile UI exists when the mobile phase is active.
-   Loading/empty/error/success states exist.
-   Unit/integration tests exist.
-   Audit requirements are implemented.
-   README/docs are updated.
-   No secrets are committed.
-   Existing tests continue to pass.

------------------------------------------------------------------------

# 0A. Development Strategy — MOCK FIRST, WEB + BACKEND FIRST

This is a **mandatory delivery strategy** for the first release.

## Stage 1 — Development and Testing Only

The first implementation must use **mock/local providers** for all paid or production-only third-party services.

Do **not** purchase or activate production OTP, WhatsApp, payment gateway, or e-invoice services during the initial development stage unless a sandbox account is required for integration testing.

Use these provider implementations:

```text
OtpProvider
├── MockOtpProvider                 ← default for local development
└── ProductionOtpProvider           ← added later

PaymentGateway
├── MockPaymentGateway              ← default for local development
└── RazorpayPaymentGateway          ← production integration later

WhatsAppProvider
├── MockWhatsAppProvider            ← default for local development
└── MetaWhatsAppCloudProvider       ← production integration later

EInvoiceProvider
├── MockEInvoiceProvider             ← default for local development
└── ProductionEInvoiceProvider       ← enabled only if legally/business applicable
```

The mock providers must behave like real providers from the application's point of view:

- return realistic success responses
- return realistic failure responses
- support timeouts
- support duplicate events
- support retry scenarios
- generate deterministic test IDs
- expose test status in development tools
- never require real money
- never send real customer messages
- never expose real credentials

### Mock OTP behavior

In development, OTP can be displayed in backend logs or a development-only test endpoint/tool.

The mock implementation must still enforce:

- OTP expiry
- maximum attempts
- resend cooldown
- old OTP invalidation
- rate limiting
- account/user lookup rules
- token issuance rules

Never implement a production bypass such as `123456` accepted for every user.

### Mock payment behavior

The mock payment gateway must support at least:

```text
SUCCESS
FAILED
PENDING
CANCELLED
TIMEOUT
DUPLICATE_WEBHOOK
```

The backend must update payment state only through the same service abstraction that the real gateway will use.

### Mock WhatsApp behavior

The mock provider must:

- accept a PDF/document message request
- generate a fake provider message ID
- simulate SENT / DELIVERED / READ / FAILED states
- simulate provider timeout
- simulate retry
- store delivery history in the database

No real WhatsApp message is sent in Stage 1.

### Mock e-invoice behavior

If e-invoicing is applicable to the business, the development implementation must use a mock provider until the real integration is intentionally enabled.

The mock may generate test IRN-like identifiers, but these values must be clearly marked as **TEST ONLY** and must never be presented as government-issued IRNs.

## Stage 2 — Web + Backend Complete

The first real product milestone is:

```text
React Web
     ↓
Java Backend
     ↓
PostgreSQL
     ↓
Podman
```

The following must be fully working before mobile development starts:

- authentication
- customer registration
- Owner/Admin permissions
- customer management
- products/categories/pricing
- GST/tax calculations
- suppliers
- purchases
- stock
- customer catalog
- cart
- checkout
- orders
- order status workflow
- invoices
- invoice PDF
- payments using mock gateway
- cash payment
- credit/outstanding ledger
- reports/dashboard
- audit logging
- mock WhatsApp delivery
- all critical API tests
- all critical web E2E tests
- Postman collection
- OpenAPI documentation
- security checks
- Podman local environment

The web application and backend are the **first acceptance milestone**.

## Stage 3 — Production Third-Party Activation

Only after Stage 2 is accepted:

1. Choose the production OTP provider.
2. Configure the production OTP provider.
3. Test it in staging.
4. Choose/configure official WhatsApp Business Platform access.
5. Configure WhatsApp templates and webhooks.
6. Choose/configure payment gateway production account.
7. Test payment gateway sandbox thoroughly.
8. Enable production payment credentials only after sign-off.
9. Configure e-invoice integration only when legally/business applicable.
10. Run production-readiness tests.
11. Enable integrations one at a time.

The production providers must implement the **same interfaces** used by the mock providers.

## Stage 4 — React Native Mobile

Mobile development starts **only after the web + backend milestone is accepted**.

The mobile application will use the exact same backend APIs, authentication model, business rules, invoice logic, payment logic, stock rules, customer rules, and permissions.

```text
                   ┌───────────────┐
                   │ Java Backend  │
                   │ REST API v1   │
                   └───────┬───────┘
                           / \\
                          /   \\
                         /     \\
                React Web     React Native
                Client        Client
```

Do not create a second mobile backend.

Do not duplicate business rules in React Native.

Do not fork the API specifically for mobile unless there is a documented performance or platform requirement.

## Stage 5 — Mobile Acceptance

After the mobile app is implemented:

- reuse the same API contract
- reuse the same test data model
- reuse the same authorization rules
- test customer registration/login
- test catalog/cart/checkout
- test online payment flow
- test credit flow
- test order tracking
- test invoice access
- test notification/deep-link behavior where supported
- perform Android/iOS security testing
- perform mobile E2E testing

------------------------------------------------------------------------

------------------------------------------------------------------------

# 1. Product Vision

Build a premium, modern business application for a single
wholesale/retail shop.

The business sells products to retail-shop customers. Customers use the
mobile application to browse products, create orders, make payments or
buy on credit, and track order status.

Owner and Admin users operate the business through the web application.

The system manages:

-   Customers
-   Products
-   Categories
-   Suppliers
-   Purchases
-   Stock
-   Sales
-   Orders
-   Invoices
-   Payments
-   Credit/outstanding balances
-   GST/tax information
-   Discounts
-   Delivery
-   WhatsApp invoice delivery
-   Reports
-   Owner dashboard
-   Admin operations
-   Audit history

------------------------------------------------------------------------

# 2. Core Business Model

There is one primary shop/business.

The shop has:

-   One business profile
-   One GST/business identity
-   One inventory
-   One customer base
-   One supplier base
-   One sales ledger
-   One purchase ledger
-   One financial reporting system

The system must nevertheless use IDs and database structures that can
support future multi-branch/multi-shop expansion without requiring
destructive redesign.

------------------------------------------------------------------------

# 3. Roles

## 3.1 OWNER

Full business visibility and configuration access.

Owner can:

-   View complete dashboard
-   View sales
-   View purchases
-   View profit
-   View tax/GST reports
-   View stock
-   Manage products
-   Manage customers
-   Manage suppliers
-   View customer-wise transactions
-   View customer outstanding balances
-   View payments
-   Manage invoices
-   Create invoices
-   View orders
-   Manage admin users
-   Configure shop/business settings
-   Configure invoice settings
-   View audit logs
-   Configure integrations
-   Access all reports

Owner is the highest application role.

------------------------------------------------------------------------

## 3.2 ADMIN

Operational business user.

Admin can:

-   View operational dashboard
-   Manage customers
-   Add/edit customers
-   Manage products
-   Manage categories
-   Manage purchases
-   Receive stock
-   Manage orders
-   Accept orders
-   Move orders through packing/delivery stages
-   Create invoices
-   Create manual invoices
-   Send invoices through WhatsApp
-   Record payments
-   Manage credit/outstanding collections
-   View stock
-   View sales
-   View customer transactions
-   View permitted reports

Admin cannot:

-   Manage Owner
-   Change Owner account
-   Change critical system configuration unless explicitly granted
-   Manage Admin users unless permission is granted
-   Change protected financial records without appropriate permission

Permissions should be implemented separately from roles so the system
can later support fine-grained Admin permissions.

------------------------------------------------------------------------

## 3.3 CUSTOMER

Customer represents a retail-shop owner/business purchasing from the
main shop.

Customer can:

-   Register using mobile number + OTP
-   Maintain customer/business profile
-   Browse products
-   View product details
-   Add products to cart
-   Change quantities
-   Place orders
-   Choose available payment method
-   Choose/receive credit where permitted
-   View orders
-   Track order status
-   View invoices
-   View payment history
-   View outstanding/credit balance
-   View profile
-   View saved addresses where supported

Customer can only access their own business data.

------------------------------------------------------------------------

# 4. Authentication

## 4.1 Login

Authentication is based on:

``` text
Mobile Number
    ↓
Request OTP
    ↓
OTP Verification
    ↓
Backend identifies user
    ↓
Issue access/refresh tokens
    ↓
Load role and permissions
    ↓
Open correct application area
```

Users must not choose their role during login.

Role is determined by the authenticated account.

------------------------------------------------------------------------

## 4.2 Customer Registration

Flow:

``` text
Enter Mobile
→ Send OTP
→ Verify OTP
→ Enter Customer/Shop Details
→ Submit Registration
→ Customer Account Created
→ Status = PENDING_APPROVAL
→ Admin/Owner Reviews
→ APPROVED / REJECTED / BLOCKED
```

Recommended customer registration fields:

  Field                             Required Source
  --------------------------- -------------- --------------------
  Mobile number                          Yes User
  OTP                                    Yes User
  Shop/business name                     Yes User
  Owner/contact person name              Yes User
  Address line 1                         Yes User
  Address line 2                          No User
  City                                   Yes User
  State                                  Yes User
  State code                             Yes Derived/configured
  Pincode                                Yes User
  GSTIN                         Configurable User
  PAN                           Configurable User
  Email                                   No User
  Alternate mobile                        No User
  Customer code                           No System
  Customer ID                             No System
  Status                                  No System
  Created at                              No System
  Updated at                              No System

------------------------------------------------------------------------

# 5. Authentication Security

The backend must implement:

-   OTP expiration
-   OTP attempt limits
-   Resend cooldown
-   Rate limiting
-   Brute-force protection
-   Access token expiry
-   Refresh token rotation
-   Logout/revocation
-   Device/session tracking where required
-   Secure passwordless authentication
-   Secure secret storage
-   Audit logging for sensitive account actions

OTP must never be stored in plaintext if persistence is required. Prefer
hashed/short-lived OTP storage or a dedicated OTP provider.

Tokens must not be stored insecurely in mobile local storage.

------------------------------------------------------------------------

# 6. Application Navigation

## 6.1 Owner Web

``` text
Dashboard
Orders
Products
  - Products
  - Categories
  - Stock
  - Stock Movements
Purchases
  - Add Purchase
  - Purchase History
  - Purchase Returns
Customers
  - All Customers
  - Customer Details
  - Credit / Outstanding
  - Transactions
Suppliers
  - Suppliers
  - Supplier Details
Sales
  - Sales
  - Payments
  - Credit Sales
Billing
  - Create Invoice
  - Invoices
  - Credit Bills
  - Credit/Debit Notes
Reports
  - Sales
  - Purchase
  - Stock
  - Profit
  - GST/Tax
  - Customer
  - Outstanding
  - Payment
Users
  - Admin Users
  - Permissions
Settings
  - Business Profile
  - GST/Tax
  - Bank Details
  - Invoice Settings
  - WhatsApp
  - Notifications
  - System
Audit Logs
```

------------------------------------------------------------------------

## 6.2 Admin Web

``` text
Dashboard
Orders
Products
  - Products
  - Categories
  - Stock
Purchases
  - Add Purchase
  - Purchase History
  - Purchase Returns
Customers
  - Customers
  - Add Customer
  - Customer Details
  - Pending Payments
Suppliers
Sales
Billing
  - Create Invoice
  - Invoices
  - Credit Bills
  - Payments
Reports
Profile
```

------------------------------------------------------------------------

## 6.3 Customer Mobile

``` text
Home
Products
Cart
Orders
Invoices
Payments
Credit / Outstanding
Profile
  - Business Details
  - Addresses
  - Settings
```

Recommended mobile bottom navigation:

``` text
Home | Products | Cart | Orders | Profile
```

------------------------------------------------------------------------

# 7. Major Business Flows

## 7.1 Customer Order

``` text
Customer Login
→ Browse Products
→ Product Details
→ Select Quantity
→ Add to Cart
→ Review Cart
→ Checkout
→ Delivery Address
→ Payment Method
→ Place Order
→ Order Created
→ Admin Notification
→ Admin Accepts
→ Packing
→ Ready for Delivery
→ Out for Delivery
→ Delivered
→ Completed
```

------------------------------------------------------------------------

## 7.2 Order Status

Canonical order state machine:

``` text
PLACED
  ↓
ACCEPTED
  ↓
PACKING
  ↓
READY_FOR_DELIVERY
  ↓
OUT_FOR_DELIVERY
  ↓
DELIVERED
  ↓
COMPLETED
```

Alternative terminal states:

``` text
CANCELLED
REJECTED
DELIVERY_FAILED
```

Each status change must create an immutable order status history record
containing:

-   Order ID
-   Previous status
-   New status
-   Changed by
-   Changed at
-   Optional reason/note

------------------------------------------------------------------------

# 8. Payment Status

Payment status must be separate from order status.

``` text
PENDING
PAID
PARTIALLY_PAID
CREDIT
FAILED
REFUNDED
CANCELLED
```

Example:

``` text
Order Status: DELIVERED
Payment Status: CREDIT
Outstanding: ₹10,000
```

This is valid and must be supported.

------------------------------------------------------------------------

# 9. Payment Methods

Initial supported methods:

``` text
CASH
ONLINE
UPI
BANK_TRANSFER
CREDIT
OTHER
```

Payment method must be configurable.

Each payment record should include:

-   Payment ID
-   Payment number/receipt number
-   Customer
-   Invoice
-   Order where applicable
-   Amount
-   Payment method
-   Reference number
-   Payment date/time
-   Collected by
-   Notes
-   Status
-   Created at

------------------------------------------------------------------------

# 10. Customer Credit / Outstanding

Credit sales are a first-class business function.

Example:

``` text
Invoice total       ₹10,000
Amount paid          ₹2,000
Outstanding          ₹8,000
```

Customer ledger must maintain debit/credit transactions.

Example:

``` text
Date       Reference       Debit    Credit    Balance
------------------------------------------------------
01-Sep     INV-001         20,000       -      20,000
05-Sep     INV-005         15,000       -      35,000
10-Sep     PAY-003              -   10,000      25,000
15-Sep     INV-012         30,000       -      55,000
```

Support:

-   Credit limit
-   Credit days
-   Due date
-   Outstanding amount
-   Overdue amount
-   Partial payment
-   Full settlement
-   Payment receipt
-   Customer ledger
-   Customer-wise statement

Credit limits and credit days must be configurable per customer.

If an order exceeds credit rules, the system must follow configured
behavior:

``` text
BLOCK
REQUIRE_ADMIN_APPROVAL
ALLOW
```

Owner can override where permitted.

------------------------------------------------------------------------

# 11. Product Management

## 11.1 Product Fields

  Field              Type                  Required          Generated
  ------------------ ----------- ------------------ ------------------
  Product ID         UUID                       Yes                Yes
  SKU/Product Code   String                     Yes   Can be generated
  Product Name       String                     Yes                 No
  Category           FK                         Yes                 No
  Brand              String/FK                   No                 No
  Description        Text                        No                 No
  HSN Code           String        Yes/configurable                 No
  Unit               Enum                       Yes                 No
  Purchase Price     Decimal                    Yes                 No
  Selling Price      Decimal                    Yes                 No
  MRP                Decimal       Yes/configurable                 No
  GST Rate           Decimal       Yes/configurable                 No
  Minimum Stock      Decimal                     No                 No
  Opening Stock      Decimal                     No                 No
  Image              File                        No                 No
  Active             Boolean                    Yes                 No

System-maintained:

-   Current stock
-   Created by
-   Updated by
-   Created at
-   Updated at

------------------------------------------------------------------------

# 12. Product Pricing

The system must distinguish:

``` text
Purchase Cost
Selling Price
MRP
Discount
GST
```

Future support should allow customer-specific pricing.

Do not hardcode a single pricing interpretation into the UI.

Pricing calculations must be centralized in the backend.

The frontend must never be trusted for final price/tax totals.

------------------------------------------------------------------------

# 13. Stock Management

Current stock should be derived from stock movements.

Conceptually:

``` text
Opening Stock
+ Purchase Receipts
+ Sales Returns
+ Adjustments IN
- Sales
- Purchase Returns
- Damage/Loss
- Adjustments OUT
= Current Stock
```

Stock movements must be immutable after posting except through
controlled reversal/adjustment transactions.

Supported movement types:

``` text
OPENING
PURCHASE_IN
SALE_OUT
SALES_RETURN_IN
PURCHASE_RETURN_OUT
DAMAGE_OUT
LOSS_OUT
ADJUSTMENT_IN
ADJUSTMENT_OUT
```

Support:

-   Low stock threshold
-   Out-of-stock status
-   Stock history
-   Stock adjustment
-   Damage/loss recording
-   Stock audit

------------------------------------------------------------------------

# 14. Purchase Management

Purchase flow:

``` text
Supplier
→ Add Purchase
→ Add Products
→ Quantity
→ Purchase Rate
→ Discount
→ GST
→ Calculate Total
→ Save/Post Purchase
→ Stock IN
```

Purchase fields:

-   Purchase ID
-   Purchase number
-   Purchase date
-   Supplier
-   Supplier invoice number
-   Supplier invoice date
-   Products
-   Quantity
-   Unit
-   Purchase rate
-   Discount
-   Tax
-   Subtotal
-   Taxable value
-   CGST
-   SGST
-   IGST
-   Round-off
-   Grand total
-   Payment status
-   Notes
-   Created by
-   Created at

Purchase returns must be supported.

------------------------------------------------------------------------

# 15. Supplier Management

Supplier fields:

-   Supplier ID
-   Supplier code
-   Supplier/business name
-   Contact person
-   Mobile
-   Email
-   Address
-   City
-   State
-   Pincode
-   GSTIN
-   PAN
-   Payment terms
-   Credit days
-   Active status

Optional future supplier ledger:

``` text
Purchases
- Supplier Payments
= Supplier Outstanding
```

------------------------------------------------------------------------

# 16. Customer Management

Customer list must support:

-   Search
-   Filter
-   Status
-   GSTIN
-   Outstanding
-   Credit limit
-   Credit days
-   Last transaction
-   Total sales

Customer detail should show tabs:

``` text
Overview
Orders
Invoices
Payments
Transactions
Outstanding
Documents
```

------------------------------------------------------------------------

# 17. Sales Returns

Support:

``` text
Delivered Sale
→ Customer Return Request
→ Admin Review
→ Approve
→ Return Quantity
→ Stock IN
→ Credit Note / Refund
→ Customer Ledger Adjustment
```

Return must reference the original invoice/order.

Never silently change an original invoice.

------------------------------------------------------------------------

# 18. Purchase Returns

Support:

``` text
Purchase
→ Supplier Return
→ Select Items
→ Quantity
→ Reason
→ Approve/Post
→ Stock OUT
→ Supplier Ledger Adjustment
```

------------------------------------------------------------------------

# 19. Order Cancellation

Customer cancellation rules must be configurable.

Suggested initial rule:

-   Customer can request cancellation before packing.
-   Admin can cancel before delivery.
-   After delivery, use return/refund workflow instead of cancellation.

Cancellation requires:

-   Reason
-   Actor
-   Timestamp
-   Optional note

Already-paid orders require refund workflow where applicable.

------------------------------------------------------------------------

# 20. Partial Delivery

The system should support partial delivery.

Example:

``` text
Ordered: 100
Available/Delivered: 70
Pending: 30
```

The order item must track:

-   Ordered quantity
-   Accepted quantity
-   Packed quantity
-   Delivered quantity
-   Cancelled quantity
-   Returned quantity
-   Pending quantity

Invoice behavior for partial delivery must be configurable and must
never double-bill delivered quantities.

------------------------------------------------------------------------

# 21. Delivery

Initial delivery model:

``` text
READY_FOR_DELIVERY
→ OUT_FOR_DELIVERY
→ DELIVERED
```

Delivery data may include:

-   Delivery address
-   Delivery person
-   Vehicle number
-   Delivery notes
-   Delivery date
-   Delivery attempt
-   Proof of delivery
-   Customer confirmation

Future support can add:

-   Driver mobile app
-   Delivery OTP
-   Signature
-   Photo proof

------------------------------------------------------------------------

# 22. Billing / Invoice

There are two invoice creation flows.

## 22.1 Order-based Invoice

``` text
Customer Order
→ Admin Accept
→ Generate Invoice
→ Send Invoice
→ Packing
→ Delivery
```

## 22.2 Admin-created Invoice

``` text
Admin
→ Create Invoice
→ Select Customer
→ Add Products
→ Quantity
→ Price
→ Discount
→ Tax
→ Payment Type
→ Generate Invoice
→ Send to Customer
```

------------------------------------------------------------------------

# 23. Invoice Header

The invoice system must support the fields demonstrated by the supplied
sample invoices.

### System/business fields

  -----------------------------------------------------------------------
  Field                               Source
  ----------------------------------- -----------------------------------
  Invoice ID                          System

  Invoice Number                      System

  Invoice Date                        Default current date; editable by
                                      authorized user if business rules
                                      permit

  Invoice Type                        User/configuration

  Original/Duplicate                  System

  IRN                                 External e-invoice integration
                                      where applicable

  Acknowledgement Number              External integration where
                                      applicable

  Acknowledgement Date                External integration where
                                      applicable

  Order Number                        System for order-based invoice

  Payment Terms                       Customer/configuration

  Due Date                            Calculated

  Delivery Note                       Optional

  Dispatch Document                   Optional

  Transport                           Optional

  Vehicle Number                      Optional

  Destination                         Optional
  -----------------------------------------------------------------------

Invoice numbering must be system-generated.

Example:

``` text
INV/2026-27/000001
INV/2026-27/000002
```

The exact prefix/sequence configuration must be stored in settings.

Never manually reuse an invoice number.

------------------------------------------------------------------------

# 24. Seller Information

Seller/shop information comes from Business Settings.

Fields:

-   Business name
-   Logo
-   Address
-   Phone
-   Mobile
-   Email
-   GSTIN
-   PAN
-   State
-   State code
-   Bank name
-   Account number
-   IFSC
-   Branch
-   Terms and conditions
-   Authorized signatory name

These should automatically populate invoices.

------------------------------------------------------------------------

# 25. Buyer Information

Admin selects an existing customer.

The system loads:

-   Customer/shop name
-   Contact person
-   Address
-   City
-   State
-   State code
-   Mobile
-   GSTIN
-   PAN
-   Email

The invoice must retain a **snapshot of billing information at invoice
time** so later customer profile edits do not change historical
invoices.

------------------------------------------------------------------------

# 26. Invoice Line Items

Each invoice line supports:

-   Serial number
-   Product
-   Description
-   HSN/SAC
-   Quantity
-   Unit
-   Rate
-   Discount %
-   Discount amount
-   Tax rate
-   Taxable value
-   CGST
-   SGST/UTGST
-   IGST
-   Line total

Product master data may populate defaults, but the invoice must store
its own transaction snapshot.

------------------------------------------------------------------------

# 27. Invoice Calculations

Backend is the source of truth.

Conceptually:

``` text
Line Gross
= Quantity × Rate

Discount Amount
= configured discount calculation

Taxable Value
= Line Gross - Discount

Tax
= Taxable Value × Applicable Tax Rate

Invoice Total
= Sum of Taxable Values
+ Tax
+/- Round Off
```

For intra-state transactions:

``` text
CGST + SGST/UTGST
```

For inter-state transactions where applicable:

``` text
IGST
```

Exact tax treatment must be configurable and validated against
applicable Indian GST rules before production use.

Do not hardcode legal tax assumptions beyond the configured business/tax
rules.

------------------------------------------------------------------------

# 28. Invoice Summary

System-generated:

-   Subtotal
-   Discount
-   Taxable value
-   CGST
-   SGST/UTGST
-   IGST
-   Round-off
-   Grand total
-   Amount in words
-   Tax amount in words

------------------------------------------------------------------------

# 29. Invoice Payment

Invoice supports:

``` text
CASH
ONLINE
UPI
BANK_TRANSFER
CREDIT
OTHER
```

Example:

``` text
Invoice Total       ₹10,000
Paid                 ₹2,000
Outstanding          ₹8,000
```

The invoice must link to payment and ledger records.

------------------------------------------------------------------------

# 30. Invoice Status

``` text
DRAFT
GENERATED
SENT
PARTIALLY_PAID
PAID
CREDIT
CANCELLED
```

Do not delete generated invoices.

Cancellation requires:

-   Reason
-   User
-   Timestamp
-   Audit record

------------------------------------------------------------------------

# 31. Invoice PDF

Invoice PDF must visually follow the provided sample invoices:

-   Professional tax invoice
-   Seller header
-   Buyer section
-   Invoice metadata
-   Item table
-   HSN/SAC
-   Quantity
-   Rate
-   Discount
-   GST
-   Tax summary
-   Total
-   Amount in words
-   Bank details
-   Terms and conditions
-   Signature area
-   Optional QR/IRN section
-   "Computer Generated Invoice"

The layout must be print-friendly for A4 and suitable for WhatsApp PDF
sharing.

Invoice generation must be deterministic and server-side.

------------------------------------------------------------------------

# 32. WhatsApp Integration

Invoice sending flow:

``` text
Invoice Generated
→ PDF Created
→ Admin clicks Send WhatsApp
→ WhatsApp Provider API
→ Customer Mobile
→ Message + Invoice
→ Delivery Status
```

Store:

-   Message ID
-   Invoice ID
-   Customer ID
-   Recipient number
-   Provider
-   Template ID
-   Sent time
-   Delivery status
-   Failure reason
-   Retry count

Never expose provider secrets to frontend clients.

Potential future WhatsApp messages:

-   Order confirmation
-   Order accepted
-   Invoice
-   Payment receipt
-   Delivery update
-   Outstanding reminder

------------------------------------------------------------------------

# 33. Owner Dashboard

Owner dashboard should show:

### KPI cards

-   Today's sales
-   Today's profit
-   Total customers
-   Current stock
-   Outstanding amount
-   Pending orders
-   Pending payments
-   Low-stock products

### Charts

-   Sales trend
-   Purchase trend
-   Sales by category
-   Top-selling products
-   Customer sales
-   Outstanding trend
-   Payment collection trend

### Tables

-   Recent orders
-   Top customers
-   Outstanding customers
-   Low-stock products
-   Recent payments

Date filters:

``` text
Today
Yesterday
This Week
This Month
This Financial Year
Custom Range
```

------------------------------------------------------------------------

# 34. Admin Dashboard

Admin dashboard should focus on operations:

-   Today's orders
-   New orders
-   Accepted orders
-   Packing
-   Ready for delivery
-   Out for delivery
-   Today's sales
-   Pending payments
-   Low stock
-   Quick actions

Quick actions:

``` text
Add Customer
Add Product
Add Purchase
Create Invoice
Record Payment
```

------------------------------------------------------------------------

# 35. Customer Home

Customer mobile home should show:

-   Greeting
-   Search
-   Categories
-   Featured/best-selling products
-   Recently ordered products
-   Current cart
-   Current orders
-   Outstanding balance
-   Quick reorder

------------------------------------------------------------------------

# 36. Customer Product Screen

Show:

-   Product image
-   Product name
-   SKU
-   Description
-   Unit
-   Price
-   MRP where applicable
-   Available stock indicator where business policy allows
-   GST/tax information where appropriate
-   Quantity selector
-   Add to cart

Customer must not receive internal purchase cost.

------------------------------------------------------------------------

# 37. Customer Cart

Show:

-   Products
-   Quantity
-   Unit price
-   Discount
-   Tax
-   Subtotal
-   Total

Allow:

-   Increase/decrease quantity
-   Remove item
-   Apply allowed discount/promotion
-   Proceed to checkout

Final totals must be recalculated by backend.

------------------------------------------------------------------------

# 38. Checkout

Fields:

-   Customer
-   Delivery address
-   Contact
-   Order items
-   Quantity
-   Payment method
-   Credit selection where permitted
-   Order note

System calculates:

-   Subtotal
-   Discount
-   Tax
-   Total
-   Outstanding/paid amount

------------------------------------------------------------------------

# 39. Customer Order Tracking

Timeline:

``` text
✓ Order Placed
✓ Accepted
✓ Packing
○ Ready for Delivery
○ Out for Delivery
○ Delivered
```

Show:

-   Order number
-   Date
-   Items
-   Total
-   Invoice
-   Payment status
-   Delivery status

------------------------------------------------------------------------

# 40. Reports

Required reports:

## Sales Report

-   Date
-   Invoice
-   Customer
-   Product
-   Quantity
-   Revenue
-   Discount
-   Tax
-   Total

## Purchase Report

-   Supplier
-   Purchase
-   Product
-   Quantity
-   Cost
-   Tax
-   Total

## Stock Report

-   Product
-   Opening
-   In
-   Out
-   Return
-   Adjustment
-   Current stock

## Profit Report

Profit calculation must be explicitly defined and consistent.

Suggested base:

``` text
Sales Revenue
- Sales Discounts
- Cost of Goods Sold
- Sales Returns adjustment
= Gross Profit
```

Any further expense calculation must be introduced as a separate
configured module rather than silently included.

## GST/Tax Report

-   Taxable value
-   CGST
-   SGST/UTGST
-   IGST
-   Total tax
-   Invoice reference

## Customer Report

-   Customer
-   Total sales
-   Total paid
-   Outstanding
-   Overdue
-   Transaction count

## Outstanding Report

-   Customer
-   Invoice
-   Invoice date
-   Due date
-   Total
-   Paid
-   Outstanding
-   Days overdue

## Payment Report

-   Payment
-   Customer
-   Invoice
-   Amount
-   Method
-   Reference
-   Date
-   Collector

------------------------------------------------------------------------

# 41. Search, Filter, Sort, Pagination

All large lists must support:

-   Search
-   Filters
-   Sort
-   Pagination
-   Date range
-   Export where appropriate

Apply to:

-   Customers
-   Products
-   Orders
-   Invoices
-   Purchases
-   Payments
-   Stock
-   Reports
-   Suppliers

------------------------------------------------------------------------

# 42. Export

Reports should support:

-   CSV
-   Excel
-   PDF

Export must respect current filters and permissions.

------------------------------------------------------------------------

# 43. Notifications

Application should have a notification abstraction.

Potential channels:

``` text
IN_APP
PUSH
WHATSAPP
SMS
EMAIL
```

Do not couple business logic directly to a specific notification vendor.

Use a notification service/provider interface.

------------------------------------------------------------------------

# 44. Database Architecture

Recommended database:

**PostgreSQL**

Use UUID primary keys for major domain entities.

Use database migrations with **Flyway** or equivalent versioned
migration system.

Never use automatic schema generation in production as the source of
schema truth.

------------------------------------------------------------------------

# 45. Core Tables

The final implementation should include at minimum:

### Identity

``` text
users
roles
permissions
role_permissions
user_roles
otp_requests
refresh_tokens
user_sessions
```

### Business

``` text
businesses
business_settings
business_bank_accounts
invoice_settings
tax_settings
```

### Customers

``` text
customers
customer_addresses
customer_credit_profiles
customer_ledger_entries
```

### Suppliers

``` text
suppliers
supplier_addresses
supplier_ledger_entries
```

### Products

``` text
categories
brands
products
product_prices
product_images
```

### Inventory

``` text
stock_balances
stock_movements
stock_adjustments
```

### Purchases

``` text
purchases
purchase_items
purchase_payments
purchase_returns
purchase_return_items
```

### Sales / Orders

``` text
orders
order_items
order_status_history
deliveries
```

### Billing

``` text
invoices
invoice_items
invoice_tax_summaries
credit_notes
debit_notes
```

### Payments

``` text
payments
payment_allocations
payment_receipts
```

### Communication

``` text
whatsapp_messages
notification_events
```

### Audit

``` text
audit_logs
```

------------------------------------------------------------------------

# 46. Important Database Relationships

``` text
Business
  ├── Users
  ├── Customers
  ├── Suppliers
  ├── Products
  ├── Orders
  ├── Purchases
  └── Invoices

Customer
  ├── Orders
  ├── Invoices
  ├── Payments
  ├── Credit Profile
  └── Ledger Entries

Order
  ├── Customer
  ├── Order Items
  ├── Status History
  ├── Delivery
  └── Invoice

Invoice
  ├── Customer
  ├── Order (optional)
  ├── Invoice Items
  ├── Tax Summary
  ├── Payments
  ├── Credit Note(s)
  └── WhatsApp Message(s)

Product
  ├── Category
  ├── Price(s)
  ├── Images
  └── Stock Movements
```

------------------------------------------------------------------------

# 47. Database Rules

1.  Use foreign keys.
2.  Use unique constraints for business identifiers.
3.  Use indexes for frequently searched fields.
4.  Use decimal/numeric types for money, never floating-point.
5.  Store timestamps in UTC.
6.  Convert to business/user timezone at presentation.
7.  Never hard-delete financial transactions.
8.  Use soft deletion/status for master records where required.
9.  Store historical transaction snapshots.
10. Use optimistic locking where concurrent updates can occur.
11. Stock changes must be transactional.
12. Payment allocation must be transactional.
13. Invoice posting must be transactional.
14. Use database constraints in addition to application validation.

------------------------------------------------------------------------

# 48. Financial Data Rules

Never use:

``` text
float
double
```

for monetary calculations.

Use:

``` text
DECIMAL / NUMERIC
```

with appropriate precision and scale.

Examples:

``` text
quantity: DECIMAL
rate: DECIMAL
tax_rate: DECIMAL
tax_amount: DECIMAL
discount_amount: DECIMAL
total_amount: DECIMAL
```

All calculations must use a single backend calculation library/service.

------------------------------------------------------------------------

# 49. API Architecture

Backend style:

``` text
REST API
/api/v1/...
```

JSON request/response.

Use:

-   DTOs
-   Validation
-   Service layer
-   Repository layer
-   Domain/business services
-   Global exception handler
-   Standard error response
-   Authentication middleware
-   Authorization checks
-   Idempotency where needed
-   API versioning

------------------------------------------------------------------------

# 50. Standard API Response

Success example:

``` json
{
  "success": true,
  "data": {},
  "message": "Success",
  "requestId": "uuid"
}
```

Paginated:

``` json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 100,
    "totalPages": 5
  },
  "requestId": "uuid"
}
```

Error:

``` json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": []
  },
  "requestId": "uuid"
}
```

------------------------------------------------------------------------

# 51. API Inventory

The following is the initial API contract inventory. Exact
request/response DTOs must be documented in OpenAPI.

## Authentication

``` text
POST   /api/v1/auth/otp/request
POST   /api/v1/auth/otp/verify
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

## Customer Registration

``` text
POST   /api/v1/customer-registration
GET    /api/v1/customer-registration/status
```

## Users

``` text
GET    /api/v1/users
GET    /api/v1/users/{id}
POST   /api/v1/users
PATCH  /api/v1/users/{id}
POST   /api/v1/users/{id}/activate
POST   /api/v1/users/{id}/deactivate
```

## Customers

``` text
GET    /api/v1/customers
GET    /api/v1/customers/{id}
POST   /api/v1/customers
PATCH  /api/v1/customers/{id}
POST   /api/v1/customers/{id}/approve
POST   /api/v1/customers/{id}/reject
POST   /api/v1/customers/{id}/block
GET    /api/v1/customers/{id}/ledger
GET    /api/v1/customers/{id}/outstanding
GET    /api/v1/customers/{id}/orders
GET    /api/v1/customers/{id}/invoices
GET    /api/v1/customers/{id}/payments
```

## Products

``` text
GET    /api/v1/products
GET    /api/v1/products/{id}
POST   /api/v1/products
PATCH  /api/v1/products/{id}
POST   /api/v1/products/{id}/activate
POST   /api/v1/products/{id}/deactivate
```

## Categories

``` text
GET    /api/v1/categories
POST   /api/v1/categories
PATCH  /api/v1/categories/{id}
POST   /api/v1/categories/{id}/activate
POST   /api/v1/categories/{id}/deactivate
```

## Suppliers

``` text
GET    /api/v1/suppliers
GET    /api/v1/suppliers/{id}
POST   /api/v1/suppliers
PATCH  /api/v1/suppliers/{id}
GET    /api/v1/suppliers/{id}/ledger
```

## Purchases

``` text
GET    /api/v1/purchases
GET    /api/v1/purchases/{id}
POST   /api/v1/purchases
POST   /api/v1/purchases/{id}/post
POST   /api/v1/purchases/{id}/cancel
```

## Purchase Returns

``` text
POST   /api/v1/purchase-returns
GET    /api/v1/purchase-returns
GET    /api/v1/purchase-returns/{id}
POST   /api/v1/purchase-returns/{id}/post
```

## Stock

``` text
GET    /api/v1/stock
GET    /api/v1/stock/{productId}
GET    /api/v1/stock/movements
POST   /api/v1/stock/adjustments
GET    /api/v1/stock/low-stock
```

## Orders

``` text
GET    /api/v1/orders
GET    /api/v1/orders/{id}
POST   /api/v1/orders
POST   /api/v1/orders/{id}/accept
POST   /api/v1/orders/{id}/reject
POST   /api/v1/orders/{id}/cancel
POST   /api/v1/orders/{id}/packing
POST   /api/v1/orders/{id}/ready-for-delivery
POST   /api/v1/orders/{id}/out-for-delivery
POST   /api/v1/orders/{id}/deliver
GET    /api/v1/orders/{id}/status-history
```

## Cart

``` text
GET    /api/v1/cart
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/{id}
DELETE /api/v1/cart/items/{id}
DELETE /api/v1/cart
```

## Invoices

``` text
GET    /api/v1/invoices
GET    /api/v1/invoices/{id}
POST   /api/v1/invoices
POST   /api/v1/invoices/{id}/generate
POST   /api/v1/invoices/{id}/cancel
GET    /api/v1/invoices/{id}/pdf
POST   /api/v1/invoices/{id}/send-whatsapp
```

## Payments

``` text
GET    /api/v1/payments
GET    /api/v1/payments/{id}
POST   /api/v1/payments
POST   /api/v1/payments/{id}/cancel
GET    /api/v1/payments/{id}/receipt
```

## Returns

``` text
POST   /api/v1/sales-returns
GET    /api/v1/sales-returns
GET    /api/v1/sales-returns/{id}
POST   /api/v1/sales-returns/{id}/approve
POST   /api/v1/sales-returns/{id}/reject
```

## Reports

``` text
GET /api/v1/reports/sales
GET /api/v1/reports/purchases
GET /api/v1/reports/stock
GET /api/v1/reports/profit
GET /api/v1/reports/tax
GET /api/v1/reports/customers
GET /api/v1/reports/outstanding
GET /api/v1/reports/payments
```

## Dashboard

``` text
GET /api/v1/dashboard/owner
GET /api/v1/dashboard/admin
GET /api/v1/dashboard/customer
```

## Business Settings

``` text
GET   /api/v1/business
PATCH /api/v1/business
GET   /api/v1/business/invoice-settings
PATCH /api/v1/business/invoice-settings
GET   /api/v1/business/tax-settings
PATCH /api/v1/business/tax-settings
GET   /api/v1/business/bank-accounts
POST  /api/v1/business/bank-accounts
PATCH /api/v1/business/bank-accounts/{id}
```

## Audit

``` text
GET /api/v1/audit-logs
GET /api/v1/audit-logs/{id}
```

------------------------------------------------------------------------

# 52. API Documentation

Use OpenAPI 3.x.

Location:

``` text
docs/openapi/openapi.yaml
```

Every API must document:

-   Summary
-   Description
-   Authentication
-   Authorization
-   Request
-   Path/query parameters
-   Request body
-   Validation
-   Success response
-   Error responses
-   Example request
-   Example response

Do not maintain undocumented APIs.

------------------------------------------------------------------------

# 53. Postman Collection

Create:

``` text
docs/postman/shopflow-platform.postman_collection.json
```

Collections:

``` text
Authentication
Customers
Products
Categories
Suppliers
Purchases
Purchase Returns
Stock
Orders
Cart
Invoices
Payments
Sales Returns
Reports
Dashboard
Settings
Audit
```

Environment variables:

``` text
baseUrl
accessToken
refreshToken
businessId
userId
customerId
productId
orderId
invoiceId
paymentId
```

Postman tests should validate:

-   HTTP status
-   Response structure
-   Authentication
-   Important IDs
-   Pagination
-   Error format

------------------------------------------------------------------------

# 54. Backend Architecture

Recommended Java architecture:

``` text
backend/
└── src/
    ├── main/
    │   ├── java/
    │   │   └── com.example.shop/
    │   │       ├── config/
    │   │       ├── security/
    │   │       ├── common/
    │   │       ├── auth/
    │   │       ├── users/
    │   │       ├── business/
    │   │       ├── customers/
    │   │       ├── suppliers/
    │   │       ├── products/
    │   │       ├── inventory/
    │   │       ├── purchases/
    │   │       ├── orders/
    │   │       ├── billing/
    │   │       ├── payments/
    │   │       ├── reports/
    │   │       ├── notifications/
    │   │       └── audit/
    │   └── resources/
    │       ├── application.yml
    │       └── db/migration/
    └── test/
```

Use Spring Boot unless a project-specific constraint requires otherwise.

Recommended libraries:

-   Spring Boot
-   Spring Web
-   Spring Security
-   Spring Validation
-   Spring Data JPA
-   PostgreSQL driver
-   Flyway
-   OpenAPI/Swagger
-   Testcontainers
-   JUnit
-   Mockito where appropriate

Use Maven for dependency/build management.

------------------------------------------------------------------------

# 55. Backend Layering

Use:

``` text
Controller
    ↓
Application Service
    ↓
Domain/Business Service
    ↓
Repository
    ↓
Database
```

External providers:

``` text
Application Service
    ↓
Provider Interface
    ↓
WhatsApp Provider
Payment Provider
OTP Provider
Storage Provider
```

Business logic must not be placed inside controllers.

------------------------------------------------------------------------

# 56. Frontend Architecture

React web:

``` text
web/
├── src/
│   ├── app/
│   ├── routes/
│   ├── components/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── customers/
│   │   ├── products/
│   │   ├── purchases/
│   │   ├── orders/
│   │   ├── billing/
│   │   ├── payments/
│   │   └── reports/
│   ├── services/
│   ├── hooks/
│   ├── stores/
│   ├── utils/
│   └── styles/
```

Use a consistent feature-based architecture.

------------------------------------------------------------------------

# 57. React Native Architecture

``` text
mobile/
├── src/
│   ├── navigation/
│   ├── screens/
│   │   ├── auth/
│   │   ├── home/
│   │   ├── products/
│   │   ├── cart/
│   │   ├── checkout/
│   │   ├── orders/
│   │   ├── invoices/
│   │   ├── payments/
│   │   └── profile/
│   ├── components/
│   ├── features/
│   ├── services/
│   ├── store/
│   ├── hooks/
│   ├── utils/
│   └── theme/
```

------------------------------------------------------------------------

# 58. UI/UX DESIGN SYSTEM

The application must use a **premium, modern, polished B2B business
design**.

Do not generate unrelated visual styles between screens.

Design goals:

-   Premium
-   Clean
-   Professional
-   Modern
-   Fast
-   Trustworthy
-   Business-focused
-   Responsive
-   Accessible

------------------------------------------------------------------------

# 59. Proposed Brand Direction

Temporary product name:

``` text
Shop Management Platform
```

Actual shop/business name must be configurable.

Visual direction:

``` text
Primary: Blue
Secondary: Deep Navy
Accent: Cyan/Teal
Success: Green
Warning: Amber
Danger: Red
Background: Very Light Gray/Blue
Surface: White
Text: Dark Navy
Muted: Slate
```

Suggested starting tokens:

``` text
Primary       #2563EB
Primary Dark  #1D4ED8
Navy          #0F2747
Accent        #06B6D4
Success       #16A34A
Warning       #F59E0B
Danger        #DC2626
Background    #F8FAFC
Surface       #FFFFFF
Text          #0F172A
Muted         #64748B
Border        #E2E8F0
```

These values can be centralized in the design token system.

------------------------------------------------------------------------

# 60. Typography

Use a modern sans-serif such as:

``` text
Inter
```

Recommended hierarchy:

``` text
H1: 28-32px / bold
H2: 22-24px / semibold
H3: 18-20px / semibold
Body: 14-16px / regular
Small: 12-13px
```

Mobile typography must scale responsively.

------------------------------------------------------------------------

# 61. UI Components

Create a reusable design system:

``` text
Button
Input
PhoneInput
OTPInput
Textarea
Select
DatePicker
SearchInput
Checkbox
Radio
Switch
Dropdown
Modal
Drawer
BottomSheet
Toast
Alert
Card
StatCard
Table
DataTable
Pagination
Tabs
Badge
StatusBadge
Timeline
Stepper
EmptyState
Skeleton
Spinner
Tooltip
FileUploader
ImageUploader
CurrencyInput
QuantityStepper
PriceInput
TaxBreakdown
InvoicePreview
```

------------------------------------------------------------------------

# 62. Status Colors

Use consistent semantic badges:

``` text
Pending       → Warning
Accepted      → Primary/Blue
Packing       → Accent
Ready         → Teal
Delivery      → Purple/Blue
Completed     → Success
Cancelled     → Danger
Credit        → Orange/Amber
Paid          → Success
Failed        → Danger
```

Do not use color as the only status indicator. Include text/icon.

------------------------------------------------------------------------

# 63. Web Layout

Desktop:

``` text
┌─────────────────────────────────────────────────────────┐
│ Logo │ Search │ Notifications │ User                   │
├──────┼──────────────────────────────────────────────────┤
│      │                                                  │
│ Side │                 Page Content                     │
│ bar  │                                                  │
│      │                                                  │
└──────┴──────────────────────────────────────────────────┘
```

Sidebar must support:

-   Active state
-   Collapsed mode
-   Role-based menu
-   Nested menus
-   Keyboard navigation

------------------------------------------------------------------------

# 64. Mobile Layout

Use:

-   Bottom navigation
-   Top app bar
-   Cards
-   Bottom sheets
-   Full-screen forms when required
-   Sticky checkout CTA
-   Floating cart indicator
-   Pull-to-refresh where appropriate

Customer mobile must prioritize:

``` text
Browse → Select → Cart → Checkout → Track
```

------------------------------------------------------------------------

# 65. Premium Animation Rules

Animations are required but must remain professional.

Use:

-   Page transitions
-   Fade/slide
-   Card entrance
-   Button press feedback
-   Hover effects on web
-   Animated counters
-   Chart entrance
-   Skeleton loading
-   Modal/bottom-sheet transitions
-   Cart quantity transitions
-   Order timeline transitions
-   Success states
-   Toast transitions

Avoid:

-   Excessive bouncing
-   Continuous decorative animation
-   Long animations
-   Blocking animations
-   Distracting motion during billing/order entry

Animation duration should generally be short, approximately 150-350ms
depending on interaction.

Support:

``` text
prefers-reduced-motion
```

------------------------------------------------------------------------

# 66. Required UI States

Every screen must have:

``` text
Loading
Loaded
Empty
Error
Permission Denied
Offline/Network Error where relevant
Success
```

Do not leave blank white screens while loading.

------------------------------------------------------------------------

# 67. Accessibility

Implement:

-   Keyboard navigation on web
-   Focus states
-   Accessible labels
-   Semantic HTML
-   Screen-reader-friendly controls
-   Sufficient contrast
-   Touch targets appropriate for mobile
-   Reduced motion
-   Error messages associated with fields

------------------------------------------------------------------------

# 68. Figma-Style Screen Inventory

The implementation design should follow this screen sequence.

## Authentication

``` text
A01 Splash
A02 Mobile Login
A03 OTP Verification
A04 Customer Registration
A05 Registration Pending
A06 Account Blocked
A07 Session Expired
```

## Owner Web

``` text
O01 Dashboard
O02 Orders
O03 Order Detail
O04 Products
O05 Product Detail
O06 Add/Edit Product
O07 Categories
O08 Stock
O09 Stock Movement
O10 Purchases
O11 Purchase Detail
O12 Add Purchase
O13 Customers
O14 Customer Detail
O15 Customer Ledger
O16 Suppliers
O17 Sales
O18 Payments
O19 Create Invoice
O20 Invoice List
O21 Invoice Detail/Preview
O22 Reports
O23 Admin Users
O24 Permissions
O25 Business Settings
O26 Invoice Settings
O27 Tax Settings
O28 WhatsApp Settings
O29 Audit Logs
```

## Admin Web

``` text
AD01 Dashboard
AD02 Orders
AD03 Order Detail
AD04 Customers
AD05 Customer Detail
AD06 Products
AD07 Stock
AD08 Purchases
AD09 Billing
AD10 Create Invoice
AD11 Invoice Detail
AD12 Payments
AD13 Reports
AD14 Profile
```

## Customer Mobile

``` text
C01 Home
C02 Product List
C03 Product Detail
C04 Cart
C05 Checkout
C06 Order Success
C07 Order List
C08 Order Detail
C09 Order Tracking
C10 Invoice
C11 Payments
C12 Credit/Outstanding
C13 Payment History
C14 Profile
C15 Business Details
C16 Addresses
C17 Notifications
```

------------------------------------------------------------------------

# 69. Error Handling

Standard business error codes:

``` text
AUTH_INVALID_OTP
AUTH_OTP_EXPIRED
AUTH_TOO_MANY_ATTEMPTS
AUTH_UNAUTHORIZED
AUTH_FORBIDDEN

CUSTOMER_NOT_FOUND
CUSTOMER_NOT_APPROVED
CUSTOMER_BLOCKED

PRODUCT_NOT_FOUND
PRODUCT_INACTIVE
INSUFFICIENT_STOCK

ORDER_NOT_FOUND
ORDER_INVALID_STATUS
ORDER_CANNOT_CANCEL

INVOICE_NOT_FOUND
INVOICE_ALREADY_CANCELLED
INVOICE_INVALID_STATUS

PAYMENT_NOT_FOUND
PAYMENT_INVALID_AMOUNT

CREDIT_LIMIT_EXCEEDED

VALIDATION_ERROR
RESOURCE_NOT_FOUND
CONFLICT
RATE_LIMITED
INTERNAL_ERROR
```

------------------------------------------------------------------------

# 70. Security

Implement:

-   HTTPS in non-local environments
-   JWT/access + refresh token model
-   Role/permission authorization
-   Rate limiting
-   Input validation
-   SQL injection protection
-   XSS protection
-   CSRF strategy where applicable
-   CORS configuration
-   Secure headers
-   Secrets via environment/secret manager
-   File upload validation
-   Malware/content checks where appropriate
-   Audit logging
-   Sensitive-data minimization
-   No credentials in source code
-   No provider API secrets in clients

------------------------------------------------------------------------

# 71. File Storage

Invoices and uploaded images must not be stored permanently inside the
application container filesystem.

Use an object-storage abstraction:

``` text
StorageService
    ↓
Local Provider for development
    ↓
S3-compatible Provider for production
```

Store metadata in the database.

------------------------------------------------------------------------

# 72. Caching

Use caching selectively.

Good candidates:

-   Product catalog
-   Categories
-   Business settings
-   Tax configuration
-   Dashboard aggregates where safe

Never cache mutable financial balances in a way that can become the
source of truth.

Database remains authoritative.

------------------------------------------------------------------------

# 73. Background Jobs

Use asynchronous jobs for:

-   WhatsApp delivery
-   PDF generation when expensive
-   Report generation
-   Notifications
-   Payment reconciliation
-   Outstanding reminders
-   Retryable provider calls

Use an abstraction so queue technology can be changed later.

------------------------------------------------------------------------

# 74. Observability

Implement:

-   Structured logs
-   Request ID/correlation ID
-   Error tracking
-   Metrics
-   Health endpoint
-   Readiness endpoint
-   Liveness endpoint
-   Provider failure logs
-   Audit logs

Do not log OTPs, access tokens, refresh tokens, bank secrets, or
sensitive payment data.

------------------------------------------------------------------------

# 75. Testing Strategy

## Backend

-   Unit tests
-   Service tests
-   Repository tests
-   Controller/API tests
-   Security tests
-   Database integration tests
-   Financial calculation tests
-   Stock concurrency tests

## Web

-   Component tests
-   Feature tests
-   API integration tests
-   End-to-end tests

## Mobile

-   Component tests
-   Navigation tests
-   API integration tests
-   Critical user journey tests

## Critical E2E flows

``` text
Customer Registration
Login
Product browsing
Cart
Checkout
Order creation
Admin acceptance
Packing
Delivery
Invoice generation
Payment
Credit payment
WhatsApp send
Purchase
Stock update
Sales return
Purchase return
```

------------------------------------------------------------------------

# 76. Concurrency / Transaction Requirements

The following operations must be transactional:

### Order creation

Validate/reserve stock atomically.

### Purchase posting

Purchase + stock movement must succeed together.

### Invoice posting

Invoice + invoice items + tax + ledger must succeed together.

### Payment posting

Payment + allocation + customer ledger must succeed together.

### Sales return

Return + stock movement + credit/refund adjustment must succeed
together.

Use appropriate transaction isolation and optimistic locking.

------------------------------------------------------------------------

# 77. Idempotency

Idempotency is required for operations vulnerable to retries:

-   Payment callbacks
-   Payment creation
-   Invoice generation
-   WhatsApp sending
-   Order creation where retry can duplicate
-   External provider webhooks

Use idempotency keys/reference IDs.

------------------------------------------------------------------------

# 78. API Authorization Matrix

At minimum:

  Area                 Owner          Admin           Customer
  -------------------- -------------- --------------- -------------
  Owner dashboard      Yes            No              No
  Admin dashboard      Yes            Yes             No
  Customer dashboard   Own/customer   No              Own
  Products             Full           Manage          Read
  Purchase             Full           Manage          No
  Stock                Full           Manage/View     No
  Customers            Full           Manage          Own
  Suppliers            Full           Manage          No
  Orders               Full           Manage          Own
  Create invoice       Yes            Yes             No
  View invoices        All            All permitted   Own
  Payments             Full           Manage          Own
  Credit               Full           Manage          Own balance
  Reports              Full           Permitted       Own history
  Admin users          Yes            No by default   No
  Business settings    Yes            No by default   No
  Audit logs           Yes            Permitted       No

Exact permissions must be stored in the permission system.

------------------------------------------------------------------------

# 79. Business Settings

Business Settings screen:

``` text
Business Profile
├── Business Name
├── Logo
├── Address
├── Phone
├── Mobile
├── Email
├── GSTIN
├── PAN
├── State
└── State Code

Bank Details
├── Bank Name
├── Account Number
├── IFSC
└── Branch

Invoice Settings
├── Invoice Prefix
├── Numbering Sequence
├── Financial Year
├── Default Terms
├── Default Footer
└── Signature

Tax Settings
├── Tax Rates
├── Tax Calculation Mode
├── Intra-state Rules
└── Inter-state Rules

WhatsApp
├── Provider
├── Sender
├── Templates
└── Status

Notifications
├── Push
├── SMS
├── Email
└── WhatsApp
```

------------------------------------------------------------------------

# 80. Audit Logging

Audit important events:

``` text
LOGIN
LOGOUT
CUSTOMER_CREATED
CUSTOMER_APPROVED
CUSTOMER_BLOCKED
PRODUCT_CREATED
PRODUCT_UPDATED
PURCHASE_CREATED
PURCHASE_POSTED
STOCK_ADJUSTED
ORDER_CREATED
ORDER_ACCEPTED
ORDER_CANCELLED
INVOICE_CREATED
INVOICE_GENERATED
INVOICE_CANCELLED
PAYMENT_CREATED
PAYMENT_CANCELLED
RETURN_CREATED
RETURN_APPROVED
SETTINGS_CHANGED
ADMIN_CREATED
ADMIN_DEACTIVATED
```

Audit record:

``` text
id
actor_user_id
action
entity_type
entity_id
old_value
new_value
ip_address
user_agent
created_at
```

Sensitive values must be redacted.

------------------------------------------------------------------------

# 81. Environment Configuration

Never hardcode secrets.

Example:

``` text
APP_ENV
DATABASE_URL
DATABASE_USERNAME
DATABASE_PASSWORD

JWT_ACCESS_SECRET
JWT_REFRESH_SECRET

OTP_PROVIDER_URL
OTP_PROVIDER_KEY

WHATSAPP_PROVIDER_URL
WHATSAPP_PROVIDER_TOKEN

PAYMENT_PROVIDER_URL
PAYMENT_PROVIDER_KEY

OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
```

Use:

``` text
.env.example
```

with fake/example values only.

------------------------------------------------------------------------

# 82. Podman

Use Podman-compatible containers.

Development services may include:

``` text
backend
web
database
redis/cache
```

Optional:

``` text
queue worker
object storage emulator
```

Create:

``` text
Containerfile
podman-compose.yml
```

or equivalent Podman-compatible orchestration.

Do not make the application dependent on Docker-only features.

------------------------------------------------------------------------

# 83. Deployment

Target architecture:

``` text
Internet
   ↓
Reverse Proxy / Load Balancer
   ↓
Web Application
   ↓
Java API
   ↓
PostgreSQL
```

Optional:

``` text
Redis
Object Storage
Background Worker
Monitoring
```

Web and API should be independently deployable.

------------------------------------------------------------------------

# 84. CI/CD

Pipeline:

``` text
Commit
 ↓
Lint
 ↓
Unit Tests
 ↓
Integration Tests
 ↓
Build
 ↓
Security Checks
 ↓
Container Build
 ↓
Migration Validation
 ↓
Deploy Staging
 ↓
Smoke Tests
 ↓
Production Approval
 ↓
Deploy
```

Database migrations must be version controlled.

------------------------------------------------------------------------

# 85. Logging and Monitoring

Minimum endpoints:

``` text
/actuator/health
/actuator/health/readiness
/actuator/health/liveness
```

Use structured JSON logs in production.

Each request should have a request/correlation ID.

------------------------------------------------------------------------

# 86. Data Retention

Financial records must be retained according to applicable
business/legal requirements.

Retention policy must be configurable.

Do not delete:

-   Posted invoices
-   Posted payments
-   Stock movements
-   Ledger entries
-   Audit logs

Use cancellation/reversal/adjustment mechanisms.

------------------------------------------------------------------------

# 87. Seed Data

Development seed data should include:

Roles:

``` text
OWNER
ADMIN
CUSTOMER
```

Permissions:

``` text
DASHBOARD_VIEW
PRODUCT_READ
PRODUCT_WRITE
STOCK_READ
STOCK_WRITE
PURCHASE_READ
PURCHASE_WRITE
CUSTOMER_READ
CUSTOMER_WRITE
ORDER_READ
ORDER_WRITE
INVOICE_READ
INVOICE_WRITE
PAYMENT_READ
PAYMENT_WRITE
REPORT_READ
USER_MANAGE
SETTINGS_MANAGE
AUDIT_READ
```

Seed sample categories/products only for development.

Never seed real customer/payment information.

------------------------------------------------------------------------

# 88. Repository Structure

## Canonical Repository Name

Use this repository name:

```text
shopflow-platform
```

Recommended monorepo:

``` text
shopflow-platform/
│
├── README.md
├── APPLICATION-ARCHITECTURE.md
├── .gitignore
├── .env.example
├── podman-compose.yml
│
├── backend/
│   ├── pom.xml
│   └── src/
│
├── web/
│   ├── package.json
│   └── src/
│
├── mobile/
│   ├── package.json
│   └── src/
│
├── docs/
│   ├── openapi/
│   │   └── openapi.yaml
│   ├── postman/
│   │   └── shopflow-platform.postman_collection.json
│   ├── decisions/
│   └── business-rules/
│
├── infrastructure/
│   ├── podman/
│   └── deployment/
│
└── scripts/
```

------------------------------------------------------------------------

# 89. Naming Conventions

Backend:

``` text
camelCase
PascalCase classes
UPPER_SNAKE_CASE enums
```

Database:

``` text
snake_case
plural table names
```

API:

``` text
kebab-case resource paths
```

Examples:

``` text
/api/v1/customer-credit
/api/v1/order-status-history
```

Frontend:

``` text
PascalCase components
camelCase functions
camelCase variables
```

------------------------------------------------------------------------

# 90. API-to-UI Mapping

Every major UI screen must have a documented API mapping.

Example:

``` text
Owner Dashboard
    ↓
GET /api/v1/dashboard/owner

Product List
    ↓
GET /api/v1/products

Create Product
    ↓
POST /api/v1/products

Customer Detail
    ↓
GET /api/v1/customers/{id}

Customer Ledger
    ↓
GET /api/v1/customers/{id}/ledger

Create Invoice
    ↓
POST /api/v1/invoices

Invoice PDF
    ↓
GET /api/v1/invoices/{id}/pdf

Send WhatsApp
    ↓
POST /api/v1/invoices/{id}/send-whatsapp
```

------------------------------------------------------------------------

# 91. Agent Implementation Order

Claude must implement the project in the following order. **Do not start mobile development before the Web + Backend acceptance gate.**

## Phase 1 — Repository and Foundation

- Create the repository structure.
- Create Java/Spring Boot/Maven backend.
- Create React/TypeScript web application.
- Create the mobile project directory only as a reserved workspace; do not implement mobile features yet.
- Configure PostgreSQL.
- Configure Flyway.
- Configure Podman.
- Configure local environment files.
- Configure logging and error handling.
- Configure OpenAPI.
- Configure Postman collection structure.
- Configure CI checks.
- Configure test infrastructure.

## Phase 2 — Authentication and Authorization

- Mobile-number authentication.
- OTP request.
- OTP verification.
- Mock OTP provider.
- Access token.
- Refresh token.
- Session/revocation handling.
- OWNER / ADMIN / CUSTOMER roles.
- Permission model.
- Customer registration.
- Customer approval/activation.
- Rate limiting and abuse controls.

## Phase 3 — Business Master Data

- Business settings.
- Customers.
- Customer pricing.
- Suppliers.
- Categories.
- Products.
- Product tax configuration.
- Product stock thresholds.
- Customer credit profile.

## Phase 4 — Inventory and Purchasing

- Opening stock.
- Purchase entry.
- Purchase invoice/reference.
- Stock receipt.
- Stock movements.
- Stock adjustments.
- Low-stock reporting.
- Supplier ledger where applicable.

## Phase 5 — Customer Ordering

- Product catalog.
- Product detail.
- Customer-specific pricing.
- Cart.
- Checkout.
- Payment selection.
- Credit validation.
- Order creation.
- Stock reservation.
- Admin acceptance.
- Packing.
- Ready for delivery.
- Dispatch.
- Delivery.
- Cancellation.

## Phase 6 — Billing and Finance

- Sales invoice.
- Manual invoice.
- Invoice numbering.
- GST/tax calculation.
- Discounts.
- Round-off.
- Invoice PDF.
- Payment records.
- Mock payment gateway.
- Cash payment.
- Credit payment.
- Partial payment.
- Customer ledger.
- Outstanding balance.
- Payment allocation.
- Credit/debit note foundation.

## Phase 7 — Mock Notifications and Integrations

- Mock WhatsApp provider.
- Mock invoice document delivery.
- Mock delivery-status webhooks.
- Mock OTP provider.
- Mock payment provider.
- Mock e-invoice provider where applicable.
- Retry mechanism.
- Idempotency.
- Timeout handling.
- Circuit-breaker-ready abstraction.
- Audit trail.

## Phase 8 — Dashboard and Reports

- Owner dashboard.
- Admin dashboard.
- Sales report.
- Purchase report.
- Stock report.
- Profit report.
- GST/tax report.
- Customer report.
- Outstanding report.
- Payment report.
- Customer transaction history.

## Phase 9 — Web Acceptance Gate

The web + backend system must pass:

- unit tests
- integration tests
- API tests
- Postman tests
- web component tests
- web E2E tests
- security tests
- concurrency tests
- financial calculation tests
- stock tests
- invoice PDF tests
- mock payment tests
- mock WhatsApp tests
- mock OTP tests
- backup/restore tests
- Podman environment test

**Only after this phase is formally accepted should mobile implementation begin.**

## Phase 10 — Production Provider Integration

After web + backend acceptance:

- production OTP provider
- official WhatsApp Business Platform
- payment gateway
- e-invoice/IRP/GSP integration when applicable
- production object storage
- production monitoring
- production alerting
- production secrets

Each integration must be enabled through configuration and must not require changes to core business logic.

## Phase 11 — React Native Mobile

- React Native/TypeScript foundation.
- Authentication.
- Customer registration.
- Product catalog.
- Product detail.
- Cart.
- Checkout.
- Payment.
- Credit/outstanding.
- Order history.
- Order tracking.
- Invoice access.
- Notifications.
- Mobile security hardening.
- Android testing.
- iOS testing.

## Phase 12 — Final Production Hardening

- penetration testing
- dependency scanning
- container scanning
- secret scanning
- SAST
- DAST
- load testing
- backup verification
- disaster recovery test
- production observability
- final audit review
- release checklist

------------------------------------------------------------------------

# 92. Agent Rules for Implementation

The AI agent must:

1.  Never skip migrations.
2.  Never create direct database writes from frontend.
3.  Never put business calculations in React/React Native.
4.  Never trust client-side prices, totals, taxes or permissions.
5.  Always recalculate financial totals on backend.
6.  Never expose purchase cost to customers.
7.  Never hard-delete financial records.
8.  Never modify posted invoice history without reversal/cancellation
    flow.
9.  Never create duplicate API logic across web/mobile.
10. Use the shared backend for all business logic.
11. Keep OpenAPI updated.
12. Keep Postman updated.
13. Keep tests updated.
14. Follow the UI design system.
15. Use reusable components.
16. Support loading/empty/error states.
17. Use transactions for financial/inventory operations.
18. Use idempotency for retryable external operations.
19. Never hardcode secrets.
20. Never invent new roles without documenting them.
21. Never change an established state machine without updating this
    document and tests.
22. Never silently change tax calculations.
23. Never silently change invoice numbering.
24. Record architecture decisions when an ambiguity requires a choice.

------------------------------------------------------------------------

# 93. Business Rules That Must Remain Centralized

The backend must own:

``` text
Price calculation
Discount calculation
Tax calculation
Invoice total
Payment allocation
Outstanding balance
Credit limit validation
Stock validation
Stock movement
Order state transitions
Invoice state transitions
Customer ledger
Supplier ledger
Profit calculation
```

Clients only display and collect input.

------------------------------------------------------------------------

# 94. Important Data Snapshots

Historical documents must preserve historical values.

Invoice must snapshot:

-   Seller details
-   Buyer details
-   Product description
-   HSN/SAC
-   Rate
-   Discount
-   Tax rate
-   Tax amount
-   Quantity
-   Unit
-   Totals

Do not render old invoices from current product/customer master data.

------------------------------------------------------------------------

# 95. External Integrations

Use provider interfaces:

``` text
OtpProvider
PaymentProvider
WhatsAppProvider
StorageProvider
NotificationProvider
Tax/EInvoiceProvider
```

The core application must not depend directly on one vendor
implementation.

Provider-specific code belongs in infrastructure/integration modules.

------------------------------------------------------------------------

# 96. Payment Gateway

Online payment integration is initially abstracted.

Required flow:

``` text
Create Payment Intent
→ Customer Payment
→ Provider Callback/Webhook
→ Verify Signature
→ Idempotency Check
→ Update Payment
→ Allocate Payment
→ Update Invoice
→ Update Customer Ledger
```

Never mark a payment as successful solely from a client-side response.

------------------------------------------------------------------------

# 97. Webhook Security

For external callbacks:

-   Verify provider signature
-   Validate event ID
-   Check idempotency
-   Store raw event metadata safely
-   Process transactionally
-   Return appropriate status
-   Retry safely

------------------------------------------------------------------------

# 98. Invoice Number Example

Example configuration:

``` text
Prefix: INV
Financial Year: 2026-27
Starting Number: 1
```

Generated:

``` text
INV/2026-27/000001
INV/2026-27/000002
INV/2026-27/000003
```

Other document sequences should be independent:

``` text
ORD/2026-27/000001
PUR/2026-27/000001
PAY/2026-27/000001
CN/2026-27/000001
DN/2026-27/000001
```

Exact formats are configurable.

------------------------------------------------------------------------

# 99. Invoice Sample Reference

The supplied sample invoices are visual references.

The implementation should accommodate the following concepts shown in
the samples:

-   Tax Invoice
-   Original
-   Seller logo
-   Seller details
-   GSTIN
-   Contact details
-   Buyer details
-   Invoice number
-   Invoice date
-   Credit Bill
-   Payment terms
-   Buyer order number
-   Delivery note
-   Transport
-   Vehicle number
-   Destination
-   HSN/SAC
-   Quantity
-   Rate
-   Unit
-   Discount
-   GST
-   CGST
-   SGST
-   IGST where applicable
-   Round-off
-   Net amount
-   Amount in words
-   Tax amount in words
-   Bank details
-   Declaration
-   Terms and conditions
-   Authorized signature
-   QR/e-invoice information where applicable
-   Computer-generated invoice marker

The application should provide configurable invoice templates rather
than hardcoding one physical paper format.

------------------------------------------------------------------------

# 100. UX Flow Summary

## Owner

``` text
Login
→ Dashboard
→ Monitor Business
→ Sales/Purchases/Stock
→ Customer Credit
→ Reports
→ Settings
```

## Admin

``` text
Login
→ Dashboard
→ Customer/Product/Purchase Operations
→ Order Management
→ Billing
→ Payments
→ Delivery
→ Reports
```

## Customer

``` text
Login
→ Browse
→ Product
→ Cart
→ Checkout
→ Payment/Credit
→ Order Tracking
→ Invoice
→ Outstanding
```

------------------------------------------------------------------------

# 101. End-to-End Business Flow

``` text
                    SUPPLIER
                       │
                       ▼
                   PURCHASE
                       │
                       ▼
                   STOCK IN
                       │
                       ▼
                  PRODUCT CATALOG
                       │
                       ▼
                    CUSTOMER
                       │
                       ▼
                 CREATE ORDER
                       │
                       ▼
                 ADMIN ACCEPT
                       │
                       ▼
                    INVOICE
                       │
              ┌────────┴────────┐
              ▼                 ▼
          PAYMENT             CREDIT
              │                 │
              └────────┬────────┘
                       ▼
                    PACKING
                       │
                       ▼
              READY FOR DELIVERY
                       │
                       ▼
               OUT FOR DELIVERY
                       │
                       ▼
                  DELIVERED
                       │
                       ▼
                  COMPLETED
                       │
                       ▼
                  STOCK OUT
                       │
                       ▼
              CUSTOMER LEDGER
                       │
                       ▼
           REPORTS / PROFIT / TAX
```

------------------------------------------------------------------------

# 102. Required Documentation Deliverables

The completed repository must contain:

``` text
README.md
APPLICATION-ARCHITECTURE.md

docs/
├── openapi/
│   └── openapi.yaml
├── postman/
│   └── shopflow-platform.postman_collection.json
├── database/
│   └── erd.md
├── business-rules/
│   ├── orders.md
│   ├── billing.md
│   ├── inventory.md
│   ├── payments.md
│   └── credit.md
└── decisions/
    └── DECISIONS.md
```

------------------------------------------------------------------------

# 103. Definition of Production Readiness

The application is production-ready only when:

-   Authentication is secure.
-   Role/permission enforcement is tested.
-   Database migrations are reproducible.
-   Financial calculations are tested.
-   Inventory calculations are tested.
-   Invoice generation is tested.
-   Credit ledger is tested.
-   Payment reconciliation is tested.
-   Order state transitions are tested.
-   Return flows are tested.
-   API documentation is complete.
-   Postman collection is complete.
-   Web is responsive.
-   Mobile is responsive across supported devices.
-   Accessibility basics are implemented.
-   Error monitoring exists.
-   Backups exist.
-   Secrets are externalized.
-   External webhooks are verified.
-   WhatsApp failures are retryable.
-   Audit logs exist.
-   No critical security vulnerabilities remain.

------------------------------------------------------------------------

# 104. Open Decisions / Configurable Areas

The following should remain configurable until business rules are
finalized:

1.  Exact OTP provider.
2.  Exact WhatsApp provider.
3.  Exact online payment gateway.
4.  Exact object-storage provider.
5.  Exact queue provider.
6.  Exact tax/e-invoice integration provider.
7.  Credit approval policy.
8.  Credit limit override policy.
9.  Delivery-person workflow.
10. Customer-specific pricing.
11. Partial delivery invoicing policy.
12. Sales-return approval policy.
13. Purchase-return policy.
14. Exact invoice visual template.
15. Exact business/shop branding.
16. Financial-year numbering configuration.

The agent must not block core development on these integrations.
Implement provider interfaces and local/mock implementations first where
necessary.

------------------------------------------------------------------------

# 107. Mock-First External Integration Architecture

All third-party integrations must be replaceable through interfaces. The first development release uses mocks only.

```text
Core Business Logic
        |
        +--> OtpService
        |      +--> MockOtpProvider
        |      +--> ProductionOtpProvider
        |
        +--> PaymentService
        |      +--> MockPaymentGateway
        |      +--> RazorpayPaymentGateway
        |
        +--> WhatsAppService
        |      +--> MockWhatsAppProvider
        |      +--> MetaWhatsAppCloudProvider
        |
        +--> EInvoiceService
               +--> MockEInvoiceProvider
               +--> ProductionEInvoiceProvider
```

Vendor SDKs must not be imported by domain/business modules.

# 108. OTP Login — Exact Implementation Contract

The backend owns OTP authentication. The OTP vendor only delivers the OTP in production.

## Request OTP

```http
POST /api/v1/auth/otp/request
```

```json
{
  "mobileNumber": "+919999999999"
}
```

Backend must normalize the number, apply rate limits, generate a secure OTP, store only a protected representation, set expiry/attempt limits/resend cooldown, call `OtpProvider`, and return a safe response.

## Verify OTP

```http
POST /api/v1/auth/otp/verify
```

```json
{
  "mobileNumber": "+919999999999",
  "otp": "482731",
  "requestId": "otp-request-uuid"
}
```

Backend must verify expiry, request ID, attempts and OTP; invalidate the used OTP; identify the user; verify status; load role/permissions; create the session; issue access/refresh tokens; and audit the event.

The client must never choose its role.

## OTP test matrix

```text
Correct OTP              -> success
Wrong OTP                -> rejected
Expired OTP              -> rejected
Too many attempts        -> rejected/locked
Resend cooldown          -> rejected
Old OTP after resend     -> rejected
Blocked user             -> rejected
Pending customer         -> configured pending behavior
Provider timeout         -> failure/retry path
Repeated requests        -> rate limited
Concurrent verification  -> safe/idempotent behavior
```

Development may expose a test-only OTP view/log, but there must be no universal production bypass such as `123456`.

# 109. WhatsApp — Official Production Boundary

No real WhatsApp messages are sent during initial development.

Production should use the official WhatsApp Business Platform/Cloud API or a documented provider adapter implementing the same interface.

## Invoice delivery flow

```text
Admin creates/approves invoice
        ↓
Invoice snapshot finalized
        ↓
PDF generated
        ↓
PDF stored
        ↓
WhatsAppService
        ↓
WhatsAppProvider
        ↓
Customer WhatsApp
        ↓
Provider webhook
        ↓
SENT / DELIVERED / READ / FAILED
```

Persist:

- invoice ID
- customer ID
- recipient number
- provider
- provider message ID
- template ID when applicable
- media/document ID when applicable
- sent timestamp
- delivery status
- failure reason
- retry count
- webhook event ID

Production template concepts:

- invoice created
- invoice accepted
- order confirmed
- order packed
- order dispatched
- delivery completed
- payment received
- payment pending
- payment reminder

Provider credentials remain server-side only. Webhook signatures must be verified.

# 110. Payment Gateway — Mock First

Order state, payment state, and customer ledger state are separate concepts.

> **Resolved (see `docs/decisions/DECISIONS.md` D-001, D-002):** the canonical order state machine is the one in
> §7.2 (`PLACED … OUT_FOR_DELIVERY … COMPLETED`, plus `CANCELLED`, `REJECTED`, `DELIVERY_FAILED`); in the list below
> `PENDING` means `PLACED` and `DISPATCHED` means `OUT_FOR_DELIVERY`. Payment status has two levels: §8 statuses
> apply to orders and invoices; the payment states below apply to individual payment transactions (plus `CANCELLED`
> for a voided manual payment). The payment method `UPI_MANUAL` below is `UPI` from §9.

## Order states

```text
PENDING
ACCEPTED
PACKING
READY_FOR_DELIVERY
DISPATCHED
DELIVERED
CANCELLED
```

## Payment states

```text
UNPAID
PENDING
AUTHORIZED
CAPTURED
PARTIALLY_PAID
FAILED
REFUNDED
```

## Payment methods

```text
ONLINE
CASH
CREDIT
BANK_TRANSFER
UPI_MANUAL
OTHER
```

## Online flow

```text
Checkout
  ↓
Backend creates provider order/payment intent
  ↓
Customer pays
  ↓
Client receives provider response
  ↓
Backend verifies signature
  ↓
Provider webhook received
  ↓
Webhook signature verified
  ↓
Idempotency check
  ↓
Payment updated
  ↓
Invoice/order/ledger updated
```

A client-side success response is never sufficient to mark payment captured.

Mock payment must simulate SUCCESS, FAILED, PENDING, CANCELLED, TIMEOUT, duplicate webhook, out-of-order webhook, invalid signature, provider unavailable, partial payment, and refund.

# 111. Razorpay Production Adapter

Razorpay is the initial production payment-gateway candidate. Keep it behind `PaymentGateway`.

The adapter must support provider order creation, server-side signature verification, webhook verification, provider ID persistence, duplicate-event handling, retry-safe processing, reconciliation, and refunds where required.

Never place payment secrets in React or React Native. Use test mode before live mode. Never hard-code gateway pricing into application business rules.

# 112. GST / E-Invoice Architecture

The invoice engine must never fabricate government-issued identifiers.

If e-invoicing is legally applicable:

```text
Invoice finalized
      ↓
EInvoiceService
      ↓
IRP / authorized integration
      ↓
IRN / acknowledgement / signed QR data
      ↓
Persist response
      ↓
Invoice/PDF updated with valid data
```

Development uses `MockEInvoiceProvider`. Test identifiers must be marked TEST ONLY and must never be represented as government-issued IRNs.

Persist an explicit status such as:

```text
REAL_IRN
TEST_IRN
NOT_APPLICABLE
PENDING
FAILED
```

Applicability must be confirmed before production activation.

# 113. External Provider Failure Handling

Every external integration must have:

- bounded timeout
- retry with exponential backoff and jitter where safe
- idempotency
- provider event ID storage
- failed-job/manual-retry handling
- audit metadata
- circuit-breaker-ready design
- monitoring and alerting

WhatsApp outage must not prevent order creation, invoice creation, payment recording, or stock updates.

# 114. Security and Vulnerability Requirements

Security testing is mandatory before production activation.

## Authentication

- OTP brute-force protection
- OTP rate limiting
- refresh-token rotation
- session revocation
- secure token storage
- no token/OTP logging

## Authorization

- server-side role checks
- permission checks
- object-level authorization
- customer data isolation
- Owner-only configuration protection

## API

- input validation
- SQL injection protection
- XSS protection
- CORS policy
- secure headers
- request size limits
- file upload validation
- path traversal protection
- rate limiting
- idempotency

## Web

- safe token handling
- protected routes
- XSS protection
- CSRF protection where applicable
- no secrets in bundles
- dependency scanning

## Mobile

Use OWASP MASVS as the security baseline. Test secure storage, TLS/network security, deep links, sensitive logs, local data, dependency vulnerabilities, and appropriate reverse-engineering resilience.

## Webhooks

Every production webhook must verify signature, event ID, event type, expected resource IDs, and idempotency before applying a state change.

## CI security

Run Java dependency scanning, npm/mobile dependency scanning, secret scanning, SAST, container image scanning, and DAST against staging where appropriate.

# 115. Paid Services — Activation Policy

Production is expected to use paid or usage-based services, but they are not required for initial mock development.

| Service | Development | Production |
|---|---|---|
| OTP/SMS | Mock | Paid/usage-based provider |
| WhatsApp | Mock | Meta/approved provider usage fees |
| Online payment | Mock | Gateway transaction fees |
| E-invoice | Mock | Authorized integration route if applicable |
| Database | Local container | Production infrastructure |
| Object storage | Local/MinIO-compatible | Production storage |
| Monitoring | Local logs | Production monitoring/alerting |
| Domain/TLS | Localhost | Production domain/TLS |
| Backups | Local test | Production backup storage |

Do not hard-code vendor prices. Maintain:

```text
docs/third-party-costs.md
```

For each provider record plan, region, price-check date, usage fees, setup/monthly fees, taxes, limits, support/SLA, retention, and exit process. Re-check prices before launch.

# 116. Production Provider Selection Checklist

Before enabling a real provider, verify:

- official documentation
- sandbox/test environment
- production environment
- authentication and credential rotation
- webhooks and signature verification
- rate limits
- retry behavior
- idempotency
- API versioning
- SLA/support
- security/privacy documentation
- data retention/residency where relevant
- incident communication
- reconciliation/export capability
- vendor lock-in and exit strategy

Record the final provider decision in `docs/DECISIONS.md`.

# 117. Repository Setup Instructions

Use this repository name:

```text
shopflow-platform
```

Repository layout:

```text
shopflow-platform/
├── APPLICATION-ARCHITECTURE.md
├── README.md
├── backend/
├── web/
├── mobile/
├── docs/
├── infrastructure/
├── scripts/
└── .gitignore
```

Create/clone it with:

```bash
git clone <your-repository-url> shopflow-platform
cd shopflow-platform
```

The initial implementation priority is:

```text
backend + web + PostgreSQL + tests + Podman
```

Mobile implementation starts only after the Web + Backend Acceptance Gate.

# 118. Recommended Git Branch Strategy

```text
main
  ↑
develop
  ↑
feature/*
```

Examples:

```text
feature/auth-otp
feature/customer-management
feature/product-catalog
feature/inventory
feature/orders
feature/invoices
feature/payments
feature/reports
feature/whatsapp-mock
feature/mobile-app
```

Rules:

- no unreviewed direct production changes to `main`
- every feature passes tests
- schema changes include migrations
- API changes update OpenAPI/Postman
- financial changes require focused tests
- security/auth changes require security tests

# 119. Web + Backend Acceptance Gate

This is the formal gate before mobile development.

```text
[ ] Clean checkout starts backend
[ ] Clean checkout starts web
[ ] PostgreSQL starts in Podman
[ ] Flyway migrations succeed
[ ] Seed data loads
[ ] OTP mock works
[ ] Owner login works
[ ] Admin login works
[ ] Customer registration works
[ ] Customer approval works
[ ] Product CRUD works
[ ] Customer-specific pricing works
[ ] Purchase flow works
[ ] Stock movement is correct
[ ] Cart works
[ ] Checkout works
[ ] Credit validation works
[ ] Order workflow works
[ ] Invoice generation works
[ ] Invoice numbering works
[ ] GST/tax calculation tests pass
[ ] Invoice PDF matches approved design
[ ] Cash payment works
[ ] Credit payment works
[ ] Mock online payment works
[ ] Customer ledger works
[ ] Outstanding balance works
[ ] Mock WhatsApp works
[ ] Owner reports work
[ ] Admin reports work
[ ] Audit logs work
[ ] OpenAPI is complete
[ ] Postman collection is complete
[ ] Web E2E tests pass
[ ] Backend integration tests pass
[ ] Security checks pass
[ ] No critical dependency vulnerabilities
[ ] Backup/restore test passes
[ ] Podman clean-start test passes
```

Record acceptance in:

```text
docs/RELEASE-GATES.md
```

Only after acceptance begin serious React Native implementation.

# 120. Production Activation Gate

Do not enable production services merely because development is complete.

For each provider:

```text
[ ] Production account verified
[ ] Business/KYC requirements completed where applicable
[ ] Credentials stored securely
[ ] Secrets absent from source control
[ ] Sandbox tests passed
[ ] Production webhook configured
[ ] Webhook signature verification tested
[ ] Retry/idempotency tested
[ ] Rate limits documented
[ ] Pricing documented
[ ] Failure handling tested
[ ] Monitoring configured
[ ] Alerting configured
[ ] Rollback/disable switch tested
[ ] Reconciliation procedure documented
```

Enable providers independently so any provider can be disabled without taking down the core application.

# 121. Final Implementation Principle

The finished application must feel like one coherent premium business product across:

```text
React Web
     +
React Native Mobile
     +
Java Backend
     +
PostgreSQL
     +
Podman
```

The backend is authoritative for authentication, authorization, products, prices, discounts, tax, stock, orders, invoices, payments, credit, ledger, reports, and audit.

The UI must never become the source of truth for business-critical calculations.

# 122. Final Agent Instruction

Before implementing any feature, the coding agent must answer internally:

```text
1. Which role uses this?
2. Which screen uses this?
3. Which API supports this?
4. Which database tables store this?
5. What validation is required?
6. What permission is required?
7. What business state changes?
8. Does this affect stock?
9. Does this affect money?
10. Does this affect tax?
11. Does this affect customer/supplier ledger?
12. Does this require audit logging?
13. Does OpenAPI need updating?
14. Does Postman need updating?
15. What tests are required?
```

If the answer affects financial, inventory, authentication, authorization, or transaction rules, implement it in the backend first and then expose it to clients.

**End of APPLICATION-ARCHITECTURE.md**
