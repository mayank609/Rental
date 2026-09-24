# RentNest API reference

Base URL: `{API_URL}/api/v1` · Interactive docs (Swagger UI): `{API_URL}/api/docs` · OpenAPI JSON: `{API_URL}/api/docs/openapi.json`

Conventions:
- Auth: `Authorization: Bearer <accessToken>` (15 min JWT). Refresh via `POST /auth/refresh` using the httpOnly `rn_rt` cookie + `X-Requested-With: XMLHttpRequest` header.
- **Money is always an integer in paise** (₹1 = 100). Timestamps are ISO-8601 UTC.
- Errors: `{ "error": { "code": "DATES_UNAVAILABLE", "message": "…", "details": … } }` with appropriate HTTP status.
- Lists are paginated: `?page=&limit=` → `meta: { total, page, limit, totalPages }`.

Access: 🌐 public · 🔑 signed-in user · 🛟 support/admin · 🛡️ admin only

## Auth

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/otp/request` | 🌐 | Request OTP by SMS or email |
| `POST` | `/auth/otp/verify` | 🌐 | Verify OTP and sign in / sign up |
| `POST` | `/auth/register` | 🌐 | Register with email & password |
| `POST` | `/auth/login` | 🌐 | Email & password login |
| `POST` | `/auth/google` | 🌐 | Google sign-in with ID token |
| `POST` | `/auth/refresh` | 🌐 | Rotate refresh cookie → new access token (requires X-Requested-With) |
| `POST` | `/auth/logout` | 🌐 | Revoke current refresh token |
| `POST` | `/auth/logout-all` | 🔑 | Sign out on all devices |
| `GET` | `/auth/me` | 🔑 | Current user |
| `POST` | `/auth/phone/request` | 🔑 | Send OTP to link/verify phone |
| `POST` | `/auth/phone/verify` | 🔑 | Verify phone OTP |
| `POST` | `/auth/email/request` | 🔑 | Send email verification OTP |
| `POST` | `/auth/email/verify` | 🔑 | Verify email OTP |
| `POST` | `/auth/password/forgot` | 🌐 | Send password reset code |
| `POST` | `/auth/password/reset` | 🌐 | Reset password with code |
| `POST` | `/auth/password/change` | 🔑 | Change password |

## Locations

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/locations/detect` | 🌐 | IP-based city detection (geolocation fallback) |
| `GET` | `/locations/reverse` | 🌐 | Reverse geocode ?lat&lng → city/locality |
| `GET` | `/locations/search` | 🌐 | Autocomplete cities/localities/pincodes ?q |
| `GET` | `/locations/cities` | 🌐 | Cities with active listings |
| `GET` | `/locations/cities/{slug}` | 🌐 | City with localities |
| `GET` | `/locations/nearby-cities` | 🌐 | Nearest cities with listings ?lat&lng |

## Catalog

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/categories` | 🌐 | Category tree |
| `GET` | `/categories/{slug}` | 🌐 | Category by slug |

## Listings

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/listings/search` | 🌐 | Geo + full-text search. Query: q, city, locality, lat, lng, radiusKm, category, minPrice, maxPrice, startAt, endAt, minRating, delivery, instant, verified, bbox, sort, page, limit |
| `GET` | `/listings/featured` | 🌐 | Boosted listings ?city |
| `GET` | `/listings/mine` | 🔑 | My listings |
| `POST` | `/listings` | 🔑 | Create listing (phone verification required) |
| `GET` | `/listings/{id}` | 🌐 | Listing detail (approximate location only) |
| `PATCH` | `/listings/{id}` | 🔑 | Update listing (critical fields locked while bookings exist) |
| `DELETE` | `/listings/{id}` | 🔑 | Soft-delete listing |
| `POST` | `/listings/{id}/status` | 🔑 | Publish / pause / archive |
| `GET` | `/listings/{id}/availability` | 🌐 | Unavailable ranges ?from&to |
| `POST` | `/listings/{id}/blocks` | 🔑 | Block dates (owner) |
| `DELETE` | `/listings/{id}/blocks/{blockId}` | 🔑 | Remove a date block |
| `GET` | `/listings/{id}/quote` | 🌐 | Price breakdown ?startAt&endAt&protectionPlan&fulfillment |
| `GET` | `/listings/{id}/similar` | 🌐 | Similar nearby listings |
| `GET` | `/listings/{id}/reviews` | 🌐 | Listing reviews |

