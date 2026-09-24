/**
 * /api/v1/users — profiles, preferences, wishlist, recently viewed,
 * addresses, notifications, push, KYC, dashboard & analytics, privacy.
 */
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { optionalAuth, requireAuth } from "../../middleware/auth";
import { validate, queryBool } from "../../middleware/validate";
import { clientIp } from "../../middleware/security";
import { uploadLimiter } from "../../middleware/rateLimit";
import { prisma } from "../../lib/prisma";
import { badRequest, forbidden, notFound, conflict } from "../../lib/errors";
import { storage } from "../../lib/storage";
import { env } from "../../config/env";
import { pageMeta, paginate, slugify } from "../../lib/util";
import { publicUser, selfUser, isProActive } from "./users.serializers";
import { deleteAccount, deletionBlockers, exportUserData } from "./users.service";
import { hydrate } from "../listings/search.service";
import { ownerEarningsSummary } from "../payouts/payouts.service";
import { emailSchema } from "../auth/auth.schemas";
import { nanoid } from "nanoid";

export const usersRouter = Router();

// ------------------------------------------------------------------- me --
usersRouter.patch(
  "/me",
  requireAuth,
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(80).optional(),
      bio: z.string().trim().max(500).nullable().optional(),
      email: emailSchema.optional(),
      notificationPrefs: z.object({ email: z.boolean(), sms: z.boolean(), whatsapp: z.boolean(), push: z.boolean() }).partial().optional(),
      marketingOptIn: z.boolean().optional(),
    }),
  }),
  async (req, res) => {
    const current = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const data: Record<string, unknown> = { ...req.body };
    if (req.body.email && req.body.email !== current.email) {
      const taken = await prisma.user.findUnique({ where: { email: req.body.email } });
      if (taken) throw conflict("This email is already in use", "EMAIL_TAKEN");
      data.emailVerifiedAt = null;
    }
    if (req.body.notificationPrefs) data.notificationPrefs = { ...(current.notificationPrefs as object), ...req.body.notificationPrefs };
    const user = await prisma.user.update({ where: { id: current.id }, data, include: { subscription: true } });
    res.json({ user: selfUser(user) });
  },
);

/** Remember the user's chosen city/locality. */
usersRouter.put(
  "/me/location",
  requireAuth,
  validate({ body: z.object({ city: z.string().min(2).max(120), locality: z.string().max(120).nullable().optional(), lat: z.number().optional(), lng: z.number().optional() }) }),
  async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { preferredCitySlug: slugify(req.body.city), preferredLocality: req.body.locality ?? null, preferredLat: req.body.lat ?? null, preferredLng: req.body.lng ?? null },
      include: { subscription: true },
    });
    res.json({ user: selfUser(user) });
  },
);

usersRouter.get("/me/dashboard", requireAuth, async (req, res) => {
  const uid = req.user!.id;
  const [listings, activeListings, asRenter, asOwner, pendingRequests, earnings, unreadNotifications, recentBookings] = await Promise.all([
    prisma.listing.count({ where: { ownerId: uid, deletedAt: null } }),
    prisma.listing.count({ where: { ownerId: uid, deletedAt: null, status: "ACTIVE" } }),
    prisma.booking.groupBy({ by: ["status"], where: { renterId: uid }, _count: true }),
    prisma.booking.groupBy({ by: ["status"], where: { ownerId: uid }, _count: true }),
    prisma.booking.count({ where: { ownerId: uid, status: "REQUESTED" } }),
    ownerEarningsSummary(uid),
    prisma.notification.count({ where: { userId: uid, readAt: null } }),
    prisma.booking.findMany({
      where: { OR: [{ renterId: uid }, { ownerId: uid }], status: { in: ["REQUESTED", "ACCEPTED", "CONFIRMED", "ACTIVE", "OVERDUE", "RETURNED"] } },
      include: { listing: { select: { id: true, title: true, images: { select: { thumbUrl: true }, take: 1 } } } },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
  ]);
  const count = (g: { status: string; _count: number }[], ...s: string[]) => g.filter((x) => s.includes(x.status)).reduce((a, x) => a + x._count, 0);
  res.json({
    listings: { total: listings, active: activeListings },
    rentals: { active: count(asRenter, "ACTIVE", "OVERDUE"), upcoming: count(asRenter, "REQUESTED", "ACCEPTED", "CONFIRMED"), completed: count(asRenter, "COMPLETED") },
    ownerBookings: { active: count(asOwner, "ACTIVE", "OVERDUE", "RETURNED"), upcoming: count(asOwner, "ACCEPTED", "CONFIRMED"), completed: count(asOwner, "COMPLETED"), pendingRequests },
    earnings,
    unreadNotifications,
    upcoming: recentBookings.map((b) => ({ id: b.id, code: b.code, status: b.status, startAt: b.startAt, endAt: b.endAt, role: b.ownerId === uid ? "OWNER" : "RENTER", listing: { id: b.listing.id, title: b.listing.title, image: b.listing.images[0]?.thumbUrl ?? null } })),
  });
});

/** Owner analytics (Owner Pro feature). */
usersRouter.get("/me/analytics", requireAuth, validate({ query: z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }) }), async (req, res) => {
  const uid = req.user!.id;
  const sub = await prisma.subscription.findUnique({ where: { userId: uid } });
  if (!isProActive(sub)) throw forbidden("Analytics is an Owner Pro feature", "PRO_REQUIRED");
  const days = (req.query as unknown as { days: number }).days;
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const listings = await prisma.listing.findMany({
    where: { ownerId: uid, deletedAt: null },
    select: { id: true, title: true, viewCount: true, bookingCount: true, ratingAvg: true, status: true, _count: { select: { wishlistedBy: true } } },
  });
  const bookings = await prisma.booking.findMany({
    where: { ownerId: uid, createdAt: { gte: since } },
    select: { listingId: true, status: true, ownerPayoutAmount: true, createdAt: true, rentAmount: true },
  });
  const perListing = listings.map((l) => {
    const bs = bookings.filter((b) => b.listingId === l.id);
    const paid = bs.filter((b) => ["CONFIRMED", "ACTIVE", "OVERDUE", "RETURNED", "COMPLETED", "DISPUTED"].includes(b.status));
    return {
      ...l,
      wishlists: l._count.wishlistedBy,
      requests: bs.length,
      paidBookings: paid.length,
      earnings: paid.reduce((s, b) => s + b.ownerPayoutAmount, 0),
      conversionRate: l.viewCount ? Math.round((paid.length / l.viewCount) * 1000) / 10 : 0,
    };
  });
  const daily: Record<string, { date: string; bookings: number; earnings: number }> = {};
  for (const b of bookings) {
    const d = b.createdAt.toISOString().slice(0, 10);
    daily[d] ??= { date: d, bookings: 0, earnings: 0 };
    daily[d].bookings++;
    if (b.status !== "CANCELLED" && b.status !== "DECLINED" && b.status !== "EXPIRED" && b.status !== "REQUESTED") daily[d].earnings += b.ownerPayoutAmount;
  }
  res.json({ perListing, daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)), days });
});

