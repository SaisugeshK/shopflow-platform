# Podman

* `backend/Containerfile` — Maven build stage → Temurin 21 JRE (non-root), readiness health check.
* `web/Containerfile` — Node build stage → nginx serving the SPA with security headers and a same-origin `/api` proxy
  (`web/nginx.conf`).
* `podman-compose.yml` (repo root) — `database` (PostgreSQL 17, volume `db-data`), `backend` (volume `file-storage`
  for uploads/PDFs), `web`.

```bash
cp .env.example .env            # set POSTGRES_PASSWORD, JWT_*, OTP_HASH_SECRET, *_WEBHOOK_SECRET
podman compose up --build -d
podman compose ps
podman compose logs -f backend
podman compose down             # keep data;  add -v to delete volumes
```

`SPRING_PROFILES_ACTIVE=dev` (default in compose) loads mock providers and the fictitious seed data. Use `prod` with
real secrets for anything beyond local testing. Nothing depends on Docker-only features; `podman compose` works with
either the `podman-compose` or `docker-compose` provider.
