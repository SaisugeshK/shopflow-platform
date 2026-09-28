# Mobile (reserved)

The React Native customer app starts **only after the Web + Backend acceptance gate is formally accepted**
(`APPLICATION-ARCHITECTURE.md` §0A Stage 4, §91 Phase 11; status in `docs/RELEASE-GATES.md`).

It will use the same backend and API contract (`docs/openapi/openapi.yaml`) — no mobile-specific backend or
duplicated business rules. Planned structure (§57):

```
mobile/src/{navigation,screens/{auth,home,products,cart,checkout,orders,invoices,payments,profile},components,
            features,services,store,hooks,utils,theme}
```

Notes for implementation:

* Sign-in: the same OTP endpoints; omit `X-Client-Type: web` so the refresh token is returned in the body, and keep it
  in the platform secure store (Keychain / Keystore), never plain storage.
* Screens map 1:1 to the web customer portal (`web/src/features/portal`), which already implements C01–C17.
* Security baseline: OWASP MASVS (§114).
