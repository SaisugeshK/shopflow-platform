# ShopFlow Platform

Wholesale/retail shop management: customers, products, stock, purchases, orders, GST invoices, payments, credit,
WhatsApp invoice delivery, reports and an audit trail — one Java backend serving a React web app now and a React
Native app later.

`APPLICATION-ARCHITECTURE.md` is the build contract. Decisions made where it was ambiguous are in
[`docs/decisions/DECISIONS.md`](docs/decisions/DECISIONS.md). Acceptance status is in
[`docs/RELEASE-GATES.md`](docs/RELEASE-GATES.md).

| Part | Stack | Folder |
|---|---|---|
| API | Java 21, Spring Boot 4.1, Spring Security (JWT), JPA/Hibernate 7, Flyway, OpenPDF | `backend/` |
| Database | PostgreSQL 17/18 | migrations in `backend/src/main/resources/db/migration` |
| Web | React 19, TypeScript, Vite, TanStack Query, Recharts, Motion | `web/` |
| Mobile | React Native (starts after the web + backend gate) | `mobile/` |
| Containers | Podman (`Containerfile`s, `podman-compose.yml`) | root, `infrastructure/` |

**Stage 1 uses mock providers only**: OTP, payment gateway, WhatsApp and e-invoice never contact real services and
never move money or send messages.

## Quick start (local)

Prerequisites: JDK 21, Node 24, PostgreSQL (local or Podman).

1. **Configure.** `cp .env.example .env` and set `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
   (the `.env` file is git-ignored). Create the database: `createdb shopflow` (and `shopflow_test` for tests).
2. **Backend** (dev profile: mock providers + fictitious seed data):
   ```bash
   cd backend
   ./mvnw spring-boot:run          # http://localhost:8080 · Swagger UI /swagger-ui.html
   ```
3. **Web**:
   ```bash
   cd web
   npm ci
   npm run dev                     # http://localhost:5173 (proxies /api to :8080)
   ```
4. **Sign in** with a seed account — the OTP is printed in the backend log and returned by
   `GET /api/v1/dev/otp/latest?mobileNumber=…` (development only):

   | Role | Mobile | Lands on |
   |---|---|---|
   | Owner | 9000000001 | `/app` owner dashboard |
   | Admin | 9000000002 | `/app` operations dashboard |
   | Customer (approved, credit ₹50,000) | 9000000003 | `/shop` |
   | Customer (pending approval) | 9000000004 | registration status |
   | New number | any other | customer registration |

## Quick start (Podman)

```bash
cp .env.example .env               # set POSTGRES_PASSWORD and all secrets
podman compose up --build          # web http://localhost:8081 · API http://localhost:8080 · DB localhost:5433
```

On Windows, if `localhost` port forwarding from the Podman machine does not work, use the machine IP
(`podman machine ssh ip -4 addr show eth0`).

## Tests

| Suite | Command | What it covers |
|---|---|---|
| Backend unit + integration | `cd backend && ./mvnw verify` | tax engine, amounts in words, numbering, state machine, OTP matrix, token rotation, authorization, orders, stock concurrency, invoices, payments/webhooks, returns, purchases, reports, audit (real PostgreSQL: `TEST_DATABASE_URL` or Testcontainers) |
| Web unit/component | `cd web && npm test` | formatting, API helpers, UI states, accessibility behaviour |
| Web E2E | `cd web && npm run e2e` (backend running; `PW_CHANNEL=chrome` to use installed Chrome) | order-to-cash in the browser, authorization, pending customer |
| API smoke | `python scripts/smoke_test.py http://localhost:8080` | end-to-end API flow incl. mock online payment and refunds |
| Postman | `npx newman run docs/postman/shopflow-platform.postman_collection.json -e docs/postman/shopflow-platform.local.postman_environment.json` | contract checks for every read endpoint + order-to-cash workflow |
| Backup/restore | `scripts/backup-restore-test.sh shopflow` | dump → restore to scratch DB → compare financial totals |

The OTP endpoints are rate limited (5 requests per number per 15 minutes, 30 per IP per hour). Re-running suites
quickly against the same backend can hit these limits; restart the backend or wait.

## API documentation

* OpenAPI: [`docs/openapi/openapi.yaml`](docs/openapi/openapi.yaml) (exported from the running app; live at
  `/v3/api-docs` in non-production profiles).
* Postman: `docs/postman/` — regenerate with `node scripts/generate-postman.mjs` after exporting
  `docs/openapi/openapi.json`.
* Envelope: `{ success, data, message, pagination?, error: { code, message, details }?, requestId }`.

## Repository layout

```
backend/            Spring Boot API (modules: auth, users, business, customers, suppliers, products, inventory,
                    purchases, orders, billing, payments, returns, reports, dashboard, notifications, audit,
                    files, integrations/{otp,payment,whatsapp,einvoice,storage})
web/                React web app (Owner/Admin app under /app, customer portal under /shop)
mobile/             Reserved for the React Native app
docs/               OpenAPI, Postman, ERD, business rules, decisions, release gates, third-party costs
infrastructure/     Podman and deployment notes
scripts/            smoke test, Postman generator, backup/restore
```

## Security notes

* Secrets only via environment (`.env` locally, a secret manager in production). The `prod` profile disables
  Swagger, API docs and all `/api/v1/dev/**` helpers, and requires every secret to be set.
* Access tokens live in memory in the browser; refresh tokens are HttpOnly cookies (web) or secure storage (mobile).
* Financial and audit history cannot be deleted (application rules plus database triggers).
