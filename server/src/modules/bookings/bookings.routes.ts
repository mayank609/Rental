/**
 * /api/v1/bookings — booking lifecycle endpoints.
 */
import { Router } from "express";
import { z } from "zod";
import type { BookingStatus, Prisma as P } from "@prisma/client";
import { requireAuth, requirePhoneVerified } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeLimiter } from "../../middleware/rateLimit";
import { clientIp } from "../../middleware/security";
import { prisma } from "../../lib/prisma";
import { pageMeta } from "../../lib/util";
import * as svc from "./bookings.service";
import { checklistSchema, createBookingSchema, inspectionSchema, listBookingsSchema } from "./bookings.schemas";
import { bookingDetail, bookingSummary } from "./bookings.serializers";
import { createOrder, checkoutPayload } from "../payments/payments.service";

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const isStaff = (role?: string) => role === "ADMIN" || role === "SUPPORT";

bookingsRouter.post("/", requirePhoneVerified, writeLimiter, validate({ body: createBookingSchema }), async (req, res) => {
  const booking = await svc.createBooking(req.user!.id, req.body, clientIp(req));
  res.status(201).json({ booking: await bookingDetail(booking.id, req.user!.id) });
});

bookingsRouter.get("/", validate({ query: listBookingsSchema }), async (req, res) => {
  const q = req.query as unknown as z.infer<typeof listBookingsSchema>;
  const uid = req.user!.id;
  const now = new Date();
  const where: P.BookingWhereInput = q.role === "owner" ? { ownerId: uid } : { renterId: uid };
  if (q.status) where.status = { in: q.status.split(",") as BookingStatus[] };
  else if (q.scope === "upcoming") Object.assign(where, { status: { in: ["REQUESTED", "ACCEPTED", "CONFIRMED"] } });
  else if (q.scope === "active") Object.assign(where, { status: { in: ["ACTIVE", "OVERDUE", "RETURNED", "DISPUTED"] } });
  else if (q.scope === "past") Object.assign(where, { status: { in: ["COMPLETED", "CANCELLED", "DECLINED", "EXPIRED"] } });
  else if (q.scope === "action")
    Object.assign(where, q.role === "owner" ? { status: { in: ["REQUESTED", "RETURNED"] } } : { status: { in: ["ACCEPTED"] }, expiresAt: { gt: now } });

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        listing: { select: { id: true, title: true, images: { select: { thumbUrl: true }, orderBy: { sortOrder: "asc" }, take: 1 } } },
        renter: { select: { id: true, name: true, avatarUrl: true } },
        owner: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: q.scope === "past" ? { endAt: "desc" } : { startAt: "asc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.booking.count({ where }),
  ]);
  res.json({ bookings: items.map((b) => bookingSummary(b, uid)), meta: pageMeta(total, q.page, q.limit) });
});

bookingsRouter.get("/:id", async (req, res) => {
  await svc.getBookingForUser(req.params.id, req.user!.id, req.user!.role);
  res.json({ booking: await bookingDetail(req.params.id, req.user!.id, isStaff(req.user!.role)) });
});

bookingsRouter.post("/:id/accept", async (req, res) => {
  await svc.acceptBooking(req.params.id, req.user!.id);
  res.json({ booking: await bookingDetail(req.params.id, req.user!.id) });
});

bookingsRouter.post("/:id/decline", validate({ body: z.object({ reason: z.string().max(500).optional() }) }), async (req, res) => {
  await svc.declineBooking(req.params.id, req.user!.id, req.body.reason);
  res.json({ booking: await bookingDetail(req.params.id, req.user!.id) });
});

bookingsRouter.post("/:id/cancel", validate({ body: z.object({ reason: z.string().max(500).optional() }) }), async (req, res) => {
  const { outcome } = await svc.cancelBooking(req.params.id, req.user!, req.body.reason);
  res.json({ booking: await bookingDetail(req.params.id, req.user!.id, isStaff(req.user!.role)), outcome });
});

/** Preview of what a cancellation would refund (shown before confirming). */
bookingsRouter.get("/:id/cancellation-preview", async (req, res) => {
  const b = await svc.getBookingForUser(req.params.id, req.user!.id, req.user!.role);
  const { getSettings } = await import("../settings/settings.service");
  const { calculateCancellation } = await import("../pricing/pricing");
  const s = await getSettings();
  const by = b.renterId === req.user!.id ? "RENTER" : b.ownerId === req.user!.id ? "OWNER" : "ADMIN";
  const outcome = calculateCancellation({
    cancelledBy: by,
    paid: b.status === "CONFIRMED",
    hoursBeforeStart: (b.startAt.getTime() - Date.now()) / 3600_000,
    tiers: s.cancellationPolicies[b.cancellationPolicy],
    booking: b,
    fees: s.fees,
  });
  res.json({ outcome, policy: b.cancellationPolicy, tiers: s.cancellationPolicies[b.cancellationPolicy] });
});

/** Start / resume checkout for an accepted booking. */
bookingsRouter.post("/:id/pay", validate({ body: z.object({ idempotencyKey: z.string().max(80).optional() }) }), async (req, res) => {
  const b = await svc.ensureBookingPayable(req.params.id, req.user!.id);
  const payment = await createOrder({
    userId: req.user!.id,
    purpose: "BOOKING",
    amount: b.totalAmount,
    bookingId: b.id,
    idempotencyKey: req.body.idempotencyKey ?? `booking:${b.id}:${b.totalAmount}`,
    receipt: b.code,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ checkout: checkoutPayload(payment, user) });
});

bookingsRouter.post("/:id/checklists", validate({ body: checklistSchema }), async (req, res) => {
  await svc.submitChecklist(req.params.id, req.user!.id, req.body);
  res.json({ booking: await bookingDetail(req.params.id, req.user!.id) });
});

bookingsRouter.post("/:id/inspection", validate({ body: inspectionSchema }), async (req, res) => {
  await svc.submitInspection(req.params.id, req.user!.id, req.body);
  res.json({ booking: await bookingDetail(req.params.id, req.user!.id) });
});
