# Deployment (target architecture, §83)

```
Internet → reverse proxy / load balancer (TLS) → web (nginx, static SPA) ─┐
                                                  └──── /api ──→ Java API → PostgreSQL
                                                                     ├─→ object storage (S3-compatible)
                                                                     └─→ providers (OTP, WhatsApp, payments, e-invoice)
```

Web and API are separate images and deploy independently. Before production:

1. Run with `SPRING_PROFILES_ACTIVE=prod` (structured JSON logs, Swagger/API docs and dev tools off).
2. Supply every secret from a secret manager; set `REFRESH_COOKIE_SECURE=true` and `CORS_ALLOWED_ORIGINS` to the real
   web origin.
3. Probes: `/actuator/health/liveness`, `/actuator/health/readiness`.
4. Storage: implement/enable the S3 `StorageProvider` so files never live only inside a container (§71).
5. More than one API instance: move the OTP rate limiter and background job queue to a shared store first (D-018).
6. Backups: scheduled `scripts/backup.sh` to encrypted off-site storage plus a periodic `backup-restore-test.sh`.
7. Complete the Production Activation Gate (§120) for each provider, one at a time.
