/**
 * /api/v1/reviews — two-way reviews, only after a completed rental,
 * once per party, within 14 days. Updates cached rating aggregates.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { prisma } from "../../lib/prisma";
import { conflict, notFound } from "../../lib/errors";
import { pageMeta, paginate } from "../../lib/util";
import { notify } from "../notifications/notifications.service";
import { checkReviewAbuse } from "../trust/trust.service";
import { invalidate } from "../../lib/cache";

export const reviewsRouter = Router();

reviewsRouter.post(
  "/",
  requireAuth,
  validate({ body: z.object({ bookingId: z.string(), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional() }) }),
  async (req, res) => {
    const uid = req.user!.id;
    const b = await prisma.booking.findUnique({ where: { id: req.body.bookingId } });
    if (!b || (b.renterId !== uid && b.ownerId !== uid)) throw notFound("Booking");
    if (b.status !== "COMPLETED") throw conflict("You can review only after the rental is completed", "NOT_COMPLETED");
    if (b.completedAt && Date.now() - b.completedAt.getTime() > 14 * 24 * 3600_000) throw conflict("The review window (14 days) has closed", "REVIEW_WINDOW_CLOSED");
    const isRenter = b.renterId === uid;
    const subjectId = isRenter ? b.ownerId : b.renterId;

    const review = await prisma.$transaction(async (tx) => {
      const r = await tx.review.create({
        data: {
          bookingId: b.id,
          listingId: isRenter ? b.listingId : null,
          authorId: uid,
          subjectId,
          role: isRenter ? "RENTER_TO_OWNER" : "OWNER_TO_RENTER",
          rating: req.body.rating,
          comment: req.body.comment,
        },
      });
      const agg = await tx.review.aggregate({ where: { subjectId, role: r.role, isHidden: false }, _avg: { rating: true }, _count: true });
      await tx.user.update({
        where: { id: subjectId },
        data: isRenter
          ? { ownerRatingAvg: agg._avg.rating ?? 0, ownerRatingCount: agg._count }
          : { renterRatingAvg: agg._avg.rating ?? 0, renterRatingCount: agg._count },
      });
      if (isRenter) {
        const la = await tx.review.aggregate({ where: { listingId: b.listingId, isHidden: false }, _avg: { rating: true }, _count: true });
        await tx.listing.update({ where: { id: b.listingId }, data: { ratingAvg: la._avg.rating ?? 0, ratingCount: la._count } });
      }
      return r;
    });
    await checkReviewAbuse(uid, subjectId);
    await invalidate("listings");
    await notify(subjectId, "review.new", { title: "You received a review", body: `${"★".repeat(review.rating)} for booking ${b.code}`, url: `/users/${subjectId}`, channels: ["push"] });
    res.status(201).json({ review });
  },
);

/** Reviews received by a user, split by role. */
reviewsRouter.get("/user/:userId", validate({ query: z.object({ role: z.enum(["RENTER_TO_OWNER", "OWNER_TO_RENTER"]).optional(), page: z.coerce.number().optional() }) }), async (req, res) => {
  const q = req.query as { role?: "RENTER_TO_OWNER" | "OWNER_TO_RENTER"; page?: number };
  const { skip, take, page, limit } = paginate(q.page, 10);
  const where = { subjectId: req.params.userId, isHidden: false, ...(q.role ? { role: q.role } : {}) };
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({ where, include: { author: { select: { id: true, name: true, avatarUrl: true } }, listing: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.review.count({ where }),
  ]);
  res.json({ reviews, meta: pageMeta(total, page, limit) });
});
