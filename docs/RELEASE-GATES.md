# Release Gates

Acceptance record for the gates defined in `APPLICATION-ARCHITECTURE.md` §119 (Web + Backend Acceptance) and §120 (Production Activation).

Legend: `[x]` verified, `[~]` works but has a noted caveat, `[ ]` not done.

## §119 Web + Backend Acceptance Gate

Evaluated: 2026-09-28, on Windows 11 with JDK 21, Node, Podman 5.8, and local PostgreSQL 18. All providers were running in mock mode.

```text
[~] Clean checkout starts backend      – built and started from the working tree; not yet re-run from a fresh clone (nothing committed yet)
[~] Clean checkout starts web          – same caveat as above
[x] PostgreSQL starts in Podman        – podman compose: database healthy
[x] Flyway migrations succeed          – V1..V7 on empty DB (Podman + integration tests clean+migrate)
[x] Seed data loads                    – V9000 dev seed (dev profile only)
[x] OTP mock works                     – AuthIntegrationTest, smoke test, E2E
[x] Owner login works
[x] Admin login works
[x] Customer registration works
[x] Customer approval works
[x] Product CRUD works
[x] Customer-specific pricing works
[x] Purchase flow works                – PurchaseAndReportsIntegrationTest
[x] Stock movement is correct          – reservation / release / sale / purchase / return movements asserted
[x] Cart works
[x] Checkout works
[x] Credit validation works
[x] Order workflow works               – §7.2 states, OrderStatusTest + OrderFlowIntegrationTest
[x] Invoice generation works
[x] Invoice numbering works            – gap-free per-series sequence, concurrency tested
[x] GST/tax calculation tests pass     – TaxCalculatorTest (intra/inter-state, rounding)
[ ] Invoice PDF matches approved design – PDF renders; no approved design has been signed off yet (owner review needed)
[x] Cash payment works
[x] Credit payment works
[x] Mock online payment works          – signed mock webhook, idempotent replay (OnlinePaymentIntegrationTest)
[x] Customer ledger works              – append-only; DB triggers block update/delete
[x] Outstanding balance works
[x] Mock WhatsApp works
[x] Owner reports work
[x] Admin reports work                 – owner-only reports hidden/forbidden for admin (E2E)
[x] Audit logs work
[x] OpenAPI is complete                – docs/openapi/openapi.{yaml,json}
[x] Postman collection is complete     – Newman: 80 requests, 181 assertions, 0 failures
[x] Web E2E tests pass                 – Playwright 4/4, both against the Vite dev server and the Podman stack
[x] Backend integration tests pass     – 86/86
[~] Security checks pass               – see "Security" below
[~] No critical dependency vulnerabilities – npm audit: 0; backend has no automated dependency scan yet
[x] Backup/restore test passes         – scripts/backup-restore-test.sh
[x] Podman clean-start test passes     – images build, stack starts, smoke test + E2E pass through nginx
```

### Verification commands

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd backend && ./mvnw verify` | 86 passed |
| Web unit tests | `cd web && npm test` | 13 passed |
| Web type-check / build | `cd web && npm run build` | clean |
| Web lint | `cd web && npm run lint` | warnings only, no errors |
| E2E (dev) | `cd web && PW_CHANNEL=chrome npx playwright test` | 4 passed |
| E2E (Podman) | `E2E_BASE_URL=http://<host>:8081 PW_CHANNEL=chrome npx playwright test` | 4 passed |
| API smoke | `python scripts/smoke_test.py` | passed (local and Podman) |
| Postman | `newman run docs/postman/...` | 0 failures |
| Backup/restore | `scripts/backup-restore-test.sh` | passed |

### Security

Verified:

- OTP rate limits and cooldowns are enforced (they were hit during test runs, as designed).
- Registration tokens cannot call general endpoints.
- The refresh token is an HttpOnly, SameSite=Strict cookie, sent only to web clients.
- Webhook signature verification is in place.
- Security headers and CSP are served by nginx on every route.
- CORS rejects foreign origins.
- `.env` is git-ignored, and no secrets are in tracked files.

Open:

- No backend dependency scan (e.g. OWASP Dependency-Check) in CI yet.
- No external penetration test.