## Uploads

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/uploads/images` | 🔑 | Upload up to 10 images (multipart 'files', ?purpose=listing|checklist|dispute|avatar|chat) |

## Bookings

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/bookings` | 🔑 | Request / instant-book (agreement acceptance required) |
| `GET` | `/bookings` | 🔑 | My bookings ?role=renter|owner&scope=upcoming|active|past|action |
| `GET` | `/bookings/{id}` | 🔑 | Booking detail with timeline & allowed actions |
| `POST` | `/bookings/{id}/accept` | 🔑 | Owner accepts request |
| `POST` | `/bookings/{id}/decline` | 🔑 | Owner declines request |
| `POST` | `/bookings/{id}/cancel` | 🔑 | Cancel booking (refund per policy) |
| `GET` | `/bookings/{id}/cancellation-preview` | 🔑 | Preview refund for cancellation |
| `POST` | `/bookings/{id}/pay` | 🔑 | Create/resume payment order (idempotent) |
| `POST` | `/bookings/{id}/checklists` | 🔑 | Submit handover/return checklist with photos |
| `POST` | `/bookings/{id}/inspection` | 🔑 | Owner inspection: ok or damage claim |

## Payments

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/payments/verify` | 🔑 | Verify Razorpay checkout signature |
| `POST` | `/payments/failed` | 🔑 | Report checkout failure/dismissal |
| `POST` | `/payments/mock/pay` | 🔑 | DEV: simulate payment (mock provider) |
| `GET` | `/payments` | 🔑 | My payments & refunds |
| `POST` | `/webhooks/razorpay` | 🌐 | Razorpay webhook (HMAC verified, idempotent) |

## Payouts

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/payouts/account` | 🔑 | My payout account |
| `PUT` | `/payouts/account` | 🔑 | Save bank / UPI details |
| `GET` | `/payouts` | 🔑 | My payouts & earnings summary |

## Invoices

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/invoices` | 🔑 | My invoices |
| `GET` | `/invoices/{id}/pdf` | 🔑 | Download invoice PDF |

## Monetization

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/monetization/plans` | 🌐 | Boost & Pro plans |
| `POST` | `/monetization/promotions` | 🔑 | Buy a listing boost |
| `GET` | `/monetization/promotions` | 🔑 | My boosts |
| `GET` | `/monetization/subscription` | 🔑 | My Pro subscription |
| `POST` | `/monetization/subscription/pro` | 🔑 | Buy/renew Owner Pro |
| `POST` | `/monetization/subscription/cancel` | 🔑 | Cancel Pro renewal |

## Reviews

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/reviews` | 🔑 | Review after completed rental |
| `GET` | `/reviews/user/{userId}` | 🌐 | Reviews received by a user |

## Chat

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/chat/conversations` | 🔑 | My conversations |
| `POST` | `/chat/conversations` | 🔑 | Start conversation about a listing |
| `GET` | `/chat/conversations/{id}` | 🔑 | Conversation detail |
| `GET` | `/chat/conversations/{id}/messages` | 🔑 | Messages (cursor ?before) |
| `POST` | `/chat/conversations/{id}/messages` | 🔑 | Send message (contact info masked before confirmation) |
| `POST` | `/chat/conversations/{id}/read` | 🔑 | Mark read |
| `GET` | `/chat/unread-count` | 🔑 | Unread count |

## Disputes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/disputes` | 🔑 | Raise dispute |
| `GET` | `/disputes` | 🔑 | My disputes |
| `GET` | `/disputes/{id}` | 🔑 | Dispute detail |
| `POST` | `/disputes/{id}/evidence` | 🔑 | Add evidence |

## Trust & Safety

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/reports` | 🔑 | Report listing/user/message/review |

## Users

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/users/{id}` | 🌐 | Public profile |
| `PATCH` | `/users/me` | 🔑 | Update profile & preferences |
| `DELETE` | `/users/me` | 🔑 | Delete account (blocked while rentals/payouts are open) |
| `PUT` | `/users/me/location` | 🔑 | Remember preferred city/locality |
| `GET` | `/users/me/dashboard` | 🔑 | Dashboard summary |
| `GET` | `/users/me/analytics` | 🔑 | Owner analytics (Pro) |
| `GET` | `/users/me/wishlist` | 🔑 | Wishlist |
| `POST` | `/users/me/wishlist/{listingId}` | 🔑 | Add to wishlist |
| `DELETE` | `/users/me/wishlist/{listingId}` | 🔑 | Remove from wishlist |
| `GET` | `/users/me/recently-viewed` | 🔑 | Recently viewed |
| `GET` | `/users/me/addresses` | 🔑 | Saved addresses |
| `POST` | `/users/me/addresses` | 🔑 | Add address |
| `DELETE` | `/users/me/addresses/{id}` | 🔑 | Delete address |
| `GET` | `/users/me/notifications` | 🔑 | Notifications |
| `POST` | `/users/me/notifications/read` | 🔑 | Mark notifications read |
| `GET` | `/users/push/vapid-key` | 🌐 | Web push public key |
| `POST` | `/users/me/push-subscriptions` | 🔑 | Register push subscription |
| `GET` | `/users/me/kyc` | 🔑 | KYC status |
| `POST` | `/users/me/kyc` | 🔑 | Upload KYC document (multipart file, docType, docNumber) |
| `GET` | `/users/me/export` | 🔑 | Export my data (DPDP) |
| `GET` | `/users/me/deletion-check` | 🔑 | Can my account be deleted? |
| `POST` | `/users/{id}/block` | 🔑 | Block user |
| `DELETE` | `/users/{id}/block` | 🔑 | Unblock user |

