# RentNest architecture

## Overview

```
                 ┌──────────────────────────────┐
  Browser / PWA  │  React SPA (Vite)            │  Vercel / nginx / CDN
                 │  TanStack Query · socket.io  │
                 └──────────────┬───────────────┘
                                │ HTTPS  /api/v1  ·  wss /socket.io
                 ┌──────────────▼───────────────┐
                 │  API (Express 5, TypeScript) │  Render / Railway / ECS
                 │  REST + Socket.io + SEO      │──► Razorpay (orders, refunds, Route transfers)
                 └──┬─────────┬─────────┬───────┘──► S3 / R2 (images, invoices, KYC — private)
                    │         │         │        ──► Google Maps / Mapbox / Nominatim
          ┌─────────▼──┐ ┌────▼─────┐ ┌─▼─────────────┐ ► SMTP · MSG91/Twilio · Web Push · Sentry
          │ PostgreSQL │ │  Redis   │ │ Worker (BullMQ)│
          │ + PostGIS  │ │ cache/RL │ │ schedules/jobs │
          └────────────┘ └──────────┘ └────────────────┘
```

* **Monorepo** (`npm workspaces`): `server/` (API + worker) and `client/` (SPA).
* **Stateless API** — sessions via JWT + rotating refresh tokens; horizontal scaling
  with the socket.io Redis adapter and Redis-backed rate limits.
* **Worker** runs BullMQ jobs and repeatable schedules; can also run inside the API
  process for small deployments (`RUN_WORKERS_IN_API=true`).

## Server modules (`server/src/modules`)

| Module | Responsibility |
|---|---|
| `auth` | Phone/email OTP (Redis, hashed, attempt-limited), email+password (bcrypt), Google ID tokens, refresh-token rotation with reuse detection |
| `users` | Profile, preferences, wishlist, recently viewed, addresses, notifications, push, KYC upload, dashboard, analytics, DPDP export/erasure |
| `locations` | IP detection, reverse geocoding, autocomplete, **dynamic** city/locality registry |
| `categories` | Cached category tree |
| `listings` | CRUD, prohibited-item checks, locked fields while booked, quotas (Free/Pro), calendar blocks, quotes, PostGIS + full-text search |
| `bookings` | State machine, availability (row lock + exclusion constraint), handover/return checklists, inspection, reminders, overdue escalation, auto-completion |
| `pricing` | **Pure** functions: rent optimisation (hour/day/week/month), fees, GST, protection, cancellations, late fees |
| `payments` | Provider abstraction (Razorpay / mock), idempotent orders, capture handler shared by verify/webhook/reconciliation, refunds, ledger, reconciliation report |
| `payouts` | Escrow release to owners (netting penalties), onboarding (encrypted bank details) |
| `invoices` | Gap-free per-FY numbering, PDF receipts & commission invoices |
| `monetization` | Featured boosts, Owner Pro subscription |
| `chat` | Conversations, contact masking before confirmation, real-time delivery |
| `reviews` | Two-way reviews after completion, rating aggregates |
| `disputes` | Evidence, payout holds, admin resolution (deposit deduction/refunds) |
| `trust` | Prohibited items, masking, auto-flags (cancellations, off-platform, fake reviews, overdue), reports, blocks |
| `notifications` | In-app + socket + email/SMS/WhatsApp/push fan-out honouring preferences |
| `admin` | KPIs, funnel, city supply/demand + heatmap, moderation, KYC, refunds, payouts, settings, CSV export, audit log |
| `seo` | sitemap.xml, robots.txt, meta/JSON-LD for `/rent/...` and `/listing/...`, crawler snapshots |
| `settings` | Admin-configurable platform settings (fees, policies, thresholds…) cached with versioned invalidation |

## Booking state machine

```
REQUESTED ─accept─► ACCEPTED ─pay─► CONFIRMED ─handover(both)─► ACTIVE ─(past end + grace)─► OVERDUE
   │ decline/expire     │ expire/cancel   │ cancel (policy refund)      │ return(both)            │ return / auto-dispute
   ▼                    ▼                 ▼                             ▼                         ▼
DECLINED/EXPIRED     EXPIRED          CANCELLED                     RETURNED ─inspect ok / timeout─► COMPLETED
                                                                       └─damage claim─► DISPUTED ─admin resolves─┘
```

* Instant-book listings (verified owners only) create bookings directly in `ACCEPTED`
  with a short payment window.
* `ACCEPTED`, `CONFIRMED`, `ACTIVE`, `OVERDUE` hold the calendar. Requests don't, so a
  single renter can't squat dates; paying for one request auto-declines overlapping ones.

## Double-booking protection (defence in depth)

1. `SELECT … FOR UPDATE` on the listing row serialises concurrent attempts.
2. Conflict check against blocking bookings + owner blocks inside the same transaction.
3. PostgreSQL **exclusion constraint** `EXCLUDE USING gist (listingId WITH =, tstzrange(startAt,endAt) WITH &&) WHERE status IN (…)`
   guarantees correctness even if application code is bypassed.
4. A payment that arrives after dates became unavailable is refunded automatically.

## Money flow (escrow)

```
Renter pays total ──► Platform account (Razorpay)
   total = rent + service fee + protection + delivery + GST(on platform fees) + deposit
Ledger:  RENTER_PAYMENT(+total) · OWNER_PAYABLE(+owner share) · PLATFORM_REVENUE(+fees) · TAX_PAYABLE · DEPOSIT_HELD
On completion: deposit (− deductions) refunded · payout SCHEDULED (delay configurable) · Route transfer to owner
Owner share = rent − commission − GST on commission (+ delivery fee if owner delivers) (+ late-fee share) (+ damage compensation)
```

* All money is integer paise; every line is rounded once so totals always reconcile.
* Payment capture is idempotent (row lock on the Payment) and reachable from three
  paths: client verification, webhook, and the reconciliation job that polls the
  gateway for "paid but never confirmed" orders.
* Refund rows are written before calling the gateway and retried until processed.

## Location model

* Every listing stores exact `lat/lng` (private) and a deterministically **fuzzed**
  `approxLat/approxLng` (≈200–400 m). The PostGIS `location` column and all distance
  queries use the approximate point so distances can't triangulate an address.
* Exact pickup address and contacts are revealed only after payment (`CONFIRMED+`).
* City pages exist for every city that has at least one listing — cities and
  localities are created from geocoder results, never from a hard-coded list.
* Search modes: **radius** (crosses city borders) or **city** (sorted by distance from
  the user's locality); zero results return the nearest listings anywhere as `fallback`.

## Security

Helmet, CORS allow-list, Redis-backed rate limits (global, auth, OTP, writes, uploads),
Zod validation on every input, bcrypt(12), JWT (15 min) + httpOnly rotating refresh cookie
with reuse detection, CSRF guard (Origin + custom header) on cookie endpoints, RBAC
(USER / SUPPORT / ADMIN), AES-256-GCM for bank account numbers, private storage for KYC
& invoices, EXIF stripping on images, audit log for staff actions, soft deletes,
formula-injection-safe CSV exports, webhook HMAC verification, Sentry + pino logs with
secret redaction.
