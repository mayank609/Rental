/**
 * /api/v1/listings — discovery, detail, owner CRUD, calendar & quotes.
 */
import { Router } from "express";
import { z } from "zod";
import { optionalAuth, requireAuth, requirePhoneVerified } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeLimiter } from "../../middleware/rateLimit";
import { clientIp } from "../../middleware/security";
import { prisma } from "../../lib/prisma";
import { kv } from "../../lib/redis";
import { notFound, badRequest } from "../../lib/errors";
import { paginate, pageMeta } from "../../lib/util";
import { blockSchema, createListingSchema, quoteSchema, searchSchema, updateListingSchema, SearchInput } from "./listings.schemas";
import * as svc from "./listings.service";
import { searchListings, hydrate } from "./search.service";
import { ownerListing, publicListing } from "./listings.serializers";
import { getUnavailableRanges, findConflicts } from "../bookings/availability";
import { quoteListing, renterBreakdown, ownerBreakdown } from "../bookings/booking.quote";
import { invalidate } from "../../lib/cache";

export const listingsRouter = Router();

listingsRouter.get("/search", optionalAuth, validate({ query: searchSchema }), async (req, res) => {
  res.json(await searchListings(req.query as unknown as SearchInput, req.user?.id));
});

/** Boosted listings for a city (home page carousel). */
listingsRouter.get("/featured", validate({ query: z.object({ city: z.string().optional(), limit: z.coerce.number().int().min(1).max(20).default(10) }) }), async (req, res) => {
  const { city, limit } = req.query as unknown as { city?: string; limit: number };
  const cityRow = city ? await prisma.city.findUnique({ where: { slug: city } }) : null;
  const rows = await prisma.listing.findMany({
    where: { status: "ACTIVE", deletedAt: null, featuredUntil: { gt: new Date() }, ...(cityRow ? { cityId: cityRow.id } : {}) },
    orderBy: { featuredUntil: "desc" },
    take: limit,
    select: { id: true },
  });
  res.json({ listings: await hydrate(rows.map((r) => ({ id: r.id, distance_km: null, rank: null }))) });
});

/** The signed-in owner's listings. */
listingsRouter.get("/mine", requireAuth, validate({ query: z.object({ status: z.string().optional(), page: z.coerce.number().optional(), limit: z.coerce.number().optional() }) }), async (req, res) => {
  const q = req.query as { status?: string; page?: number; limit?: number };
  const { skip, take, page, limit } = paginate(q.page, q.limit);
  const where = { ownerId: req.user!.id, deletedAt: null, ...(q.status ? { status: q.status as never } : {}) };
  const [items, total] = await Promise.all([
    prisma.listing.findMany({ where, include: { ...svc.listingInclude, address: true }, orderBy: { updatedAt: "desc" }, skip, take }),
    prisma.listing.count({ where }),
  ]);
  res.json({ listings: items.map(ownerListing), meta: pageMeta(total, page, limit) });
});

listingsRouter.post("/", requireAuth, requirePhoneVerified, writeLimiter, validate({ body: createListingSchema }), async (req, res) => {
  const listing = await svc.createListing(req.user!.id, req.body);
  res.status(201).json({ listing: ownerListing(listing) });
});

async function findListing(idOrSlug: string) {
  return prisma.listing.findFirst({
    where: { id: idOrSlug, deletedAt: null },
    include: { ...svc.listingInclude, address: true },
  });
}

listingsRouter.get("/:id", optionalAuth, async (req, res) => {
  const l = await findListing(req.params.id);
  const isOwner = l && req.user?.id === l.ownerId;
  const isStaff = req.user && (req.user.role === "ADMIN" || req.user.role === "SUPPORT");
  if (!l || (l.status !== "ACTIVE" && !isOwner && !isStaff)) throw notFound("Listing");

  // Count unique views per viewer per hour; remember recently viewed.
  if (!isOwner) {
    const viewer = req.user?.id ?? clientIp(req);
    const first = (await kv.incr(`view:${l.id}:${viewer}`, 3600)) === 1;
    if (first) await prisma.listing.update({ where: { id: l.id }, data: { viewCount: { increment: 1 } } });
    if (req.user) {
      await prisma.recentlyViewed.upsert({
        where: { userId_listingId: { userId: req.user.id, listingId: l.id } },
        create: { userId: req.user.id, listingId: l.id },
        update: { viewedAt: new Date() },
      });
    }
  }
  const wishlisted = req.user
    ? Boolean(await prisma.wishlistItem.findUnique({ where: { userId_listingId: { userId: req.user.id, listingId: l.id } } }))
    : false;
  res.json({ listing: isOwner || isStaff ? ownerListing(l) : publicListing(l), isOwner: Boolean(isOwner), wishlisted });
});

