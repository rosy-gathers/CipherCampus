# CipherCampus — secure academic collaboration

**Live demo:** set `PUBLIC_DEMO_URL` in your deployment and replace the placeholder below after you ship.

- **Demo:** `https://your-demo.example.com` (placeholder — see [docs/DEPLOY.md](docs/DEPLOY.md))
- **API docs (Swagger UI):** `{API_ORIGIN}/api/docs` when the backend is running
- **Health / readiness:** `GET /api/health` (liveness), `GET /api/ready` (MySQL + optional Redis)

CipherCampus is a full-stack **secure academic collaboration** app: registration, password + email OTP, encrypted profile fields, an integrity-checked feed, messaging, a document vault, and admin RBAC. It started as coursework (CSE447) and is structured so you can **demo it like a product** and **defend the design** in interviews without over-claiming security.

## Problem and constraints

- **Problem:** academic teams need a place to share updates and files where a leaked database does not trivially expose plaintext, and where tampering with stored content is detectable.
- **Constraints:** browser clients stay thin; the API owns crypto and policy; MySQL holds ciphertext and hashes; sessions must work with short-lived JWTs and server-side revocation metadata.
- **Role:** end-to-end ownership of auth, crypto envelope choices, data model, API, React UI, Docker/CI, and deployment documentation.

## What we built (product surface)

| Area | Behavior |
|------|----------|
| **Auth** | Argon2id passwords, JWT + `sessions` table (hashed token), optional IP/UA binding |
| **2FA** | Email OTP; Redis-backed challenge store when `REDIS_URL` is set |
| **Profile** | Encrypted fields; **profile photo** (encrypted at rest, served to signed-in users) |
| **Academic feed** | AES-256-GCM posts + HMAC; **tags** on create/edit; **filter by tag**; author avatars |
| **Messages** | ECC-encrypted DMs; **people search**; **conversation filter**; multi-line composer (Enter send / Shift+Enter newline) |
| **Document vault** | Encrypted uploads; **share** with a peer (recipient-specific re-encrypted copy); **PDF/image preview**; **folders** (course/topic); **search by file name**; move between Unfiled and folders |
| **Notifications** | In-app bell for **new messages** and **document shares**; unread count; mark read / mark all read |
| **Admin** | User management, stats, key rotation overview |
| **Ops** | Structured logging (pino), Helmet + rate limits on auth, `/api/ready` for orchestrators |
| **Quality** | Jest (health, auth middleware, DB integration when CI MySQL is present), Playwright smoke on the SPA |
| **Data** | Knex migrations (`npm run migrate` in `backend/`); **utf8mb4** for emoji/Unicode; `document_shares`, `document_folders`, `notifications` |

## Architecture and threat model

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for trust boundaries, what is encrypted vs hashed, and **honest limitations** (including how educational RSA/ECC modules relate to production-grade boundaries).

Security operations checklist: **[docs/SECURITY.md](docs/SECURITY.md)**  
Deployment (HTTPS, env, platforms, Docker): **[docs/DEPLOY.md](docs/DEPLOY.md)**  
Render starter blueprint: **[render.yaml](render.yaml)**

## Demo assets (for recruiters)

1. **Short screen recording (60–90s):** register → OTP → create tagged post → upload to a folder → share a file → notification bell.
2. **Screenshots:** add 3–5 PNGs under `docs/screenshots/` (login, feed, vault, messages, profile). Commit images when you have them.

## Tech stack

- **Frontend:** React (CRA), React Router, Axios  
- **Backend:** Node.js, Express, MySQL2, optional Redis, BullMQ mail worker (optional)  
- **Crypto:** Argon2id, `jsonwebtoken`, AES-GCM envelopes for bulk data; project RSA/ECC modules documented as **educational** where applicable (see ARCHITECTURE)

## Repository layout

```text
backend/          API, crypto, migrations, worker.js (optional mail queue)
frontend/         React SPA; e2e/ Playwright smoke
database/         schema.sql (bootstrap); prefer knex migrate for schema deltas
docs/             DEPLOY, SECURITY, openapi.yaml, screenshots/
```

## Local setup (quick)

**Prerequisites:** Node.js LTS, MySQL, optional Redis.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Set JWT_SECRET (32+ chars for production), DB_*, optional REDIS_URL and EMAIL_*
```

Import schema, then from `backend/`:

```bash
npm install
node init_db.js   # applies database/schema.sql; fails with exit code 1 on error
$env:NODE_ENV='development'; npm run migrate   # PowerShell — use development, not test
npm run dev
```

On first API start, if `backend/config/system_rsa_*.json` are missing, the server generates a keypair there. Use a **fresh database** after generation, or keep the same key files across restarts so existing ciphertext stays valid. **Never commit** `system_rsa_private.json` (see `.gitignore`). Prefer key files or deployment secrets over pasting the private key into `.env` — see [docs/SECURITY.md](docs/SECURITY.md).

From `frontend/`:

```bash
npm install
npm start
```

Docker (MySQL + Redis + API + nginx frontend): `docker compose up --build` from this directory.

## Scripts worth knowing

| Location | Command | Purpose |
|----------|---------|---------|
| backend | `npm test` | Jest (integration tests run in CI with MySQL) |
| backend | `npm run migrate` | Apply Knex migrations (folders, notifications, tags, avatars, shares, utf8mb4) |
| backend | `npm run worker` | Process OTP email jobs when `USE_MAIL_QUEUE=true` |
| frontend | `npm run test:e2e` | Playwright smoke (requires `npm run build` first locally) |

## API highlights (newer routes)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/notifications` | List in-app notifications |
| PATCH | `/api/notifications/:id/read` | Mark one read |
| POST | `/api/notifications/read-all` | Mark all read |
| POST | `/api/auth/avatar` | Upload profile photo (multipart `avatar`) |
| GET | `/api/auth/avatar/:userId` | Fetch avatar (authenticated) |
| DELETE | `/api/auth/avatar` | Remove profile photo |
| GET | `/api/documents/folders` | List your vault folders |
| POST | `/api/documents/folders` | Create folder `{ "name": "CSE 447" }` |
| DELETE | `/api/documents/folders/:folderId` | Delete folder (files → Unfiled) |
| PATCH | `/api/documents/:id/folder` | Move file `{ "folderId": id \| null }` |
| GET | `/api/documents?folder=&q=` | List/filter: `folder=all\|unfiled\|shared\|<id>`, `q` = filename search |
| POST | `/api/documents/:id/share` | Share document with a user |

Full contract: [docs/openapi.yaml](docs/openapi.yaml). Many errors use **RFC 7807** `application/problem+json` with an **`error` field** mirroring `detail` for older clients.

## Limitations (say this plainly)

- This is a **portfolio-grade** system, not a compliance-certified product. A compromised host or malicious insider with API access defeats most app-layer goals.
- Custom RSA/ECC code demonstrates coursework goals; **production secrecy for bulk data** is centered on **standard primitives** (AES-GCM, Argon2, JWT) as described in ARCHITECTURE.
- Email OTP depends on SMTP configuration; use app passwords and never commit secrets.

## Team / credits

CipherCampus — CSE447 lab project. Update with your names and course IDs.

## License

Use your course or team license as appropriate.
