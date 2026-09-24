# Deployment guide

Recommended production topology (India):

| Component | Suggested service | Notes |
|---|---|---|
| Web (SPA/PWA) | **Vercel** (`client/`) | `client/vercel.json` rewrites sitemap/robots + crawler snapshots to the API |
| API | **Render** web service (Docker) — or Railway / AWS ECS Fargate | `server/Dockerfile`, runs `prisma migrate deploy` on boot |
| Worker | Render background worker (same image, `node dist/worker.js`) | Scale independently |
| PostgreSQL | Render Postgres / Neon / Supabase / AWS RDS (**PostGIS required**) | Region: Mumbai/Singapore |
| Redis | Render Redis / Upstash / ElastiCache | `maxmemory-policy noeviction` (BullMQ) |
| Storage | AWS S3 (ap-south-1) or Cloudflare R2 + CDN | Public bucket prefix for images; keep `private/` non-public |
| Payments | Razorpay (Route enabled) | Webhook → `{API_URL}/api/v1/webhooks/razorpay` |

## 1. Database

1. Create PostgreSQL 16 with PostGIS. On managed Postgres run once:
   `CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS pg_trgm;`
   (the first migration also attempts this).
2. Migrations run automatically on API start (`npx prisma migrate deploy`).
3. Seed categories (optional demo data): `DATABASE_URL=... npm run db:seed -w server`
   — **do not** run the demo seed on production; instead create categories from the admin panel
   or adapt `prisma/seed.ts`.

## 2. API + worker on Render

1. Push the repo to GitHub → Render → **New → Blueprint** → select `render.yaml`.
2. Fill the `rentnest-secrets` env group (see `.env.example` for every variable):
   `DATA_ENCRYPTION_KEY` (`openssl rand -hex 32`), Razorpay keys, S3, geocoder, SMTP, Sentry…
3. Custom domain `api.rentnest.in` → set `API_URL`, `APP_URL`, `CORS_ORIGINS`, `COOKIE_DOMAIN=.rentnest.in`
   (same parent domain keeps the refresh cookie first-party with `COOKIE_SAMESITE=lax`).
   If the API must live on another site, use `COOKIE_SAMESITE=none` (HTTPS only).
4. Health check: `/health`.

**Railway**: create services from the same Dockerfile (API + worker with start command
`node dist/worker.js`), add Postgres (enable PostGIS) and Redis plugins, set env vars.

**AWS**: build/push both images to ECR, run on ECS Fargate behind an ALB (sticky sessions
not required — socket.io uses the Redis adapter; enable WebSocket support on the ALB),
RDS PostgreSQL with PostGIS, ElastiCache Redis, S3 + CloudFront, Secrets Manager for env.

## 3. Web on Vercel

1. Import the repo, **Root Directory** `client`, framework "Vite".
2. Env vars: `VITE_API_URL=https://api.rentnest.in`, `VITE_PLATFORM_NAME=RentNest`, optional `VITE_MAPBOX_TOKEN`.
3. Replace `api.rentnest.in` in `client/vercel.json` with your API domain.
4. Domain `rentnest.in` (+ `www`).

Single-service alternative: build the client and set `SERVE_CLIENT_DIR=/app/client/dist` on
the API — it then serves the SPA with server-side SEO meta injection on the same origin.

## 4. Razorpay

1. Enable **Route** on your account (needed for owner payouts via linked accounts).
2. Webhook URL `{API_URL}/api/v1/webhooks/razorpay`, secret → `RAZORPAY_WEBHOOK_SECRET`, events:
   `payment.captured, payment.failed, order.paid, refund.processed, refund.failed, transfer.processed, transfer.failed`.
3. Set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
4. Test end-to-end in test mode, then switch to live keys.

## 5. Other integrations

* **SMS/OTP**: MSG91 with DLT-registered sender ID & templates (mandatory in India) or Twilio.
* **Email**: any SMTP (SES, Postmark, Zoho) via `SMTP_URL`; configure SPF/DKIM/DMARC.
* **Web push**: `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY`.
* **Google sign-in**: OAuth client (Web) with your domains as authorised JS origins → `GOOGLE_CLIENT_ID`.
* **Maps**: `GEOCODER=google` + `GOOGLE_MAPS_API_KEY` (restrict by IP) for best Indian address coverage.
* **Sentry**: `SENTRY_DSN`.

## 6. CI/CD

* `.github/workflows/ci.yml` — typecheck + unit/integration tests (PostGIS service), client build,
  Playwright E2E booking flow, Docker image builds.
* `.github/workflows/deploy.yml` — on green `main`: Render deploy hooks + `vercel deploy --prod`.
  Secrets: `RENDER_DEPLOY_HOOK_API`, `RENDER_DEPLOY_HOOK_WORKER`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

## 7. Operations

* Backups: enable daily automated Postgres backups + PITR.
* Scale: API replicas behind the load balancer; worker concurrency via replicas.
* Monitoring: `/health`, Sentry, pino JSON logs (ship to Datadog/Grafana Loki), Razorpay dashboard.
* Admin → Reconciliation should show "Balanced"; investigate mismatches daily.
