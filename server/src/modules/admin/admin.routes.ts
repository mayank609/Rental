/**
 * /api/v1/admin — operations console API.
 * SUPPORT: read + moderation + disputes + KYC. ADMIN: everything incl.
 * money movement, settings, categories and exports.
 */
import { Router } from "express";
import { z } from "zod";
import type { Prisma as P } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { clientIp } from "../../middleware/security";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import { audit } from "../../lib/audit";
import { invalidate } from "../../lib/cache";
import { storage } from "../../lib/storage";
import { pageMeta, paginate, slugify, DAY } from "../../lib/util";
import { dashboard, cityAnalytics, heatmap } from "./admin.analytics";
import { toCsv } from "./csv";
import { getSettings, updateSetting } from "../settings/settings.service";
import { SETTINGS_KEYS, DEFAULT_SETTINGS } from "../settings/settings.defaults";
import { selfUser } from "../users/users.serializers";
import { ownerListing } from "../listings/listings.serializers";
import { listingInclude } from "../listings/listings.service";
import { bookingDetail } from "../bookings/bookings.serializers";
import { cancelBooking } from "../bookings/bookings.service";
import { resolveDispute } from "../disputes/disputes.service";
import { refundPayment, reconciliationReport, reconcilePayments, processWebhook } from "../payments/payments.service";
import { processDuePayouts, releaseHeldPayouts } from "../payouts/payouts.service";
import { refreshCityCounts } from "../locations/locations.service";
import { notify } from "../notifications/notifications.service";
import { revokeAllSessions } from "../auth/auth.service";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("SUPPORT"));
const adminOnly = requireRole("ADMIN");

const pageQ = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), q: z.string().max(100).optional(), status: z.string().optional() });
type PageQ = z.infer<typeof pageQ>;

// ---------------------------------------------------------------- analytics
adminRouter.get("/dashboard", validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }), async (req, res) => {
  res.json(await dashboard((req.query as unknown as { days: number }).days));
});
adminRouter.get("/analytics/cities", validate({ query: z.object({ days: z.coerce.number().int().default(30) }) }), async (req, res) => {
  res.json({ cities: await cityAnalytics((req.query as unknown as { days: number }).days) });
});
adminRouter.get("/analytics/heatmap", validate({ query: z.object({ city: z.string().optional(), days: z.coerce.number().int().default(30) }) }), async (req, res) => {
  const q = req.query as unknown as { city?: string; days: number };
  res.json(await heatmap(q.city, q.days));
});

// -------------------------------------------------------------------- users
adminRouter.get("/users", validate({ query: pageQ.extend({ role: z.string().optional(), kyc: z.string().optional(), flagged: z.coerce.boolean().optional() }) }), async (req, res) => {
  const q = req.query as unknown as PageQ & { role?: string; kyc?: string; flagged?: boolean };
  const where: P.UserWhereInput = {
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }, { phone: { contains: q.q } }, { id: q.q }] } : {}),
    ...(q.status ? { status: q.status as never } : {}),
    ...(q.role ? { role: q.role as never } : {}),
    ...(q.kyc ? { kycStatus: q.kyc as never } : {}),
    ...(q.flagged ? { flags: { some: { status: "OPEN" } } } : {}),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, include: { subscription: true, _count: { select: { listings: true, rentals: true, flags: { where: { status: "OPEN" } } } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.user.count({ where }),
  ]);
  res.json({ users: users.map((u) => ({ ...selfUser(u), counts: u._count, cancellationCount: u.cancellationCount, offPlatformAttempts: u.offPlatformAttempts, lastLoginAt: u.lastLoginAt })), meta: pageMeta(total, q.page, q.limit) });
});

