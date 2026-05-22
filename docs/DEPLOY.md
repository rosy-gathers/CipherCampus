# Deploying CipherCampus (production checklist)

This app needs **MySQL**, **Redis** (recommended for OTP and optional mail queue), and a **Node** API. The React frontend is static files (build output) served by nginx, CDN, or object storage.

## Environment variables (backend)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | production | Enables stricter JWT checks |
| `PORT` | no | Default `5000` |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` | yes | MySQL connection |
| `JWT_SECRET` | yes | **≥32 random characters** in production |
| `FRONTEND_ORIGIN` | yes | Exact browser origin (e.g. `https://app.yourdomain.com`) for CORS |
| `REDIS_URL` | recommended | e.g. `redis://:pass@host:6379` |
| `EMAIL_USER`, `EMAIL_PASS` | for OTP | SMTP (e.g. Gmail app password) |
| `HMAC_SECRET` | recommended | Strong random string; must stay stable per deploy |
| `USE_MAIL_QUEUE` | optional | Set `true` to send OTP email via BullMQ worker (requires Redis + worker process) |
| `CIPHERCAMPUS_SYSTEM_KEYS_DIR` | optional | Directory for `system_rsa_*.json` (keep off ephemeral disk if possible) |

Frontend build-time:

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_URL` | Public API URL including `/api`, e.g. `https://api.yourdomain.com/api` |

## HTTPS

Terminate TLS at your host (Render/Fly/Railway/AWS ALB). Set `secure: true` on cookies (already tied to `NODE_ENV=production` in code).

## Suggested platforms

1. **Railway / Render** — Managed MySQL + Redis add-ons; deploy API as web service; deploy frontend as static site; set `REACT_APP_API_URL` to your API URL before `npm run build`.
2. **Fly.io** — `fly launch` for API; managed Postgres is common; for MySQL use PlanetScale, RDS, or a Fly MySQL template; Redis Upstash or Fly Redis.
3. **AWS** — ECS/Fargate + RDS MySQL + ElastiCache Redis + S3/CloudFront for frontend.

## Docker Compose (VPS)

From repo root:

```bash
cp backend/.env.example backend/.env
# edit secrets
docker compose up -d --build
```

The API container runs **`npx knex migrate:latest`** before `node server.js`. For a one-off fix you can still run:

```bash
docker compose exec backend npx knex migrate:latest
```

## Demo URL placeholder

After you deploy, set **`PUBLIC_DEMO_URL`** in your hosting docs or add the real link at the top of [README.md](../README.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

## Post-deploy

- [ ] Rotate any secret that was ever committed or shared.
- [ ] Confirm `/api/health` and `/api/ready` return 200 when dependencies are up.
- [ ] Smoke test: register → OTP → login → create post.
