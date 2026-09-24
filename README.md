# RentNest — peer-to-peer rental marketplace 🇮🇳

Rent anything from people nearby — cameras, electronics, furniture, bikes, tools, camping gear — with
location-based discovery, escrow payments via **Razorpay Route**, security deposits, handover/return
photo evidence, disputes, two-way reviews and a full admin console.

> Launch configuration: **India · INR · Razorpay Route · DPDP Act 2023 · GST on platform fees.**
> Brand name is configurable (`PLATFORM_NAME` / `VITE_PLATFORM_NAME`).

| | |
|---|---|
| **Frontend** | React 18 + Vite + TypeScript, Tailwind CSS v4, React Router, TanStack Query, Leaflet maps, Recharts, PWA (offline shell, installable, push) |
| **Backend** | Node.js 22 + Express 5 + TypeScript, REST `/api/v1`, Zod, Socket.io, BullMQ workers, pino, Sentry |
| **Data** | PostgreSQL 16 + **PostGIS** (Prisma ORM), Redis (cache, rate limits, OTPs, queues, socket adapter) |
| **Integrations** | Razorpay (orders, refunds, Route payouts), S3/R2 storage + sharp thumbnails, Google Maps / Mapbox / Nominatim, SMTP, MSG91/Twilio SMS & WhatsApp, Web Push, Google sign-in |

---