adminRouter.get("/users/:id", async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id }, include: { subscription: true, payoutAccount: true, kycDocuments: { orderBy: { createdAt: "desc" } }, flags: { orderBy: { createdAt: "desc" }, take: 20 } } });
  if (!u) throw notFound("User");
  const [bookings, listings, audits] = await Promise.all([
    prisma.booking.findMany({ where: { OR: [{ renterId: u.id }, { ownerId: u.id }] }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, code: true, status: true, totalAmount: true, renterId: true, createdAt: true } }),
    prisma.listing.findMany({ where: { ownerId: u.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, status: true, createdAt: true, deletedAt: true } }),
    prisma.auditLog.findMany({ where: { entityType: "User", entityId: u.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  res.json({
    user: { ...selfUser(u), statusReason: u.statusReason, cancellationCount: u.cancellationCount, offPlatformAttempts: u.offPlatformAttempts, lastLoginAt: u.lastLoginAt, deletedAt: u.deletedAt },
    payoutAccount: u.payoutAccount ? { method: u.payoutAccount.method, status: u.payoutAccount.status, last4: u.payoutAccount.accountNumberLast4, ifsc: u.payoutAccount.ifsc, upiId: u.payoutAccount.upiId } : null,
    kycDocuments: u.kycDocuments.map((d) => ({ id: d.id, docType: d.docType, docNumberMasked: d.docNumberMasked, status: d.status, rejectionReason: d.rejectionReason, createdAt: d.createdAt })),
    flags: u.flags,
    bookings,
    listings,
    audits,
  });
});

adminRouter.patch(
  "/users/:id",
  validate({ body: z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).optional(), statusReason: z.string().max(500).optional(), role: z.enum(["USER", "SUPPORT", "ADMIN"]).optional() }) }),
  async (req, res) => {
    if (req.body.role && req.user!.role !== "ADMIN") throw badRequest("Only admins can change roles");
    if (req.params.id === req.user!.id) throw badRequest("You can't modify your own account here");
    const before = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
    const u = await prisma.user.update({ where: { id: req.params.id }, data: req.body, include: { subscription: true } });
    if (req.body.status && req.body.status !== "ACTIVE") {
      await revokeAllSessions(u.id);
      // Hide their listings from search while restricted
      await prisma.listing.updateMany({ where: { ownerId: u.id, status: "ACTIVE" }, data: { status: "PAUSED" } });
      await invalidate("listings");
    }
    await audit({ actorId: req.user!.id, action: "user.update", entityType: "User", entityId: u.id, before: { status: before.status, role: before.role }, after: req.body, ip: clientIp(req) });
    res.json({ user: selfUser(u) });
  },
);