### Issues found and fixed during the gate

- **Duplicate page from route animations.** AnimatePresence with Outlet rendered a duplicate page that swallowed input. Replaced with a frozen `useOutlet` (`AnimatedOutlet`).
- **Security headers dropped.** nginx `add_header` inside `location` blocks removed the server-level headers. Moved all headers to server level.
- **CORS 403 behind the proxy.** nginx `Host $host` dropped the port, so the API saw a different origin. Changed to `$http_host`.
- **Checkout crash over plain HTTP.** `crypto.randomUUID` is unavailable over plain HTTP on a non-localhost host, and this crashed checkout. `newIdempotencyKey()` now falls back to `crypto.getRandomValues`. Route-level `errorElement`s were also added so unexpected errors show a friendly screen.
- **Postman generator overwrote settings.** Its placeholder write requests changed dev settings. Write examples are now skipped unless `runWriteExamples=true`.

### Gate decision

**Not yet formally accepted.** Three items remain:

1. Re-run the clean-start check from a fresh clone once the code is committed.
2. Owner sign-off on the invoice PDF design.
3. Add a backend dependency vulnerability scan to CI.

Per §119, React Native work should begin only after these are closed.

## Stage 5 Mobile Acceptance

Evaluated 2026-10-03. Mobile work began before the §119 sign-off at the owner's request (D-027). The app is one Expo
app for customers (`/shop`) and Owner/Admin (`/admin`), against the same API (D-028).

```text
[x] Same API contract, test data and authorization rules – no mobile-specific endpoints; staff menu filtered by the same permissions
[x] Customer registration/login                         – E2E: a new number registers and lands on “Registration received” (found and fixed a redirect-to-login bug)
[x] Catalog / cart / checkout                           – E2E: search → add to cart → checkout (cash) → order placed
[x] Online payment flow                                 – E2E: pay online → mock gateway → signed webhook → order Paid
[x] Credit flow                                         – credit option + available-credit warning at checkout; credit/statement screen
[x] Order tracking                                      – status timeline from status history (unit-tested logic)
[x] Invoice access                                      – E2E: customer sees the invoice generated by staff; PDF via share sheet
[x] Staff workflow                                      – E2E: accept → pack → ready → dispatch → deliver → invoice → record payment
[ ] Notification / deep-link behaviour                  – in-app notification list works; push notifications and deep links not configured yet
[ ] Android / iOS security testing                      – not done (needs device builds; MASVS review pending)
[~] Mobile E2E testing                                  – 6/6 Playwright journeys on a phone viewport (browser build); no on-device (Detox/Maestro) run yet
```

| Check | Command | Result |
|---|---|---|
| Type-check | `cd mobile && npm run typecheck` | clean |
| Lint | `npx expo lint` | 0 errors, 24 warnings (`set-state-in-effect`, same treatment as web) |
| Unit/component tests | `npm test` | 16 passed |
| E2E (phone viewport) | `PW_CHANNEL=chrome npm run e2e` | 6 journeys pass (run in groups because of the OTP rate limit) |
| SDK compatibility | `npx expo-doctor` | 21/21 checks passed |
| Native bundles | `npx expo export --platform android --platform ios` | both bundles built (Hermes) |
| Production dependency audit | `npm audit --omit=dev` | 0 critical; 4 high, all `node-forge` inside the Expo CLI (build-time code signing, not in the app bundle, no patched release yet). CI gates mobile on critical until Expo ships a fix. |

Open before store release: device testing on real Android/iOS hardware, MASVS review, push notifications and deep
links, app icons/splash and store listing, EAS build profiles, real payment SDK in place of the mock checkout sheet,
and `OTP_SHOW_IN_RESPONSE` off on the production backend.

## §120 Production Activation Gate

No production provider is enabled. The OTP/SMS, payment gateway, WhatsApp, e-invoice and object storage (S3) providers all run as mocks or local adapters. The production adapters are not implemented yet (Stage 3).

Other Stage 3 items still open:

- A shared (multi-instance) rate limiter.
- UPI QR image rendering.

Each provider must pass the full §120 checklist on its own before being switched on. See `docs/third-party-costs.md`.
