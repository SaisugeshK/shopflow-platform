# Third-party services and costs (§115)

No vendor prices are hard-coded in the application. Before enabling any provider (Stage 3), fill in the row from the
vendor's current official pricing page and record the date checked. Re-check every price before launch.

| Service | Development | Candidate for production | Plan / region | Price checked on | Usage fees | Setup / monthly | Taxes | Limits | Support / SLA | Data retention | Exit process |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OTP / SMS | Mock (`MockOtpProvider`) | To be selected (DLT-registered Indian SMS provider) | | | | | | | | | |
| WhatsApp invoices | Mock (`MockWhatsAppProvider`) | Meta WhatsApp Business Platform (Cloud API) or approved BSP | | | | | | | | | |
| Online payments | Mock (`MockPaymentGateway`) | Razorpay (§111) | | | | | | | | | |
| E-invoice (IRP/GSP) | Mock, disabled (`EINVOICE_ENABLED=false`) | Only if legally applicable to the business | | | | | | | | | |
| Database | Local PostgreSQL / Podman container | Managed PostgreSQL or self-hosted with backups | | | | | | | | | |
| Object storage | Local directory / volume | S3-compatible storage | | | | | | | | | |
| Monitoring & alerting | Logs | To be selected | | | | | | | | | |
| Domain & TLS | localhost | Registrar + certificate authority | | | | | | | | | |
| Backup storage | Local test (`scripts/backup-restore-test.sh`) | Off-site encrypted storage | | | | | | | | | |

Record each final provider choice in `docs/decisions/DECISIONS.md` together with the checklist in §116.