// ------------------------------------------------------------- wishlist --
usersRouter.get("/me/wishlist", requireAuth, async (req, res) => {
  const items = await prisma.wishlistItem.findMany({ where: { userId: req.user!.id, listing: { deletedAt: null } }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ listings: await hydrate(items.map((i) => ({ id: i.listingId, distance_km: null, rank: null }))) });
});
usersRouter.post("/me/wishlist/:listingId", requireAuth, async (req, res) => {
  const l = await prisma.listing.findFirst({ where: { id: req.params.listingId, deletedAt: null } });
  if (!l) throw notFound("Listing");
  await prisma.wishlistItem.upsert({ where: { userId_listingId: { userId: req.user!.id, listingId: l.id } }, create: { userId: req.user!.id, listingId: l.id }, update: {} });
  res.status(201).json({ wishlisted: true });
});
usersRouter.delete("/me/wishlist/:listingId", requireAuth, async (req, res) => {
  await prisma.wishlistItem.deleteMany({ where: { userId: req.user!.id, listingId: req.params.listingId } });
  res.json({ wishlisted: false });
});

usersRouter.get("/me/recently-viewed", requireAuth, async (req, res) => {
  const items = await prisma.recentlyViewed.findMany({ where: { userId: req.user!.id, listing: { deletedAt: null, status: "ACTIVE" } }, orderBy: { viewedAt: "desc" }, take: 20 });
  res.json({ listings: await hydrate(items.map((i) => ({ id: i.listingId, distance_km: null, rank: null }))) });
});

// ------------------------------------------------------------ addresses --
const addressBody = z.object({
  label: z.string().max(40).optional(),
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  locality: z.string().min(2).max(120),
  city: z.string().min(2).max(120),
  state: z.string().max(120).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  lat: z.number(),
  lng: z.number(),
  isDefault: z.boolean().optional(),
});
usersRouter.get("/me/addresses", requireAuth, async (req, res) => {
  res.json({ addresses: await prisma.address.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } }) });
});
usersRouter.post("/me/addresses", requireAuth, validate({ body: addressBody }), async (req, res) => {
  if (req.body.isDefault) await prisma.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
  res.status(201).json({ address: await prisma.address.create({ data: { ...req.body, userId: req.user!.id } }) });
});
usersRouter.delete("/me/addresses/:id", requireAuth, async (req, res) => {
  const inUse = await prisma.listing.count({ where: { addressId: req.params.id, deletedAt: null } });
  if (inUse) throw conflict("This address is used by a listing");
  await prisma.address.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  res.json({ ok: true });
});

// -------------------------------------------------------- notifications --
usersRouter.get("/me/notifications", requireAuth, validate({ query: z.object({ page: z.coerce.number().optional(), unread: queryBool.optional() }) }), async (req, res) => {
  const q = req.query as { page?: number; unread?: boolean };
  const { skip, take, page, limit } = paginate(q.page, 30);
  const where = { userId: req.user!.id, ...(q.unread ? { readAt: null } : {}) };
  const [notifications, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ]);
  res.json({ notifications, unread, meta: pageMeta(total, page, limit) });
});
usersRouter.post("/me/notifications/read", requireAuth, validate({ body: z.object({ ids: z.array(z.string()).optional() }) }), async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null, ...(req.body.ids ? { id: { in: req.body.ids } } : {}) }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