## Legal

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/legal/rental-agreement` | 🌐 | Current rental agreement |
| `GET` | `/legal/config` | 🌐 | Public platform configuration (fees, policies) |

## Admin

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/admin/dashboard` | 🛟 | KPIs, GMV, revenue, funnel, per-city, top categories ?days |
| `GET` | `/admin/analytics/cities` | 🛟 | Supply vs demand per city |
| `GET` | `/admin/analytics/heatmap` | 🛟 | Heatmap points ?city |
| `GET` | `/admin/users` | 🛟 | Search users |
| `GET` | `/admin/users/{id}` | 🛟 | User detail |
| `PATCH` | `/admin/users/{id}` | 🛟 | Suspend/ban/role |
| `GET` | `/admin/kyc` | 🛟 | KYC queue |
| `GET` | `/admin/kyc/{id}/file` | 🛟 | View KYC document (audited) |
| `POST` | `/admin/kyc/{id}/review` | 🛟 | Approve/reject KYC |
| `GET` | `/admin/listings` | 🛟 | Listings & moderation queue |
| `POST` | `/admin/listings/{id}/moderate` | 🛟 | approve|reject|pause|verify|feature |
| `GET` | `/admin/bookings` | 🛟 | Bookings |
| `GET` | `/admin/bookings/{id}` | 🛟 | Booking detail |
| `POST` | `/admin/bookings/{id}/cancel` | 🛟 | Cancel booking |
| `GET` | `/admin/disputes` | 🛟 | Disputes |
| `POST` | `/admin/disputes/{id}/review` | 🛟 | Mark under review |
| `POST` | `/admin/disputes/{id}/resolve` | 🛟 | Resolve dispute |
| `GET` | `/admin/payments` | 🛟 | Payments |
| `POST` | `/admin/payments/{id}/refund` | 🛡️ | Manual refund |
| `GET` | `/admin/payouts` | 🛟 | Payouts |
| `POST` | `/admin/payouts/{id}/{action}` | 🛡️ | hold|release|retry|cancel |
| `POST` | `/admin/payouts-run` | 🛡️ | Process due payouts now |
| `GET` | `/admin/reconciliation` | 🛡️ | Reconciliation report |
| `POST` | `/admin/reconciliation/run` | 🛡️ | Run reconciliation now |
| `GET` | `/admin/webhooks` | 🛡️ | Webhook events |
| `POST` | `/admin/webhooks/{id}/retry` | 🛡️ | Retry webhook |
| `GET` | `/admin/reports` | 🛟 | User reports |
| `POST` | `/admin/reports/{id}` | 🛟 | Action/dismiss report |
| `GET` | `/admin/flags` | 🛟 | Auto-flags |
| `POST` | `/admin/flags/{id}` | 🛟 | Action/dismiss flag |
| `POST` | `/admin/reviews/{id}/visibility` | 🛟 | Hide/unhide review |
| `GET` | `/admin/settings` | 🛟 | Platform settings |
| `PUT` | `/admin/settings/{key}` | 🛡️ | Update settings group (fees, cancellationPolicies, booking, trust, featuredPlans, pro, legal) |
| `GET` | `/admin/categories` | 🛟 | Categories |
| `POST` | `/admin/categories` | 🛡️ | Create category |
| `PATCH` | `/admin/categories/{id}` | 🛡️ | Update category |
| `DELETE` | `/admin/categories/{id}` | 🛡️ | Delete/deactivate category |
| `GET` | `/admin/cities` | 🛟 | Cities |
| `PATCH` | `/admin/cities/{id}` | 🛡️ | Update city |
| `GET` | `/admin/audit-logs` | 🛟 | Audit trail |
| `GET` | `/admin/export/{entity}` | 🛡️ | CSV export: bookings|payments|payouts|users|listings|ledger |

## Real-time (socket.io)

Connect to `{API_URL}` with path `/socket.io` and `auth: { token: <accessToken> }`.

| Direction | Event | Payload |
|---|---|---|
| client → server | `chat:join` / `chat:leave` | conversationId |
| client → server | `chat:send` | `{ conversationId, body, attachments? }` (ack `{ ok, message }`) |
| client → server | `chat:typing` / `chat:read` | conversationId |
| server → client | `chat:message` | Message |
| server → client | `chat:typing` / `chat:read` | `{ conversationId, userId }` |
| server → client | `notification` | Notification |

## Webhooks

`POST /api/v1/webhooks/razorpay` — configure in the Razorpay dashboard with events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`, `transfer.processed`, `transfer.failed`. Signature (`X-Razorpay-Signature`) is verified with `RAZORPAY_WEBHOOK_SECRET`; deliveries are de-duplicated by `X-Razorpay-Event-Id`.

_145 REST endpoints._
