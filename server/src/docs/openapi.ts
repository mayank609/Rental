/**
 * OpenAPI 3.1 document for /api/v1, served at /api/docs (Swagger UI) and
 * /api/docs/openapi.json. Endpoints are declared in a compact table; request
 * bodies are validated at runtime with Zod (see each module's *.schemas.ts).
 */
import { env } from "../config/env";

type M = "get" | "post" | "put" | "patch" | "delete";
type E = [M, string, string, string, ("auth" | "admin" | "support" | "public")?, Record<string, unknown>?];

const money = { type: "integer", description: "Amount in paise (1 INR = 100 paise)" };

const E: E[] = [
  // Auth
  ["post", "/auth/otp/request", "Auth", "Request OTP by SMS or email", "public", { phone: "string", email: "string", purpose: "login|verify_phone|verify_email|reset_password" }],
  ["post", "/auth/otp/verify", "Auth", "Verify OTP and sign in / sign up", "public", { phone: "string", email: "string", code: "string(6)", name: "string" }],
  ["post", "/auth/register", "Auth", "Register with email & password", "public", { name: "string", email: "string", password: "string", phone: "string", consent: "true" }],
  ["post", "/auth/login", "Auth", "Email & password login", "public", { email: "string", password: "string" }],
  ["post", "/auth/google", "Auth", "Google sign-in with ID token", "public", { idToken: "string" }],
  ["post", "/auth/refresh", "Auth", "Rotate refresh cookie → new access token (requires X-Requested-With)", "public"],
  ["post", "/auth/logout", "Auth", "Revoke current refresh token", "public"],
  ["post", "/auth/logout-all", "Auth", "Sign out on all devices", "auth"],
  ["get", "/auth/me", "Auth", "Current user", "auth"],
  ["post", "/auth/phone/request", "Auth", "Send OTP to link/verify phone", "auth", { phone: "string" }],
  ["post", "/auth/phone/verify", "Auth", "Verify phone OTP", "auth", { phone: "string", code: "string" }],
  ["post", "/auth/email/request", "Auth", "Send email verification OTP", "auth"],
  ["post", "/auth/email/verify", "Auth", "Verify email OTP", "auth", { code: "string" }],
  ["post", "/auth/password/forgot", "Auth", "Send password reset code", "public", { email: "string" }],
  ["post", "/auth/password/reset", "Auth", "Reset password with code", "public", { email: "string", code: "string", password: "string" }],
  ["post", "/auth/password/change", "Auth", "Change password", "auth", { currentPassword: "string", newPassword: "string" }],
  // Locations
  ["get", "/locations/detect", "Locations", "IP-based city detection (geolocation fallback)", "public"],
  ["get", "/locations/reverse", "Locations", "Reverse geocode ?lat&lng → city/locality", "public"],
  ["get", "/locations/search", "Locations", "Autocomplete cities/localities/pincodes ?q", "public"],
  ["get", "/locations/cities", "Locations", "Cities with active listings", "public"],
  ["get", "/locations/cities/{slug}", "Locations", "City with localities", "public"],
  ["get", "/locations/nearby-cities", "Locations", "Nearest cities with listings ?lat&lng", "public"],
  ["get", "/categories", "Catalog", "Category tree", "public"],
  ["get", "/categories/{slug}", "Catalog", "Category by slug", "public"],
  // Listings
  ["get", "/listings/search", "Listings", "Geo + full-text search. Query: q, city, locality, lat, lng, radiusKm, category, minPrice, maxPrice, startAt, endAt, minRating, delivery, instant, verified, bbox, sort, page, limit", "public"],
  ["get", "/listings/featured", "Listings", "Boosted listings ?city", "public"],
  ["get", "/listings/mine", "Listings", "My listings", "auth"],
  ["post", "/listings", "Listings", "Create listing (phone verification required)", "auth", { title: "string", description: "string", categoryId: "string", priceDaily: money, securityDeposit: money, address: "object", imageIds: "string[]" }],
  ["get", "/listings/{id}", "Listings", "Listing detail (approximate location only)", "public"],
  ["patch", "/listings/{id}", "Listings", "Update listing (critical fields locked while bookings exist)", "auth"],
  ["post", "/listings/{id}/status", "Listings", "Publish / pause / archive", "auth", { status: "ACTIVE|PAUSED|ARCHIVED" }],
  ["delete", "/listings/{id}", "Listings", "Soft-delete listing", "auth"],
  ["get", "/listings/{id}/availability", "Listings", "Unavailable ranges ?from&to", "public"],
  ["post", "/listings/{id}/blocks", "Listings", "Block dates (owner)", "auth", { startAt: "date-time", endAt: "date-time", reason: "string" }],
  ["delete", "/listings/{id}/blocks/{blockId}", "Listings", "Remove a date block", "auth"],
  ["get", "/listings/{id}/quote", "Listings", "Price breakdown ?startAt&endAt&protectionPlan&fulfillment", "public"],
  ["get", "/listings/{id}/similar", "Listings", "Similar nearby listings", "public"],
  ["get", "/listings/{id}/reviews", "Listings", "Listing reviews", "public"],
  ["post", "/uploads/images", "Uploads", "Upload up to 10 images (multipart 'files', ?purpose=listing|checklist|dispute|avatar|chat)", "auth"],
  // Bookings
  ["post", "/bookings", "Bookings", "Request / instant-book (agreement acceptance required)", "auth", { listingId: "string", startAt: "date-time", endAt: "date-time", fulfillment: "PICKUP|DELIVERY", protectionPlan: "boolean", agreementAccepted: "true" }],
  ["get", "/bookings", "Bookings", "My bookings ?role=renter|owner&scope=upcoming|active|past|action", "auth"],
  ["get", "/bookings/{id}", "Bookings", "Booking detail with timeline & allowed actions", "auth"],
  ["post", "/bookings/{id}/accept", "Bookings", "Owner accepts request", "auth"],
  ["post", "/bookings/{id}/decline", "Bookings", "Owner declines request", "auth", { reason: "string" }],
  ["post", "/bookings/{id}/cancel", "Bookings", "Cancel booking (refund per policy)", "auth", { reason: "string" }],
  ["get", "/bookings/{id}/cancellation-preview", "Bookings", "Preview refund for cancellation", "auth"],
  ["post", "/bookings/{id}/pay", "Bookings", "Create/resume payment order (idempotent)", "auth", { idempotencyKey: "string" }],
  ["post", "/bookings/{id}/checklists", "Bookings", "Submit handover/return checklist with photos", "auth", { type: "HANDOVER|RETURN", photos: "[{url,takenAt}]", items: "[{label,ok}]" }],
  ["post", "/bookings/{id}/inspection", "Bookings", "Owner inspection: ok or damage claim", "auth", { ok: "boolean", claimAmount: money, description: "string" }],
  // Payments
  ["post", "/payments/verify", "Payments", "Verify Razorpay checkout signature", "auth", { orderId: "string", paymentId: "string", signature: "string" }],
  ["post", "/payments/failed", "Payments", "Report checkout failure/dismissal", "auth"],
  ["post", "/payments/mock/pay", "Payments", "DEV: simulate payment (mock provider)", "auth"],
  ["get", "/payments", "Payments", "My payments & refunds", "auth"],
  ["post", "/webhooks/razorpay", "Payments", "Razorpay webhook (HMAC verified, idempotent)", "public"],
  ["get", "/payouts/account", "Payouts", "My payout account", "auth"],
  ["put", "/payouts/account", "Payouts", "Save bank / UPI details", "auth"],
  ["get", "/payouts", "Payouts", "My payouts & earnings summary", "auth"],
  ["get", "/invoices", "Invoices", "My invoices", "auth"],
  ["get", "/invoices/{id}/pdf", "Invoices", "Download invoice PDF", "auth"],
  ["get", "/monetization/plans", "Monetization", "Boost & Pro plans", "public"],
  ["post", "/monetization/promotions", "Monetization", "Buy a listing boost", "auth", { listingId: "string", planCode: "string" }],
  ["get", "/monetization/promotions", "Monetization", "My boosts", "auth"],
  ["get", "/monetization/subscription", "Monetization", "My Pro subscription", "auth"],
  ["post", "/monetization/subscription/pro", "Monetization", "Buy/renew Owner Pro", "auth"],
  ["post", "/monetization/subscription/cancel", "Monetization", "Cancel Pro renewal", "auth"],
  // Social / trust
  ["post", "/reviews", "Reviews", "Review after completed rental", "auth", { bookingId: "string", rating: "1-5", comment: "string" }],
  ["get", "/reviews/user/{userId}", "Reviews", "Reviews received by a user", "public"],
  ["get", "/chat/conversations", "Chat", "My conversations", "auth"],
  ["post", "/chat/conversations", "Chat", "Start conversation about a listing", "auth", { listingId: "string" }],
  ["get", "/chat/conversations/{id}", "Chat", "Conversation detail", "auth"],
  ["get", "/chat/conversations/{id}/messages", "Chat", "Messages (cursor ?before)", "auth"],
  ["post", "/chat/conversations/{id}/messages", "Chat", "Send message (contact info masked before confirmation)", "auth", { body: "string" }],
  ["post", "/chat/conversations/{id}/read", "Chat", "Mark read", "auth"],
  ["get", "/chat/unread-count", "Chat", "Unread count", "auth"],
  ["post", "/disputes", "Disputes", "Raise dispute", "auth", { bookingId: "string", type: "DAMAGE|NOT_RETURNED|...", description: "string", claimAmount: money }],
  ["get", "/disputes", "Disputes", "My disputes", "auth"],
  ["get", "/disputes/{id}", "Disputes", "Dispute detail", "auth"],
  ["post", "/disputes/{id}/evidence", "Disputes", "Add evidence", "auth", { url: "string", note: "string" }],
  ["post", "/reports", "Trust & Safety", "Report listing/user/message/review", "auth", { targetType: "LISTING|USER|MESSAGE|REVIEW", targetId: "string", reason: "string" }],
  // Users
  ["get", "/users/{id}", "Users", "Public profile", "public"],
  ["patch", "/users/me", "Users", "Update profile & preferences", "auth"],
  ["put", "/users/me/location", "Users", "Remember preferred city/locality", "auth"],
  ["get", "/users/me/dashboard", "Users", "Dashboard summary", "auth"],
  ["get", "/users/me/analytics", "Users", "Owner analytics (Pro)", "auth"],
  ["get", "/users/me/wishlist", "Users", "Wishlist", "auth"],
  ["post", "/users/me/wishlist/{listingId}", "Users", "Add to wishlist", "auth"],
  ["delete", "/users/me/wishlist/{listingId}", "Users", "Remove from wishlist", "auth"],
  ["get", "/users/me/recently-viewed", "Users", "Recently viewed", "auth"],
  ["get", "/users/me/addresses", "Users", "Saved addresses", "auth"],
  ["post", "/users/me/addresses", "Users", "Add address", "auth"],
  ["delete", "/users/me/addresses/{id}", "Users", "Delete address", "auth"],
  ["get", "/users/me/notifications", "Users", "Notifications", "auth"],
  ["post", "/users/me/notifications/read", "Users", "Mark notifications read", "auth"],
  ["get", "/users/push/vapid-key", "Users", "Web push public key", "public"],
  ["post", "/users/me/push-subscriptions", "Users", "Register push subscription", "auth"],
  ["get", "/users/me/kyc", "Users", "KYC status", "auth"],
  ["post", "/users/me/kyc", "Users", "Upload KYC document (multipart file, docType, docNumber)", "auth"],
  ["get", "/users/me/export", "Users", "Export my data (DPDP)", "auth"],
  ["get", "/users/me/deletion-check", "Users", "Can my account be deleted?", "auth"],
  ["delete", "/users/me", "Users", "Delete account (blocked while rentals/payouts are open)", "auth", { confirm: "DELETE" }],
  ["post", "/users/{id}/block", "Users", "Block user", "auth"],
  ["delete", "/users/{id}/block", "Users", "Unblock user", "auth"],
  ["get", "/legal/rental-agreement", "Legal", "Current rental agreement", "public"],
  ["get", "/legal/config", "Legal", "Public platform configuration (fees, policies)", "public"],
  // Admin
  ["get", "/admin/dashboard", "Admin", "KPIs, GMV, revenue, funnel, per-city, top categories ?days", "support"],
  ["get", "/admin/analytics/cities", "Admin", "Supply vs demand per city", "support"],
  ["get", "/admin/analytics/heatmap", "Admin", "Heatmap points ?city", "support"],
  ["get", "/admin/users", "Admin", "Search users", "support"],
  ["get", "/admin/users/{id}", "Admin", "User detail", "support"],
  ["patch", "/admin/users/{id}", "Admin", "Suspend/ban/role", "support"],
  ["get", "/admin/kyc", "Admin", "KYC queue", "support"],
  ["get", "/admin/kyc/{id}/file", "Admin", "View KYC document (audited)", "support"],
  ["post", "/admin/kyc/{id}/review", "Admin", "Approve/reject KYC", "support"],
  ["get", "/admin/listings", "Admin", "Listings & moderation queue", "support"],
  ["post", "/admin/listings/{id}/moderate", "Admin", "approve|reject|pause|verify|feature", "support"],
  ["get", "/admin/bookings", "Admin", "Bookings", "support"],
  ["get", "/admin/bookings/{id}", "Admin", "Booking detail", "support"],
  ["post", "/admin/bookings/{id}/cancel", "Admin", "Cancel booking", "support"],
  ["get", "/admin/disputes", "Admin", "Disputes", "support"],
  ["post", "/admin/disputes/{id}/review", "Admin", "Mark under review", "support"],
  ["post", "/admin/disputes/{id}/resolve", "Admin", "Resolve dispute", "support"],
  ["get", "/admin/payments", "Admin", "Payments", "support"],
  ["post", "/admin/payments/{id}/refund", "Admin", "Manual refund", "admin"],
  ["get", "/admin/payouts", "Admin", "Payouts", "support"],
  ["post", "/admin/payouts/{id}/{action}", "Admin", "hold|release|retry|cancel", "admin"],
  ["post", "/admin/payouts-run", "Admin", "Process due payouts now", "admin"],
  ["get", "/admin/reconciliation", "Admin", "Reconciliation report", "admin"],
  ["post", "/admin/reconciliation/run", "Admin", "Run reconciliation now", "admin"],
  ["get", "/admin/webhooks", "Admin", "Webhook events", "admin"],
  ["post", "/admin/webhooks/{id}/retry", "Admin", "Retry webhook", "admin"],
  ["get", "/admin/reports", "Admin", "User reports", "support"],
  ["post", "/admin/reports/{id}", "Admin", "Action/dismiss report", "support"],
  ["get", "/admin/flags", "Admin", "Auto-flags", "support"],
  ["post", "/admin/flags/{id}", "Admin", "Action/dismiss flag", "support"],
  ["post", "/admin/reviews/{id}/visibility", "Admin", "Hide/unhide review", "support"],
  ["get", "/admin/settings", "Admin", "Platform settings", "support"],
  ["put", "/admin/settings/{key}", "Admin", "Update settings group (fees, cancellationPolicies, booking, trust, featuredPlans, pro, legal)", "admin"],
  ["get", "/admin/categories", "Admin", "Categories", "support"],
  ["post", "/admin/categories", "Admin", "Create category", "admin"],
  ["patch", "/admin/categories/{id}", "Admin", "Update category", "admin"],
  ["delete", "/admin/categories/{id}", "Admin", "Delete/deactivate category", "admin"],
  ["get", "/admin/cities", "Admin", "Cities", "support"],
  ["patch", "/admin/cities/{id}", "Admin", "Update city", "admin"],
  ["get", "/admin/audit-logs", "Admin", "Audit trail", "support"],
  ["get", "/admin/export/{entity}", "Admin", "CSV export: bookings|payments|payouts|users|listings|ledger", "admin"],
];

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [method, path, tag, summary, access = "auth", body] of E) {
    const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    paths[path] ??= {};
    paths[path][method] = {
      tags: [tag],
      summary,
      ...(access !== "public" ? { security: [{ bearerAuth: [] }] } : {}),
      ...(access === "admin" ? { description: "Requires ADMIN role" } : access === "support" ? { description: "Requires SUPPORT or ADMIN role" } : {}),
      parameters: params,
      ...(body
        ? {
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? { type: "string", description: v } : v])) },
                },
              },
            },
          }
        : {}),
      responses: {
        "200": { description: "OK" },
        "400": { $ref: "#/components/responses/Error" },
        ...(access !== "public" ? { "401": { $ref: "#/components/responses/Error" } } : {}),
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: `${env.PLATFORM_NAME} API`,
      version: "1.0.0",
      description: "Peer-to-peer rental marketplace API. All amounts are integers in paise. All timestamps are ISO-8601 UTC.",
    },
    servers: [{ url: `${env.API_URL}/api/v1` }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      responses: {
        Error: {
          description: "Error",
          content: { "application/json": { schema: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} } } } } } },
        },
      },
    },
    paths,
  };
}

export const endpointCount = E.length;
