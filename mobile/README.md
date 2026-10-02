# ShopFlow mobile (React Native / Expo)

One app for every role, on the same backend and API contract as the web app (`docs/openapi/openapi.yaml`). There is
no mobile-specific backend and no business rules in the app: every price, tax, total, stock and credit figure comes
from the API.

| Signed-in role | Lands on | What it contains |
|---|---|---|
| Customer (approved) | `/shop` | Bottom tabs Home · Products · Cart · Orders · Profile (§6.3), plus checkout, mock online payment, invoices with PDF, payments with receipts, credit & statement, returns, addresses, notifications |
| Customer (pending / blocked / rejected) | `/registration-status` | Status screen; "Check again" refreshes the session |
| Owner / Admin | `/admin` | Bottom tabs Dashboard · Orders · Products · Customers · More; "More" lists every other web screen, filtered by permission |

The Owner/Admin screens mirror the web app: dashboard (owner analytics or admin operations), orders with the full
workflow (accept, pack, dispatch, deliver, fail, cancel, invoice, payment), products with images, categories, stock and
adjustments, stock movements, purchases (draft/post, supplier payments, returns), suppliers with ledger, customers
(approve/reject/block, credit profile, ledger, special prices), invoices (create, generate, PDF, WhatsApp, credit
notes, cancel), payments (record, receipt, refund, cancel), sales-return review, reports with CSV/Excel/PDF export,
users & permissions, business settings and audit logs. Owner-only screens are hidden from Admins and the backend
rejects them anyway.

## Stack

Expo SDK 57 (React Native 0.86, React 19), Expo Router (file routes in `src/app`), TanStack Query, Zustand, Zod,
`expo-secure-store`, `expo-image-picker`, `expo-file-system` + `expo-sharing`, `@expo/vector-icons`.

```
src/
├── app/            routes only (thin files that export a screen)
│   ├── login, register, registration-status
│   ├── shop/       customer tabs + stack screens
│   └── admin/      owner/admin tabs + stack screens
├── screens/        auth, home, products, cart, checkout, orders, invoices, payments, profile, admin
├── components/     ui (design system), shop, admin, shared
├── features/       session, shop (cart, order timeline), catalog, notifications
├── navigation/     staff menu + permissions
├── services/       api client, config, token storage, documents
├── store/          auth store
├── hooks/  utils/  theme/
└── __tests__/      unit tests
e2e/                Playwright journeys (phone viewport)
```

## Run it

1. Start the backend (repo root README). Demo mode shows the OTP on the login screen.
2. `cd mobile && npm install`
3. `npx expo start`
   * **On your phone:** install **Expo Go**, join the same Wi-Fi as this computer, scan the QR code. The app talks to
     the backend on port 8080 of the computer running Expo (it derives the address automatically). If Windows
     Firewall asks, allow Java on private networks, or open TCP 8080.
   * **In a browser:** press `w` (or `npm run web`) → http://localhost:8081. The browser build keeps the session in
     memory, so a page reload signs you out.
   * **Android emulator / iOS simulator:** press `a` / `i` (needs Android Studio / a Mac).

Set `EXPO_PUBLIC_API_BASE_URL` (e.g. `https://api.example.com`) to point at another backend.

Seed logins (fictitious data): `9000000001` owner, `9000000002` admin, `9000000003` approved customer,
`9000000004` pending customer. OTP requests are rate-limited (5 per number per 15 minutes).

## Checks

| Check | Command |
|---|---|
| Type-check | `npm run typecheck` |
| Lint | `npx expo lint` |
| Unit tests | `npm test` |
| E2E (backend running) | `PW_CHANNEL=chrome npm run e2e` |
| SDK compatibility | `npx expo-doctor` |
| Native bundles | `npx expo export --platform android --platform ios` |

## Security (OWASP MASVS baseline, §114)

* Sign-in is mobile number + OTP. The app does not send `X-Client-Type: web`, so the API returns the refresh token in
  the response body; it is stored only in the Keychain / Keystore (`expo-secure-store`,
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`). The access token lives in memory. Logout revokes the session on the server.
* No secrets in the app; payment and WhatsApp keys stay on the backend. Purchase cost is never shown to customers.
* Money-moving requests (orders, payments, invoice generation) send an `Idempotency-Key`.
* Documents (invoice PDFs, receipts, exports) are fetched with the user's token and opened through the system share
  sheet; nothing is cached beyond the OS temp folder.

## Building for the stores

Use EAS (`npx eas-cli@latest build --platform android|ios`). Store builds need: app icons/splash in `assets/`,
the production API URL in `EXPO_PUBLIC_API_BASE_URL`, `app.otp.show-in-response` **off** on that backend, and a real
payment SDK in place of `components/shop/MockCheckout.tsx` (see `docs/RELEASE-GATES.md`, §120).