## Contents
1. [Quick start](#quick-start)
2. [Features](#features)
3. [Project structure](#project-structure)
4. [Environment variables](#environment-variables)
5. [Scripts & testing](#scripts--testing)
6. [Monetization & configuration](#monetization--configuration)
7. [API](#api)
8. [Deployment](#deployment)
9. [Launch checklist](#launch-checklist)

Deeper docs: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/API.md`](docs/API.md) · [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---

## Quick start

### Option A — Docker (everything)
```bash
cp .env.example .env            # defaults work for local (mock payments, console SMS/email)
docker compose up --build       # web :8080 · api :4000 · postgis :5432 · redis :6379
docker compose exec api node -e "require('child_process').execSync('npx tsx prisma/seed.ts',{stdio:'inherit'})"
open http://localhost:8080
```

### Option B — local Node (hot reload)
Prerequisites: Node 20+, PostgreSQL 14+ with PostGIS, Redis.
```bash
npm install
cp .env.example server/.env     # set DATABASE_URL / REDIS_URL; for local dev also:
                                # OTP_DEV_ECHO=true  GEOCODER=offline (or nominatim)
npm run db:migrate -w server    # prisma migrate deploy (PostGIS, triggers, exclusion constraint)
npm run db:seed -w server       # 10 cities, ~80 listings, bookings in every state
npm run dev -w server           # API  → http://localhost:4000  (docs: /api/docs)
npm run dev -w client           # Web  → http://localhost:5173  (proxies /api to :4000)
```

**Demo accounts** (password `Password@123`; or sign in with mobile OTP — in dev the code is returned/echoed):

| Role | Email | Phone |
|---|---|---|
| Admin | `admin@rentnest.in` | +91 90000 00001 |
| Support | `support@rentnest.in` | +91 90000 00002 |
| Owner (Pro, verified) | `owner@rentnest.in` | +91 90000 00003 |
| Renter | `renter@rentnest.in` | +91 90000 00004 |

Payments use the **mock provider** by default: checkout shows a simulated payment dialog that goes
through the exact same server verification path as Razorpay.

---

## Features

### Location-based discovery (core)
- Auto-detects location with browser geolocation → falls back to IP city detection when denied → manual city/locality picker (autocomplete for any city/area/pincode); choice remembered locally and on the account.
- Every listing is geocoded (address or map pin) into lat/lng + city + locality + pincode. **Only an approximate, deterministically fuzzed location is public**; exact address and contacts are revealed after payment.
- Home shows items in the user's city sorted by distance from their locality; filters for **radius (1/5/10/25 km)**, category, price, availability dates, rating, delivery, instant book, verified; **map ↔ list** toggle with "search this area".
- **No hard-coded cities**: a city (and its SEO page) is created automatically when its first listing appears.
- Empty states return the nearest available items anywhere plus a prompt to list items. Radius search crosses city borders for users near boundaries.

### Marketplace
- Listings: photos (up to 10, client + server compression, WebP renditions, EXIF/GPS stripped), category/subcategory, condition, hourly/daily/weekly/monthly pricing (cheapest combination auto-applied), deposit, min/max period, calendar blocks, pickup/delivery, rules, cancellation policy, instant booking (verified owners).
- Search: PostGIS distance + weighted full-text + trigram fuzzy match, featured boosts first, pagination everywhere, Redis-cached result pages.
- Booking flow: request → owner accepts/declines (auto-expire 24 h) → payment → handover checklist (both sides, timestamped photos) → active → return checklist → owner inspection (48 h, else auto-complete) → deposit release → payout. Double bookings are impossible (row lock + PostgreSQL exclusion constraint).
- Real-time chat with contact-detail masking (phones, emails, UPI IDs, links, "WhatsApp me") until a booking is confirmed.
- Two-way reviews only after completed rentals; wishlist; recently viewed.
- Notifications: in-app (real-time), email, SMS, WhatsApp, web push — per-channel preferences; reminders before pickup/return; escalating overdue alerts.
- Dashboards: my listings, rentals, booking requests, earnings & payouts, invoices, analytics (Pro), disputes.

### Payments, payouts & taxes
- Razorpay Orders + Checkout; signature verification; idempotency keys; webhook de-duplication & retries; reconciliation job recovers "paid but never confirmed" payments.
- Escrow: platform keeps its cut; owner share released after completion via **Razorpay Route** transfers to KYC-verified linked accounts (bank or UPI, AES-encrypted).
- Automatic refunds per cancellation policy, owner-cancellation penalties netted from future payouts, partial refunds from disputes.
- GST on platform fees, gap-free per-financial-year invoice numbers, PDF receipts for renters and commission invoices for owners; append-only ledger + reconciliation report.

### Trust & safety
- Mandatory phone verification to list/book; KYC (Aadhaar/PAN/DL/Passport/Voter ID, masked, private storage) required above an admin-set booking value and for payouts/instant booking; verified badges for users and listings.
- Disputes with evidence from both parties + checklist photos; admin decides deposit deduction and refunds; payouts frozen meanwhile.
- Reports (listing/user/message/review); auto-flags for high cancellations, off-platform payment attempts, suspicious review patterns, prohibited-item attempts, overdue rentals, payment anomalies.
- Prohibited items enforced at listing time; block users; bans take effect immediately; soft deletes + audit trail.

### Admin panel
GMV, revenue (by stream), active users, bookings per city, top categories, conversion funnel; city supply-vs-demand analytics and heatmap; users (suspend/ban/roles), KYC queue, listing moderation (approve/reject/verify/feature), bookings, disputes, payments & refunds, webhooks, payouts, reports & flags, configurable fees/policies/thresholds/prohibited items/featured & Pro pricing, categories, cities, reconciliation, audit log, CSV exports.

### Edge cases handled
Concurrent double-booking · owner cancels after payment (full refund + penalty) · renter doesn't return (overdue state, escalating reminders, auto-dispute + deposit capture) · damaged / not-as-described returns (claims with evidence) · payment succeeded but webhook failed (reconciliation) · payment after dates were taken (auto refund) · location denied / invalid addresses (clear errors, map pin) / city borders (radius search) · UTC storage with local display · account deletion blocked while rentals, payouts or disputes are open (then PII anonymised) · image upload failures & slow networks (compression, retries, per-file errors) · offline banner + PWA cache · listing edits with bookings (critical fields locked, optimistic versioning) · refresh-token theft (reuse detection).

### Legal & SEO
Terms, Privacy (DPDP Act 2023), Rental Agreement (versioned, accepted at every booking with timestamp + IP), Refund & Cancellation policy (rendered from live settings). SEO URLs like `/rent/cameras-photography/mumbai/andheri`, sitemap.xml, robots.txt, canonical/OG tags, Product/ItemList/Breadcrumb JSON-LD, and server-rendered snapshots for crawlers (`/seo/render`, nginx/Vercel bot rewrites, or `SERVE_CLIENT_DIR` meta injection).

---

## Project structure

```
.
├── client/                         # React SPA (PWA)
│   ├── src/
│   │   ├── App.tsx                 # Lazy-loaded route table
│   │   ├── components/             # ui/ kit, layout/, map/, ListingCard, PriceBreakdown, LocationPicker…
│   │   │   ├── public/ dashboard/ admin/   # feature components
│   │   ├── pages/
│   │   │   ├── public/             # Home, Browse (list/map), Listing, Checkout, Profile, Cities, …
│   │   │   ├── auth/               # Login (OTP/email/Google), Register, Forgot password, Verify phone
│   │   │   ├── dashboard/          # Overview, Rentals, Requests, Booking detail, Listings wizard, Calendar,
│   │   │   │                       # Messages, Earnings, Wishlist, Notifications, Disputes, Analytics, Pro, Settings
│   │   │   ├── admin/              # Dashboard, analytics/heatmap, users, KYC, moderation, bookings, disputes,
│   │   │   │                       # payments, payouts, trust, settings, categories, cities, reconciliation, audit
│   │   │   └── legal/              # Terms, Privacy, Rental agreement, Refund policy
│   │   ├── lib/                    # api (token refresh), payments (Razorpay), upload, socket, format, types
│   │   ├── stores/                 # auth context, location store (geolocation/IP/manual)
│   │   └── hooks/
│   ├── e2e/                        # Playwright booking-flow test
│   ├── Dockerfile · nginx.conf · vercel.json
├── server/
│   ├── prisma/
│   │   ├── schema.prisma           # 38 models
│   │   ├── migrations/             # incl. PostGIS triggers, full-text, exclusion constraint
│   │   └── seed.ts
│   ├── src/
│   │   ├── app.ts · index.ts · worker.ts
│   │   ├── config/env.ts           # validated env (fails fast; refuses insecure prod config)
│   │   ├── lib/                    # prisma, redis(+memory fallback), cache, queue, storage, images, geo, crypto, audit
│   │   ├── middleware/             # auth/RBAC, validation, rate limits, CSRF, errors
│   │   ├── modules/                # auth, users, locations, categories, listings, bookings, pricing, payments,
│   │   │                           # payouts, invoices, monetization, chat, reviews, disputes, trust,
│   │   │                           # notifications, admin, seo, settings, legal, uploads
│   │   ├── jobs/scheduler.ts       # BullMQ workers + repeatable schedules
│   │   ├── socket/                 # socket.io server + cross-process emitter
│   │   └── docs/openapi.ts         # OpenAPI 3.1 (Swagger UI at /api/docs)
│   ├── tests/unit · tests/integration
│   └── Dockerfile
├── docs/                           # ARCHITECTURE.md · API.md · DEPLOYMENT.md
├── docker-compose.yml · render.yaml · .env.example
└── .github/workflows/              # ci.yml · deploy.yml
```

---

## Environment variables

Every variable is documented inline in [`.env.example`](.env.example) (server) and
[`client/.env.example`](client/.env.example) (web). The server validates configuration on boot with Zod and
**refuses to start in production** with default JWT secrets, a zero encryption key or `OTP_DEV_ECHO=true`.

Minimum for production: `DATABASE_URL`, `REDIS_URL`, `APP_URL`, `API_URL`, `CORS_ORIGINS`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `DATA_ENCRYPTION_KEY`, `PAYMENT_PROVIDER=razorpay` + Razorpay keys & webhook secret,
S3 settings, a geocoder key, SMTP and an SMS provider.

---

## Scripts & testing

| Command | What it does |
|---|---|
| `npm run dev -w server` / `npm run worker -w server` | API with hot reload / standalone worker |
| `npm run dev -w client` | Vite dev server |
| `npm run build` | Build server (tsc) and client (vite) |
| `npm run typecheck` | Typecheck both workspaces |
| `npm test -w server` | **Unit** (pricing, fees, splits, cancellations, late fees, masking, CSV, FY) + **integration** tests (auth & token rotation, listings & geo search, full booking lifecycle, concurrent double-booking, DB exclusion constraint, cancellations/refunds/penalties, expiry, overdue escalation, reconciliation, webhook idempotency, chat masking, deletion rules, locked fields, disputes, admin RBAC, CSV, OpenAPI) — needs a PostGIS database (`TEST_DATABASE_URL`, default `rental_test`) |
| `npm test -w client` | Client unit tests (Vitest) |
| `npm run e2e -w client` | Playwright E2E: search → book → owner accepts → pay → confirmed (API + seeded DB required) |
| `npm run db:migrate -w server` / `db:seed` / `db:reset` | Database management |

---

## Monetization & configuration

All values are editable in **Admin → Fees & policies** (stored in `PlatformSetting`, cached, audited):

| Stream | Default |
|---|---|
| Owner commission | 15 % of rent (Owner Pro: 10 %) |
| Renter service fee | 5 % of rent, added at checkout |
| GST | 18 % on platform fees (service fee, commission, protection, delivery margin) |
| Damage protection plan | 8 % of rent (min ₹49) or flat fee, optional for renters |
| Featured listings | ₹199 / 7 days, ₹599 / 30 days (top of city & category results) |
| Owner Pro | ₹499 / 30 days — lower commission, 200 listings, analytics, Pro badge |
| Delivery margin | 20 % when platform delivery is used |
| Late returns | daily price × 1.5 per extra day (after 2 h grace), 30 % platform / 70 % owner |
| Cancellations | Flexible / Moderate / Strict tiers; owner cancellation penalty 10 % (min ₹200) |
| Security deposit | Held by the platform, released after inspection |

The checkout shows a transparent breakdown: rent (with the chosen unit combination), service fee, protection, delivery,
GST, refundable deposit and total.

---

## API

* Swagger UI: `http://localhost:4000/api/docs` · OpenAPI JSON: `/api/docs/openapi.json`
* Endpoint list: [`docs/API.md`](docs/API.md) (145 REST endpoints + socket events + webhooks)

---

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): web on **Vercel**, API + worker on **Render** (blueprint `render.yaml`),
Railway or AWS ECS; managed PostgreSQL with PostGIS and Redis; S3/R2 storage; Razorpay Route; CI/CD with GitHub Actions.

---

## Launch checklist

**Accounts & compliance**
- [ ] Company incorporated; GSTIN registered; `COMPANY_*` env vars set (printed on invoices)
- [ ] Razorpay account KYC'd, **Route** enabled, live keys + webhook secret configured, test transactions done
- [ ] Payment aggregator/marketplace obligations reviewed (escrow of deposits, TCS under GST §52 for e-commerce operators, TDS §194-O)
- [ ] DLT registration for SMS sender ID & OTP templates (MSG91/Twilio); WhatsApp Business templates approved
- [ ] Terms, Privacy Policy (DPDP Act), Rental Agreement and Refund policy reviewed by counsel; Grievance Officer named
- [ ] Prohibited items list reviewed for local law; insurance partner for the damage protection plan (optional)

**Infrastructure**
- [ ] Production secrets generated (`JWT_*`, `DATA_ENCRYPTION_KEY`), `OTP_DEV_ECHO=false`, `NODE_ENV=production`
- [ ] PostgreSQL with PostGIS, daily backups + PITR; Redis with `noeviction`
- [ ] S3/R2 bucket + CDN; `private/` prefix not publicly readable
- [ ] Custom domains + HTTPS; `CORS_ORIGINS`, `COOKIE_DOMAIN`, `APP_URL`, `API_URL` correct
- [ ] Separate worker process running (`RUN_WORKERS_IN_API=false`) and scaling configured
- [ ] Sentry DSN, log shipping, uptime monitor on `/health`; alerts for failed payouts/webhooks
- [ ] Google Maps (restricted key) or Mapbox configured; Google OAuth origins set; VAPID keys generated
- [ ] SPF/DKIM/DMARC for the email domain

**Product**
- [ ] Categories curated in Admin → Categories (don't run the demo seed in production)
- [ ] Fees, cancellation policies, KYC threshold, moderation mode, featured & Pro pricing reviewed in Admin
- [ ] Admin & support accounts created (promote via Admin → Users → role)
- [ ] Sitemap submitted to Google Search Console; OG images verified
- [ ] End-to-end test in production with real payment (small amount) including refund and payout
- [ ] Support email monitored; dispute SLA defined