usersRouter.get("/push/vapid-key", (_req, res) => res.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null }));
usersRouter.post(
  "/me/push-subscriptions",
  requireAuth,
  validate({ body: z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }) }),
  async (req, res) => {
    await prisma.pushSubscription.upsert({
      where: { endpoint: req.body.endpoint },
      create: { userId: req.user!.id, endpoint: req.body.endpoint, p256dh: req.body.keys.p256dh, auth: req.body.keys.auth },
      update: { userId: req.user!.id, p256dh: req.body.keys.p256dh, auth: req.body.keys.auth },
    });
    res.status(201).json({ ok: true });
  },
);
usersRouter.delete("/me/push-subscriptions", requireAuth, validate({ body: z.object({ endpoint: z.string() }) }), async (req, res) => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: req.body.endpoint, userId: req.user!.id } });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ KYC --
const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, f, cb) => (["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(f.mimetype) ? cb(null, true) : cb(badRequest("Upload a JPG, PNG, WEBP or PDF"))),
});
usersRouter.get("/me/kyc", requireAuth, async (req, res) => {
  const docs = await prisma.kycDocument.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, select: { id: true, docType: true, docNumberMasked: true, status: true, rejectionReason: true, createdAt: true } });
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { kycStatus: true } });
  res.json({ status: u.kycStatus, documents: docs });
});
usersRouter.post("/me/kyc", requireAuth, uploadLimiter, kycUpload.single("file"), async (req, res) => {
  const body = z
    .object({ docType: z.enum(["AADHAAR", "PAN", "DRIVING_LICENSE", "PASSPORT", "VOTER_ID"]), docNumber: z.string().trim().min(6).max(20) })
    .parse(req.body);
  if (!req.file) throw badRequest("Upload a photo or scan of the document");
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (u.kycStatus === "VERIFIED") throw conflict("Your ID is already verified");
  const ext = req.file.mimetype === "application/pdf" ? "pdf" : req.file.mimetype.split("/")[1];
  const key = `kyc/${u.id}/${nanoid(16)}.${ext}`;
  await storage.put(key, req.file.buffer, req.file.mimetype, true);
  // Only the last 4 characters of the ID number are kept (Aadhaar masking rules)
  const masked = `${"X".repeat(Math.max(0, body.docNumber.length - 4))}${body.docNumber.slice(-4)}`;
  const doc = await prisma.kycDocument.create({ data: { userId: u.id, docType: body.docType, docNumberMasked: masked, fileKey: key } });
  await prisma.user.update({ where: { id: u.id }, data: { kycStatus: "PENDING" } });
  res.status(201).json({ document: { id: doc.id, docType: doc.docType, docNumberMasked: doc.docNumberMasked, status: doc.status } });
});

// -------------------------------------------------------------- privacy --
usersRouter.get("/me/export", requireAuth, async (req, res) => {
  const data = await exportUserData(req.user!.id);
  res.setHeader("Content-Disposition", `attachment; filename="rentnest-data-${req.user!.id}.json"`);
  res.json(data);
});
usersRouter.get("/me/deletion-check", requireAuth, async (req, res) => {
  const blockers = await deletionBlockers(req.user!.id);
  res.json({ canDelete: blockers.length === 0, blockers });
});
usersRouter.delete("/me", requireAuth, validate({ body: z.object({ confirm: z.literal("DELETE") }) }), async (req, res) => {
  await deleteAccount(req.user!.id, clientIp(req));
  res.clearCookie("rn_rt", { path: "/api/v1/auth" });
  res.json({ ok: true });
});

// -------------------------------------------------------------- blocking --
usersRouter.post("/:id/block", requireAuth, async (req, res) => {
  if (req.params.id === req.user!.id) throw badRequest("You can't block yourself");
  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId: req.params.id } },
    create: { blockerId: req.user!.id, blockedId: req.params.id },
    update: {},
  });
  res.status(201).json({ blocked: true });
});
usersRouter.delete("/:id/block", requireAuth, async (req, res) => {
  await prisma.userBlock.deleteMany({ where: { blockerId: req.user!.id, blockedId: req.params.id } });
  res.json({ blocked: false });
});

// ------------------------------------------------------- public profile --
usersRouter.get("/:id", optionalAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id }, include: { subscription: true } });
  if (!u || u.status === "DELETED" || u.status === "BANNED") throw notFound("User");
  const listings = await prisma.listing.findMany({ where: { ownerId: u.id, status: "ACTIVE", deletedAt: null }, select: { id: true }, take: 24, orderBy: { publishedAt: "desc" } });
  const blocked = req.user ? Boolean(await prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: req.user.id, blockedId: u.id } } })) : false;
  res.json({ user: publicUser(u), listings: await hydrate(listings.map((l) => ({ id: l.id, distance_km: null, rank: null }))), blocked });
});