// ---------------------------------------------------------------------- KYC
adminRouter.get("/kyc", validate({ query: pageQ }), async (req, res) => {
  const q = req.query as unknown as PageQ;
  const where = { status: (q.status ?? "PENDING") as never };
  const [docs, total] = await Promise.all([
    prisma.kycDocument.findMany({ where, include: { user: { select: { id: true, name: true, email: true, phone: true } } }, orderBy: { createdAt: "asc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.kycDocument.count({ where }),
  ]);
  res.json({ documents: docs.map(({ fileKey, ...d }) => ({ ...d, hasFile: Boolean(fileKey) })), meta: pageMeta(total, q.page, q.limit) });
});

/** Stream a private KYC document (audited). */
adminRouter.get("/kyc/:id/file", async (req, res) => {
  const d = await prisma.kycDocument.findUnique({ where: { id: req.params.id } });
  if (!d) throw notFound("Document");
  await audit({ actorId: req.user!.id, action: "kyc.view", entityType: "KycDocument", entityId: d.id, ip: clientIp(req) });
  const file = await storage.get(d.fileKey);
  res.setHeader("Content-Type", d.fileKey.endsWith(".pdf") ? "application/pdf" : `image/${d.fileKey.split(".").pop()}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(file);
});

adminRouter.post("/kyc/:id/review", validate({ body: z.object({ approve: z.boolean(), reason: z.string().max(500).optional() }) }), async (req, res) => {
  const d = await prisma.kycDocument.findUnique({ where: { id: req.params.id } });
  if (!d) throw notFound("Document");
  const status = req.body.approve ? "VERIFIED" : "REJECTED";
  await prisma.$transaction([
    prisma.kycDocument.update({ where: { id: d.id }, data: { status, rejectionReason: req.body.approve ? null : req.body.reason, reviewedById: req.user!.id, reviewedAt: new Date() } }),
    prisma.user.update({ where: { id: d.userId }, data: { kycStatus: status } }),
    prisma.payoutAccount.updateMany({ where: { userId: d.userId }, data: { status: req.body.approve ? "VERIFIED" : "PENDING" } }),
  ]);
  if (req.body.approve) await releaseHeldPayouts(d.userId);
  await audit({ actorId: req.user!.id, action: `kyc.${status.toLowerCase()}`, entityType: "User", entityId: d.userId, after: { documentId: d.id, reason: req.body.reason } });
  await notify(d.userId, "kyc.updated", {
    title: req.body.approve ? "ID verified ✅" : "ID verification unsuccessful",
    body: req.body.approve ? "Your identity is verified. You now have a verified badge and can enable instant booking." : `We couldn't verify your document${req.body.reason ? `: ${req.body.reason}` : ""}. Please upload a clearer copy.`,
    url: "/dashboard/settings",
    channels: ["email", "push"],
  });
  res.json({ ok: true, status });
});

// ----------------------------------------------------------------- listings
adminRouter.get("/listings", validate({ query: pageQ.extend({ city: z.string().optional() }) }), async (req, res) => {
  const q = req.query as unknown as PageQ & { city?: string };
  const where: P.ListingWhereInput = {
    deletedAt: null,
    ...(q.status ? { status: q.status as never } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { id: q.q }] } : {}),
    ...(q.city ? { city: { slug: q.city } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.listing.findMany({ where, include: { ...listingInclude, address: true, _count: { select: { flags: { where: { status: "OPEN" } } } } }, orderBy: { updatedAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.listing.count({ where }),
  ]);
  res.json({ listings: items.map((l) => ({ ...ownerListing(l), openFlags: l._count.flags })), meta: pageMeta(total, q.page, q.limit) });
});

adminRouter.post(
  "/listings/:id/moderate",
  validate({ body: z.object({ action: z.enum(["approve", "reject", "pause", "verify", "unverify", "feature", "unfeature"]), reason: z.string().max(500).optional(), days: z.coerce.number().int().min(1).max(90).optional() }) }),
  async (req, res) => {
    const l = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!l) throw notFound("Listing");
    const { action, reason, days } = req.body as { action: string; reason?: string; days?: number };
    const data: P.ListingUpdateInput = {};
    switch (action) {
      case "approve": data.status = "ACTIVE"; data.rejectionReason = null; data.publishedAt = l.publishedAt ?? new Date(); break;
      case "reject": if (!reason) throw badRequest("A reason is required"); data.status = "REJECTED"; data.rejectionReason = reason; break;
      case "pause": data.status = "PAUSED"; break;
      case "verify": data.isVerified = true; break;
      case "unverify": data.isVerified = false; break;
      case "feature": data.featuredUntil = new Date(Date.now() + (days ?? 7) * DAY); break;
      case "unfeature": data.featuredUntil = null; break;
    }
    const updated = await prisma.listing.update({ where: { id: l.id }, data });
    await audit({ actorId: req.user!.id, action: `listing.${action}`, entityType: "Listing", entityId: l.id, before: { status: l.status }, after: { ...data, reason } });
    await refreshCityCounts(l.cityId);
    await invalidate("listings");
    if (action === "approve") await notify(l.ownerId, "listing.approved", { title: "Listing approved", body: `"${l.title}" is now live.`, url: `/listing/${l.id}` });
    if (action === "reject") await notify(l.ownerId, "listing.rejected", { title: "Listing needs changes", body: `"${l.title}" was not approved: ${reason}`, url: `/dashboard/listings/${l.id}/edit` });
    res.json({ listing: { id: updated.id, status: updated.status, isVerified: updated.isVerified, featuredUntil: updated.featuredUntil } });
  },
);

// ----------------------------------------------------------------- bookings
adminRouter.get("/bookings", validate({ query: pageQ }), async (req, res) => {
  const q = req.query as unknown as PageQ;
  const where: P.BookingWhereInput = {
    ...(q.status ? { status: { in: q.status.split(",") as never[] } } : {}),
    ...(q.q ? { OR: [{ code: { contains: q.q.toUpperCase() } }, { id: q.q }, { renter: { name: { contains: q.q, mode: "insensitive" } } }, { owner: { name: { contains: q.q, mode: "insensitive" } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: { listing: { select: { id: true, title: true, city: { select: { name: true } } } }, renter: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.booking.count({ where }),
  ]);
  res.json({ bookings: items, meta: pageMeta(total, q.page, q.limit) });
});
adminRouter.get("/bookings/:id", async (req, res) => {
  res.json({ booking: await bookingDetail(req.params.id, req.user!.id, true) });
});
adminRouter.post("/bookings/:id/cancel", validate({ body: z.object({ reason: z.string().min(3).max(500) }) }), async (req, res) => {
  const r = await cancelBooking(req.params.id, req.user!, req.body.reason);
  await audit({ actorId: req.user!.id, action: "booking.admin_cancel", entityType: "Booking", entityId: req.params.id, after: { reason: req.body.reason, outcome: r.outcome } });
  res.json({ outcome: r.outcome });
});

// ----------------------------------------------------------------- disputes
adminRouter.get("/disputes", validate({ query: pageQ }), async (req, res) => {
  const q = req.query as unknown as PageQ;
  const where: P.DisputeWhereInput = q.status ? { status: { in: q.status.split(",") as never[] } } : {};
  const [items, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      include: { booking: { select: { id: true, code: true, depositAmount: true, rentAmount: true, listing: { select: { title: true } } } }, raisedBy: { select: { id: true, name: true } }, against: { select: { id: true, name: true } }, _count: { select: { evidence: true } } },
      orderBy: { createdAt: "asc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.dispute.count({ where }),
  ]);
  res.json({ disputes: items, meta: pageMeta(total, q.page, q.limit) });
});
adminRouter.post("/disputes/:id/review", async (req, res) => {
  const d = await prisma.dispute.update({ where: { id: req.params.id }, data: { status: "UNDER_REVIEW" } });
  for (const uid of [d.raisedById, d.againstId]) await notify(uid, "dispute.updated", { title: "Dispute under review", body: "A specialist is now reviewing your case.", url: `/dashboard/disputes/${d.id}`, channels: ["push"] });
  res.json({ dispute: d });
});
adminRouter.post(
  "/disputes/:id/resolve",
  validate({ body: z.object({ decision: z.enum(["RESOLVED", "REJECTED"]), resolution: z.string().min(5).max(4000), depositDeduction: z.coerce.number().int().min(0).default(0), refundAmount: z.coerce.number().int().min(0).default(0) }) }),
  async (req, res) => {
    res.json({ dispute: await resolveDispute(req.params.id, req.user!.id, req.body) });
  },
);

// ---------------------------------------------------------------- payments
adminRouter.get("/payments", validate({ query: pageQ }), async (req, res) => {
  const q = req.query as unknown as PageQ;
  const where: P.PaymentWhereInput = {
    ...(q.status ? { status: q.status as never } : {}),
    ...(q.q ? { OR: [{ providerOrderId: q.q }, { providerPaymentId: q.q }, { id: q.q }, { booking: { code: q.q.toUpperCase() } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.payment.findMany({ where, include: { user: { select: { id: true, name: true } }, refunds: true, booking: { select: { id: true, code: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.payment.count({ where }),
  ]);
  res.json({ payments: items, meta: pageMeta(total, q.page, q.limit) });
});
adminRouter.post("/payments/:id/refund", adminOnly, validate({ body: z.object({ amount: z.coerce.number().int().min(1), reason: z.string().min(3).max(500) }) }), async (req, res) => {
  const r = await refundPayment({ paymentId: req.params.id, amount: req.body.amount, reason: req.body.reason, actorId: req.user!.id, key: `refund:admin:${req.params.id}:${Date.now()}` });
  await audit({ actorId: req.user!.id, action: "payment.refund", entityType: "Payment", entityId: req.params.id, after: req.body });
  res.json({ refund: r });
});

// ------------------------------------------------------------------ payouts
adminRouter.get("/payouts", validate({ query: pageQ }), async (req, res) => {
  const q = req.query as unknown as PageQ;
  const where: P.PayoutWhereInput = q.status ? { status: q.status as never } : {};
  const [items, total, totals] = await Promise.all([
    prisma.payout.findMany({ where, include: { owner: { select: { id: true, name: true, kycStatus: true } }, booking: { select: { id: true, code: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.payout.count({ where }),
    prisma.payout.groupBy({ by: ["status"], _sum: { amount: true }, _count: true }),
  ]);
  res.json({ payouts: items, totals, meta: pageMeta(total, q.page, q.limit) });
});
adminRouter.post("/payouts/:id/:action", adminOnly, async (req, res) => {
  const p = await prisma.payout.findUnique({ where: { id: req.params.id } });
  if (!p) throw notFound("Payout");
  const map: Record<string, P.PayoutUpdateInput> = {
    hold: { status: "ON_HOLD", note: "Held by admin" },
    release: { status: "SCHEDULED", scheduledFor: new Date() },
    retry: { status: "SCHEDULED", scheduledFor: new Date(), attempts: 0 },
    cancel: { status: "CANCELLED" },
  };
  const data = map[req.params.action];
  if (!data) throw badRequest("Unknown action");
  const u = await prisma.payout.update({ where: { id: p.id }, data });
  await audit({ actorId: req.user!.id, action: `payout.${req.params.action}`, entityType: "Payout", entityId: p.id, before: { status: p.status }, after: data });
  res.json({ payout: u });
});
adminRouter.post("/payouts-run", adminOnly, async (_req, res) => {
  res.json(await processDuePayouts());
});

// ---------------------------------------------------------- reconciliation
adminRouter.get("/reconciliation", adminOnly, validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }), async (req, res) => {
  const q = req.query as { from?: Date; to?: Date };
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * DAY);
  res.json(await reconciliationReport(from, to));
});
adminRouter.post("/reconciliation/run", adminOnly, async (_req, res) => {
  res.json(await reconcilePayments());
});
adminRouter.get("/webhooks", adminOnly, validate({ query: pageQ }), async (req, res) => {
  const q = req.query as unknown as PageQ;
  const where = q.status ? { status: q.status as never } : {};
  const [items, total] = await Promise.all([
    prisma.webhookEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit, select: { id: true, provider: true, eventId: true, type: true, status: true, attempts: true, error: true, createdAt: true, processedAt: true } }),
    prisma.webhookEvent.count({ where }),
  ]);
  res.json({ webhooks: items, meta: pageMeta(total, q.page, q.limit) });
});
adminRouter.post("/webhooks/:id/retry", adminOnly, async (req, res) => {
  await processWebhook(req.params.id);
  res.json({ webhook: await prisma.webhookEvent.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, error: true } }) });
});

// ------------------------------------------------------ reports and flags
adminRouter.get("/reports", validate({ query: pageQ }), async (req, res) => {
  const q = req.query as unknown as PageQ;
  const where = { status: (q.status ?? "OPEN") as never };
  const [items, total] = await Promise.all([
    prisma.report.findMany({ where, include: { reporter: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.report.count({ where }),
  ]);
  res.json({ reports: items, meta: pageMeta(total, q.page, q.limit) });
});
adminRouter.post("/reports/:id", validate({ body: z.object({ status: z.enum(["ACTIONED", "DISMISSED"]) }) }), async (req, res) => {
  const r = await prisma.report.update({ where: { id: req.params.id }, data: { status: req.body.status, handledById: req.user!.id, handledAt: new Date() } });
  await audit({ actorId: req.user!.id, action: `report.${req.body.status.toLowerCase()}`, entityType: "Report", entityId: r.id });
  res.json({ report: r });
});
adminRouter.get("/flags", validate({ query: pageQ }), async (req, res) => {
  const q = req.query as unknown as PageQ;
  const where = { status: (q.status ?? "OPEN") as never };
  const [items, total] = await Promise.all([
    prisma.flag.findMany({ where, include: { user: { select: { id: true, name: true, status: true } }, listing: { select: { id: true, title: true } } }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.flag.count({ where }),
  ]);
  res.json({ flags: items, meta: pageMeta(total, q.page, q.limit) });
});
adminRouter.post("/flags/:id", validate({ body: z.object({ status: z.enum(["ACTIONED", "DISMISSED"]) }) }), async (req, res) => {
  const f = await prisma.flag.update({ where: { id: req.params.id }, data: { status: req.body.status } });
  await audit({ actorId: req.user!.id, action: `flag.${req.body.status.toLowerCase()}`, entityType: "Flag", entityId: f.id });
  res.json({ flag: f });
});
adminRouter.post("/reviews/:id/visibility", validate({ body: z.object({ hidden: z.boolean() }) }), async (req, res) => {
  const r = await prisma.review.update({ where: { id: req.params.id }, data: { isHidden: req.body.hidden } });
  await audit({ actorId: req.user!.id, action: req.body.hidden ? "review.hide" : "review.unhide", entityType: "Review", entityId: r.id });
  res.json({ review: r });
});

// ----------------------------------------------------------------- settings
adminRouter.get("/settings", async (_req, res) => {
  res.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
});
const settingsSchemas: Record<string, z.ZodTypeAny> = {
  fees: z.object({
    ownerCommissionRate: z.number().min(0).max(0.5),
    proOwnerCommissionRate: z.number().min(0).max(0.5),
    renterServiceFeeRate: z.number().min(0).max(0.3),
    gstRate: z.number().min(0).max(0.3),
    protectionPlan: z.object({ enabled: z.boolean(), type: z.enum(["PERCENT", "FLAT"]), value: z.number().min(0), minFee: z.number().int().min(0), coverageCap: z.number().int().min(0) }),
    deliveryMarginRate: z.number().min(0).max(1),
    platformDeliveryBaseFee: z.number().int().min(0),
    platformDeliveryPerKm: z.number().int().min(0),
    lateFee: z.object({ multiplier: z.number().min(0).max(10), platformShare: z.number().min(0).max(1), graceHours: z.number().min(0).max(48) }),
    ownerCancellationPenaltyRate: z.number().min(0).max(1),
    ownerCancellationPenaltyMin: z.number().int().min(0),
  }),
  cancellationPolicies: z.record(z.enum(["FLEXIBLE", "MODERATE", "STRICT"]), z.array(z.object({ hoursBefore: z.number().min(0), refundPercent: z.number().min(0).max(100) })).min(1)),
  booking: z.object({
    requestExpiryHours: z.number().min(1).max(168),
    paymentWindowHours: z.number().min(1).max(72),
    instantPaymentWindowMinutes: z.number().min(5).max(240),
    inspectionWindowHours: z.number().min(1).max(168),
    payoutDelayHours: z.number().min(0).max(720),
    overdueAutoDisputeDays: z.number().min(1).max(30),
    maxAdvanceDays: z.number().min(1).max(730),
    minLeadTimeHours: z.number().min(0).max(72),
  }),
  trust: z.object({
    kycRequiredAboveAmount: z.number().int().min(0),
    listingModeration: z.boolean(),
    cancellationFlagThreshold: z.number().int().min(1),
    offPlatformFlagThreshold: z.number().int().min(1),
    instantBookingRequiresKyc: z.boolean(),
    prohibitedKeywords: z.array(z.string().min(2).max(60)).max(1000),
  }),
  featuredPlans: z.array(z.object({ code: z.string().regex(/^[A-Z0-9_]+$/), name: z.string().min(2), days: z.number().int().min(1).max(365), price: z.number().int().min(0) })).max(10),
  pro: z.object({ price: z.number().int().min(0), periodDays: z.number().int().min(1), maxListingsFree: z.number().int().min(1), maxListingsPro: z.number().int().min(1) }),
  legal: z.object({ rentalAgreementVersion: z.string(), termsVersion: z.string(), privacyVersion: z.string() }),
};
adminRouter.put("/settings/:key", adminOnly, async (req, res) => {
  const key = req.params.key as (typeof SETTINGS_KEYS)[number];
  if (!SETTINGS_KEYS.includes(key)) throw notFound("Setting");
  const value = settingsSchemas[key].parse(req.body);
  res.json({ settings: await updateSetting(key, value, req.user!.id) });
});

// --------------------------------------------------------------- categories
const categoryBody = z.object({ name: z.string().min(2).max(60), slug: z.string().max(60).optional(), parentId: z.string().nullable().optional(), icon: z.string().max(40).optional(), description: z.string().max(300).optional(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional() });
adminRouter.get("/categories", async (_req, res) => {
  res.json({ categories: await prisma.category.findMany({ orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }], include: { _count: { select: { listings: true } } } }) });
});
adminRouter.post("/categories", adminOnly, validate({ body: categoryBody }), async (req, res) => {
  const c = await prisma.category.create({ data: { ...req.body, slug: slugify(req.body.slug ?? req.body.name) } });
  await invalidate("categories");
  await audit({ actorId: req.user!.id, action: "category.create", entityType: "Category", entityId: c.id, after: c });
  res.status(201).json({ category: c });
});
adminRouter.patch("/categories/:id", adminOnly, validate({ body: categoryBody.partial() }), async (req, res) => {
  const data = { ...req.body, ...(req.body.slug ? { slug: slugify(req.body.slug) } : {}) };
  const c = await prisma.category.update({ where: { id: req.params.id }, data });
  await invalidate("categories");
  await audit({ actorId: req.user!.id, action: "category.update", entityType: "Category", entityId: c.id, after: data });
  res.json({ category: c });
});
adminRouter.delete("/categories/:id", adminOnly, async (req, res) => {
  const inUse = await prisma.listing.count({ where: { OR: [{ categoryId: req.params.id }, { subcategoryId: req.params.id }] } });
  if (inUse) {
    await prisma.category.update({ where: { id: req.params.id }, data: { isActive: false } });
  } else {
    await prisma.category.delete({ where: { id: req.params.id } });
  }
  await invalidate("categories");
  res.json({ ok: true, deactivated: inUse > 0 });
});

// ------------------------------------------------------------------- cities
adminRouter.get("/cities", async (_req, res) => {
  res.json({ cities: await prisma.city.findMany({ orderBy: { listingCount: "desc" }, include: { _count: { select: { localities: true } } } }) });
});
adminRouter.patch("/cities/:id", adminOnly, validate({ body: z.object({ isActive: z.boolean().optional(), name: z.string().min(2).optional() }) }), async (req, res) => {
  const c = await prisma.city.update({ where: { id: req.params.id }, data: req.body });
  await invalidate("cities");
  res.json({ city: c });
});

// --------------------------------------------------------------- audit logs
adminRouter.get("/audit-logs", validate({ query: pageQ.extend({ entityType: z.string().optional(), entityId: z.string().optional() }) }), async (req, res) => {
  const q = req.query as unknown as PageQ & { entityType?: string; entityId?: string };
  const where: P.AuditLogWhereInput = { ...(q.entityType ? { entityType: q.entityType } : {}), ...(q.entityId ? { entityId: q.entityId } : {}), ...(q.q ? { action: { contains: q.q } } : {}) };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ logs: items, meta: pageMeta(total, q.page, q.limit) });
});

// ------------------------------------------------------------------ exports
adminRouter.get("/export/:entity", adminOnly, validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }), async (req, res) => {
  const q = req.query as { from?: Date; to?: Date };
  const createdAt = { gte: q.from ?? new Date(Date.now() - 90 * DAY), lt: q.to ?? new Date() };
  let rows: Record<string, unknown>[] = [];
  switch (req.params.entity) {
    case "bookings":
      rows = (await prisma.booking.findMany({ where: { createdAt }, include: { listing: { select: { title: true, city: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } })).map((b) => ({
        code: b.code, status: b.status, city: b.listing.city.name, listing: b.listing.title, startAt: b.startAt, endAt: b.endAt,
        rent: b.rentAmount / 100, serviceFee: b.serviceFee / 100, protectionFee: b.protectionFee / 100, deliveryFee: b.deliveryFee / 100, tax: b.taxAmount / 100,
        deposit: b.depositAmount / 100, total: b.totalAmount / 100, commission: b.ownerCommission / 100, ownerPayout: b.ownerPayoutAmount / 100,
        platformRevenue: b.platformRevenue / 100, lateFee: b.lateFeeAmount / 100, refund: b.refundAmount / 100, createdAt: b.createdAt,
      }));
      break;
    case "payments":
      rows = (await prisma.payment.findMany({ where: { createdAt }, orderBy: { createdAt: "asc" } })).map((p) => ({
        id: p.id, purpose: p.purpose, provider: p.provider, orderId: p.providerOrderId, paymentId: p.providerPaymentId, status: p.status,
        amount: p.amount / 100, refunded: p.refundedAmount / 100, method: p.method, createdAt: p.createdAt, capturedAt: p.capturedAt,
      }));
      break;
    case "payouts":
      rows = (await prisma.payout.findMany({ where: { createdAt }, include: { owner: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } })).map((p) => ({
        id: p.id, owner: p.owner.name, email: p.owner.email, amount: p.amount / 100, status: p.status, scheduledFor: p.scheduledFor, paidAt: p.paidAt, transferId: p.providerTransferId, note: p.note,
      }));
      break;
    case "users":
      rows = (await prisma.user.findMany({ where: { createdAt }, orderBy: { createdAt: "asc" } })).map((u) => ({
        id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, kyc: u.kycStatus, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
      }));
      break;
    case "listings":
      rows = (await prisma.listing.findMany({ where: { createdAt }, include: { city: true, category: true }, orderBy: { createdAt: "asc" } })).map((l) => ({
        id: l.id, title: l.title, status: l.status, category: l.category.name, city: l.city.name, priceDaily: (l.priceDaily ?? 0) / 100, deposit: l.securityDeposit / 100, views: l.viewCount, bookings: l.bookingCount, rating: l.ratingAvg, createdAt: l.createdAt,
      }));
      break;
    case "ledger":
      rows = (await prisma.ledgerEntry.findMany({ where: { createdAt }, orderBy: { createdAt: "asc" } })).map((e) => ({ id: e.id, account: e.account, amount: e.amount / 100, description: e.description, bookingId: e.bookingId, paymentId: e.paymentId, createdAt: e.createdAt }));
      break;
    default:
      throw notFound("Export");
  }
  await audit({ actorId: req.user!.id, action: "export", entityType: "Export", entityId: req.params.entity, ip: clientIp(req) });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.entity}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(rows));
});