listingsRouter.patch("/:id", requireAuth, writeLimiter, validate({ body: updateListingSchema }), async (req, res) => {
  const l = await svc.getOwnedListing(req.params.id, req.user!.id, true, req.user!.role);
  const updated = await svc.updateListing(l, req.user!.id, req.body);
  res.json({ listing: ownerListing(updated) });
});

listingsRouter.post("/:id/status", requireAuth, validate({ body: z.object({ status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]) }) }), async (req, res) => {
  const l = await svc.getOwnedListing(req.params.id, req.user!.id);
  const status = await svc.setListingStatus(l, req.body.status);
  res.json({ status });
});

listingsRouter.delete("/:id", requireAuth, async (req, res) => {
  const l = await svc.getOwnedListing(req.params.id, req.user!.id, true, req.user!.role);
  await svc.softDeleteListing(l, req.user!.id);
  res.json({ ok: true });
});

listingsRouter.get(
  "/:id/availability",
  validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }),
  async (req, res) => {
    const q = req.query as { from?: Date; to?: Date };
    const from = q.from ?? new Date();
    const to = q.to ?? new Date(from.getTime() + 180 * 24 * 3600_000);
    if (to.getTime() - from.getTime() > 400 * 24 * 3600_000) throw badRequest("Range too large");
    res.json({ unavailable: await getUnavailableRanges(req.params.id, from, to) });
  },
);

listingsRouter.post("/:id/blocks", requireAuth, validate({ body: blockSchema }), async (req, res) => {
  const l = await svc.getOwnedListing(req.params.id, req.user!.id);
  const block = await svc.addBlock(l.id, req.body.startAt, req.body.endAt, req.body.reason);
  await invalidate("listings");
  res.status(201).json({ block });
});

listingsRouter.delete("/:id/blocks/:blockId", requireAuth, async (req, res) => {
  const l = await svc.getOwnedListing(req.params.id, req.user!.id);
  await prisma.availabilityBlock.deleteMany({ where: { id: req.params.blockId, listingId: l.id } });
  await invalidate("listings");
  res.json({ ok: true });
});

/** Live price breakdown + availability for a period. */
listingsRouter.get("/:id/quote", optionalAuth, validate({ query: quoteSchema }), async (req, res) => {
  const q = req.query as unknown as z.infer<typeof quoteSchema>;
  const l = await prisma.listing.findFirst({
    where: { id: req.params.id, status: "ACTIVE", deletedAt: null },
    include: { owner: { include: { subscription: true } } },
  });
  if (!l) throw notFound("Listing");
  const quote = await quoteListing(l, q.startAt, q.endAt, { protectionPlan: q.protectionPlan, fulfillment: q.fulfillment });
  const { available } = await findConflicts(prisma, l.id, q.startAt, q.endAt);
  res.json({
    available,
    hours: quote.hours,
    breakdown: renterBreakdown(quote.breakdown),
    ...(req.user?.id === l.ownerId ? { ownerBreakdown: ownerBreakdown(quote.breakdown) } : {}),
    protectionAvailable: quote.protectionAvailable,
    protectionCoverageCap: quote.protectionCoverageCap,
    instantBooking: l.instantBooking,
  });
});

listingsRouter.get("/:id/similar", async (req, res) => {
  const l = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!l) throw notFound("Listing");
  const rows = await prisma.$queryRaw<{ id: string; distance_km: number }[]>`
    SELECT l.id, ST_Distance(l."location", (SELECT "location" FROM "Listing" WHERE id = ${l.id})) / 1000.0 AS distance_km
    FROM "Listing" l
    WHERE l."status" = 'ACTIVE' AND l."deletedAt" IS NULL AND l.id <> ${l.id} AND l."categoryId" = ${l.categoryId}
    ORDER BY distance_km ASC LIMIT 8`;
  res.json({ listings: await hydrate(rows.map((r) => ({ ...r, rank: null }))) });
});

listingsRouter.get("/:id/reviews", validate({ query: z.object({ page: z.coerce.number().optional() }) }), async (req, res) => {
  const { skip, take, page, limit } = paginate((req.query as { page?: number }).page, 10);
  const where = { listingId: req.params.id, role: "RENTER_TO_OWNER" as const, isHidden: false };
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({ where, include: { author: true }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.review.count({ where }),
  ]);
  res.json({
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, author: { id: r.author.id, name: r.author.name, avatarUrl: r.author.avatarUrl } })),
    meta: pageMeta(total, page, limit),
  });
});
