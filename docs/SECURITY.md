# Security and secrets

## Secrets policy

- **Never** commit `backend/.env`, `frontend/.env`, or `system_rsa_private.json`.
- Use platform secret managers (Railway variables, AWS Secrets Manager, etc.).
- **Rotate** `JWT_SECRET`, `HMAC_SECRET`, and SMTP credentials if exposed.

## Dependency updates

- Enable **Dependabot** (`.github/dependabot.yml`) and review PRs weekly.
- Run `npm audit` locally; CI can run audit on a schedule (non-blocking workflow).

## Production hardening

- `NODE_ENV=production` — required for strong `JWT_SECRET` validation.
- Use TLS everywhere; set `FRONTEND_ORIGIN` to the exact SPA origin (no wildcard in production CORS).
- Prefer **Redis** for OTP state in multi-instance deployments.
- Optional **mail queue** (`USE_MAIL_QUEUE=true`) isolates SMTP failures and enables retries (run `npm run worker` as a second process).

## Reporting issues

Add your preferred contact or GitHub Security Advisories URL for your fork.
