/**
 * Booking lifecycle state machine.
 *
 *   REQUESTED ──accept──▶ ACCEPTED ──pay──▶ CONFIRMED ──handover──▶ ACTIVE
 *       │                    │                  │                    │ (past end)
 *   decline/expire      expire/cancel        cancel               OVERDUE
 *                                                                   │
 *                     COMPLETED ◀──inspection ok── RETURNED ◀──return┘
 *                         ▲                           │
 *                         └────resolve──── DISPUTED ◀─┘ (damage claim)
 *
 * Instant-book listings skip REQUESTED and start in ACCEPTED.
 * Every transition is recorded as a BookingEvent (audit timeline).
 */
import type { Booking, BookingStatus, Listing, Prisma as P } from "@prisma/client";
import { z } from "zod";
import { prisma, Tx } from "../../lib/prisma";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { bookingCode, formatMoney, HOUR } from "../../lib/util";
import { invalidate } from "../../lib/cache";
import { enqueue } from "../../lib/queue";
import { logger } from "../../lib/logger";
import { getSettings } from "../settings/settings.service";
import { notify } from "../notifications/notifications.service";
import { calculateCancellation, calculateLateFee } from "../pricing/pricing";
import { quoteListing } from "./booking.quote";
import { findConflicts, isOverlapViolation, lockListing, BLOCKING_STATUSES } from "./availability";
import { createBookingSchema, checklistSchema, inspectionSchema } from "./bookings.schemas";
import { bookingPayment, ledger, onPaymentCaptured, refundPayment } from "../payments/payments.service";
import { addOwnerPenalty, cancelBookingPayout, createPendingPayout, holdBookingPayout, scheduleBookingPayout } from "../payouts/payouts.service";
import { checkCancellationAbuse, isBlockedBetween } from "../trust/trust.service";
import { isProActive } from "../users/users.serializers";

type CreateInput = z.infer<typeof createBookingSchema>;

export async function recordEvent(
  tx: Tx,
  booking: Pick<Booking, "id">,
  type: string,
  actorId: string | null,
  fromStatus?: BookingStatus | null,
  toStatus?: BookingStatus | null,
  data?: Record<string, unknown>,
) {
  await tx.bookingEvent.create({ data: { bookingId: booking.id, type, actorId, fromStatus: fromStatus ?? null, toStatus: toStatus ?? null, data: (data ?? undefined) as object | undefined } });
}

/** Guarded status transition using optimistic check on current status. */
async function transition(tx: Tx, booking: Booking, allowed: BookingStatus[], to: BookingStatus, data: P.BookingUncheckedUpdateInput, actorId: string | null, type: string, extra?: Record<string, unknown>) {
  if (!allowed.includes(booking.status)) {
    throw conflict(`Booking is ${booking.status.toLowerCase()} and can't be updated this way`, "INVALID_STATE");
  }
  const res = await tx.booking.updateMany({ where: { id: booking.id, status: booking.status }, data: { ...data, status: to } as P.BookingUncheckedUpdateManyInput });
  if (res.count === 0) throw conflict("Booking was updated by someone else. Please refresh.", "STALE_STATE");
  await recordEvent(tx, booking, type, actorId, booking.status, to, extra);
  return tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
}

export async function getBookingForUser(bookingId: string, userId: string, role?: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw notFound("Booking");
  const staff = role === "ADMIN" || role === "SUPPORT";
  if (b.renterId !== userId && b.ownerId !== userId && !staff) throw notFound("Booking");
  return b;
}

// ---------------------------------------------------------------- create --
export async function createBooking(renterId: string, input: CreateInput, ip?: string) {
  const settings = await getSettings();
  const listing = await prisma.listing.findFirst({
    where: { id: input.listingId, deletedAt: null },
    include: { owner: { include: { subscription: true } } },
  });
  if (!listing || listing.status !== "ACTIVE") throw notFound("Listing");
  if (listing.ownerId === renterId) throw badRequest("You can't book your own listing");
  if (listing.owner.status !== "ACTIVE") throw badRequest("This listing is currently unavailable");
  if (await isBlockedBetween(renterId, listing.ownerId)) throw forbidden("You can't book this listing");

  const { breakdown } = await quoteListing(listing, input.startAt, input.endAt, { protectionPlan: input.protectionPlan, fulfillment: input.fulfillment });

  // KYC required above admin-configured booking value
  const renter = await prisma.user.findUniqueOrThrow({ where: { id: renterId } });
  if (breakdown.totalAmount > settings.trust.kycRequiredAboveAmount && renter.kycStatus !== "VERIFIED") {
    throw forbidden(
      `Bookings above ${formatMoney(settings.trust.kycRequiredAboveAmount)} require ID verification. Please complete KYC in your profile.`,
      "KYC_REQUIRED",
    );
  }

  const instant = listing.instantBooking;
  const now = Date.now();
  const expiresAt = instant
    ? new Date(now + settings.booking.instantPaymentWindowMinutes * 60_000)
    : new Date(Math.min(now + settings.booking.requestExpiryHours * HOUR, input.startAt.getTime()));

  try {
    const booking = await prisma.$transaction(async (tx) => {
      await lockListing(tx, listing.id);
      const { available } = await findConflicts(tx, listing.id, input.startAt, input.endAt);
      if (!available) throw conflict("These dates are no longer available. Please pick different dates.", "DATES_UNAVAILABLE");

      const dup = await tx.booking.findFirst({
        where: { listingId: listing.id, renterId, status: { in: ["REQUESTED", "ACCEPTED"] }, startAt: { lt: input.endAt }, endAt: { gt: input.startAt } },
      });
      if (dup) throw conflict("You already have a pending request for these dates", "DUPLICATE_REQUEST");

      const b = await tx.booking.create({
        data: {
          code: bookingCode(),
          listingId: listing.id,
          renterId,
          ownerId: listing.ownerId,
          startAt: input.startAt,
          endAt: input.endAt,
          status: instant ? "ACCEPTED" : "REQUESTED",
          fulfillment: input.fulfillment,
          deliveryAddress: input.deliveryAddress as object | undefined,
          instantBook: instant,
          protectionPlan: input.protectionPlan && breakdown.protectionFee > 0,
          cancellationPolicy: listing.cancellationPolicy,
          message: input.message,
          pricingUnit: breakdown.rent.unit,
          pricingUnits: breakdown.rent.units,
          rentAmount: breakdown.rentAmount,
          serviceFee: breakdown.serviceFee,
          protectionFee: breakdown.protectionFee,
          deliveryFee: breakdown.deliveryFee,
          taxAmount: breakdown.taxAmount,
          depositAmount: breakdown.depositAmount,
          totalAmount: breakdown.totalAmount,
          ownerCommission: breakdown.ownerCommission,
          ownerCommissionTax: breakdown.ownerCommissionTax,
          ownerPayoutAmount: breakdown.ownerPayoutAmount,
          platformRevenue: breakdown.platformRevenue,
          priceBreakdown: breakdown as unknown as object,
          agreementVersion: settings.legal.rentalAgreementVersion,
          agreementAcceptedAt: new Date(),
          agreementIp: ip,
          expiresAt,
          acceptedAt: instant ? new Date() : null,
        },
      });
      await recordEvent(tx, b, instant ? "booking.instant_booked" : "booking.requested", renterId, null, b.status, { message: input.message });

      // Ensure a conversation exists between renter & owner for this listing
      const conv = await tx.conversation.upsert({
        where: { listingId_renterId: { listingId: listing.id, renterId } },
        create: { listingId: listing.id, renterId, ownerId: listing.ownerId },
        update: { lastMessageAt: new Date() },
      });
      if (input.message) {
        await tx.message.create({ data: { conversationId: conv.id, senderId: renterId, body: input.message.slice(0, 1000) } });
      }
      return b;
    });

    await invalidate("listings");
    await notify(listing.ownerId, instant ? "booking.accepted" : "booking.requested", {
      title: instant ? "New instant booking" : "New booking request",
      body: instant
        ? `${renter.name} instantly booked "${listing.title}". Awaiting payment.`
        : `${renter.name} wants to rent "${listing.title}". Respond within ${settings.booking.requestExpiryHours}h.`,
      url: `/dashboard/bookings/${booking.id}`,
      data: { bookingId: booking.id },
    });
    return booking;
  } catch (err) {
    if (isOverlapViolation(err)) throw conflict("These dates were just booked by someone else. Please pick different dates.", "DATES_UNAVAILABLE");
    throw err;
  }
}

// ---------------------------------------------------------- owner actions --
export async function acceptBooking(bookingId: string, ownerId: string) {
  const settings = await getSettings();
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
  if (!b || b.ownerId !== ownerId) throw notFound("Booking");
  if (b.status === "REQUESTED" && b.expiresAt && b.expiresAt < new Date()) throw conflict("This request has expired", "EXPIRED");
  const renter = await prisma.user.findUniqueOrThrow({ where: { id: b.renterId } });
  if (renter.status !== "ACTIVE") throw conflict("This renter's account is no longer active");

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await lockListing(tx, b.listingId);
      const { available } = await findConflicts(tx, b.listingId, b.startAt, b.endAt, b.id);
      if (!available) throw conflict("You already have a booking or block for these dates", "DATES_UNAVAILABLE");
      const expiresAt = new Date(Math.min(Date.now() + settings.booking.paymentWindowHours * HOUR, b.startAt.getTime()));
      return transition(tx, b, ["REQUESTED"], "ACCEPTED", { acceptedAt: new Date(), expiresAt }, ownerId, "booking.accepted");
    });
    await invalidate("listings");
    await notify(b.renterId, "booking.accepted", {
      title: "Booking accepted 🎉",
      body: `Your request for "${b.listing.title}" was accepted. Complete payment to confirm.`,
      url: `/dashboard/bookings/${b.id}`,
    });
    return updated;
  } catch (err) {
    if (isOverlapViolation(err)) throw conflict("These dates overlap another accepted booking", "DATES_UNAVAILABLE");
    throw err;
  }
}

export async function declineBooking(bookingId: string, ownerId: string, reason?: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
  if (!b || b.ownerId !== ownerId) throw notFound("Booking");
  const updated = await prisma.$transaction((tx) =>
    transition(tx, b, ["REQUESTED"], "DECLINED", { declinedAt: new Date(), declineReason: reason }, ownerId, "booking.declined", { reason }),
  );
  await notify(b.renterId, "booking.declined", {
    title: "Booking request declined",
    body: `The owner couldn't accept your request for "${b.listing.title}".${reason ? ` Reason: ${reason}` : ""} Try similar items nearby.`,
    url: `/listing/${b.listingId}`,
  });
  return updated;
}

// ------------------------------------------------------------- payment ---
/** Create/reuse the Razorpay order for an ACCEPTED booking. */
export async function ensureBookingPayable(bookingId: string, renterId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.renterId !== renterId) throw notFound("Booking");
  if (b.status !== "ACCEPTED") throw conflict(b.status === "REQUESTED" ? "Waiting for the owner to accept" : `Booking is ${b.status.toLowerCase()}`, "NOT_PAYABLE");
  if (b.expiresAt && b.expiresAt < new Date()) throw conflict("The payment window has expired", "EXPIRED");
  return b;
}

/**
 * Payment captured → confirm booking. If the booking expired meanwhile we
 * try to re-acquire the dates; if that fails the renter is refunded in full.
 */
async function confirmPaidBooking(paymentId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (!payment.bookingId) return;
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: payment.bookingId }, include: { listing: true } });
  if (b.status === "CONFIRMED" || b.status === "ACTIVE" || b.status === "COMPLETED") return;

  let confirmed: Booking | null = null;
  try {
    confirmed = await prisma.$transaction(async (tx) => {
      await lockListing(tx, b.listingId);
      const current = await tx.booking.findUniqueOrThrow({ where: { id: b.id } });
      if (!["ACCEPTED", "EXPIRED"].includes(current.status)) return null;
      const { available } = await findConflicts(tx, b.listingId, b.startAt, b.endAt, b.id);
      if (!available || b.startAt < new Date()) return null;
      const updated = await transition(tx, current, ["ACCEPTED", "EXPIRED"], "CONFIRMED", { confirmedAt: new Date(), expiresAt: null }, b.renterId, "booking.confirmed", { paymentId });

      // Escrow bookkeeping
      await ledger(
        [
          { account: "OWNER_PAYABLE", amount: b.ownerPayoutAmount, description: "Owner share held in escrow", bookingId: b.id, paymentId },
          { account: "PLATFORM_REVENUE", amount: b.platformRevenue, description: "Platform fees", bookingId: b.id, paymentId },
          { account: "TAX_PAYABLE", amount: b.taxAmount + b.ownerCommissionTax, description: "GST on platform fees", bookingId: b.id, paymentId },
          { account: "DEPOSIT_HELD", amount: b.depositAmount, description: "Security deposit held", bookingId: b.id, paymentId },
        ],
        tx,
      );
      await createPendingPayout(b.id, b.ownerId, b.ownerPayoutAmount, tx);
      await tx.listing.update({ where: { id: b.listingId }, data: { bookingCount: { increment: 1 } } });

      // Auto-decline other pending requests that overlap these dates
      const overlapping = await tx.booking.findMany({
        where: { listingId: b.listingId, status: "REQUESTED", startAt: { lt: b.endAt }, endAt: { gt: b.startAt }, NOT: { id: b.id } },
      });
      for (const o of overlapping) {
        await transition(tx, o, ["REQUESTED"], "DECLINED", { declinedAt: new Date(), declineReason: "Dates were booked by another renter" }, null, "booking.auto_declined");
        await notify(o.renterId, "booking.declined", { title: "Dates no longer available", body: `"${b.listing.title}" was booked for overlapping dates. Try other dates or similar items.`, url: `/listing/${b.listingId}` });
      }
      return updated;
    });
  } catch (err) {
    if (!isOverlapViolation(err)) throw err;
    confirmed = null;
  }

  if (!confirmed) {
    logger.warn({ bookingId: b.id }, "payment captured but booking cannot be confirmed — refunding");
    await prisma.$transaction(async (tx) => {
      const cur = await tx.booking.findUniqueOrThrow({ where: { id: b.id } });
      if (!["CANCELLED", "DECLINED"].includes(cur.status)) {
        await tx.booking.update({ where: { id: b.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Payment arrived after the dates became unavailable" } });
        await recordEvent(tx, b, "booking.auto_cancelled", null, cur.status, "CANCELLED", { paymentId });
      }
    });
    await refundPayment({ paymentId, amount: payment.amount, reason: "Dates unavailable — automatic full refund", key: `refund:unavailable:${paymentId}`, bookingId: b.id });
    return;
  }

  await invalidate("listings");
  await enqueue("invoice.booking", { bookingId: b.id });
  await notify(b.ownerId, "booking.confirmed", {
    title: "Booking confirmed",
    body: `Booking ${b.code} for "${b.listing.title}" is paid and confirmed. Contact details are now visible.`,
    url: `/dashboard/bookings/${b.id}`,
  });
  await notify(b.renterId, "booking.confirmed", {
    title: "You're all set! ✅",
    body: `Booking ${b.code} is confirmed. Pickup details and the owner's contact are now available.`,
    url: `/dashboard/bookings/${b.id}`,
  });
}
onPaymentCaptured("BOOKING", (p) => confirmPaidBooking(p.id));

// ----------------------------------------------------------- cancellation --
export async function cancelBooking(bookingId: string, actor: { id: string; role: string }, reason?: string) {
  const settings = await getSettings();
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
  if (!b) throw notFound("Booking");
  const isStaff = actor.role === "ADMIN" || actor.role === "SUPPORT";
  const by: "RENTER" | "OWNER" | "ADMIN" = b.renterId === actor.id ? "RENTER" : b.ownerId === actor.id ? "OWNER" : isStaff ? "ADMIN" : (() => { throw notFound("Booking"); })();

  const cancellable: BookingStatus[] = ["REQUESTED", "ACCEPTED", "CONFIRMED"];
  if (!cancellable.includes(b.status)) {
    throw conflict("This booking can no longer be cancelled. Raise a dispute if something went wrong.", "INVALID_STATE");
  }
  const payment = b.status === "CONFIRMED" ? await bookingPayment(b.id) : null;
  const outcome = calculateCancellation({
    cancelledBy: by,
    paid: Boolean(payment),
    hoursBeforeStart: (b.startAt.getTime() - Date.now()) / HOUR,
    tiers: settings.cancellationPolicies[b.cancellationPolicy],
    booking: b,
    fees: settings.fees,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const u = await transition(
      tx,
      b,
      cancellable,
      "CANCELLED",
      { cancelledAt: new Date(), cancelledById: actor.id, cancellationReason: reason, refundAmount: outcome.refundAmount, ownerPenaltyAmount: outcome.ownerPenalty, expiresAt: null },
      actor.id,
      "booking.cancelled",
      { by, reason, ...outcome },
    );
    if (payment) {
      if (outcome.ownerPayout > 0) await scheduleBookingPayout(b.id, outcome.ownerPayout, "Cancellation — retained rent", tx);
      else await cancelBookingPayout(b.id, tx);
      if (outcome.ownerPenalty > 0) await addOwnerPenalty(b.ownerId, b.id, outcome.ownerPenalty, `Owner cancellation penalty for ${b.code}`, tx);
      await ledger(
        [
          { account: "OWNER_PAYABLE", amount: outcome.ownerPayout - b.ownerPayoutAmount, description: "Cancellation adjustment", bookingId: b.id },
          { account: "DEPOSIT_HELD", amount: -b.depositAmount, description: "Deposit returned on cancellation", bookingId: b.id },
        ],
        tx,
      );
    }
    if (by !== "ADMIN" && b.status !== "REQUESTED") {
      await tx.user.update({ where: { id: actor.id }, data: { cancellationCount: { increment: 1 } } });
    }
    return u;
  });

  if (payment && outcome.refundAmount > 0) {
    await refundPayment({ paymentId: payment.id, amount: outcome.refundAmount, reason: `Cancellation by ${by.toLowerCase()} (${b.code})`, actorId: actor.id, key: `refund:cancel:${b.id}`, bookingId: b.id });
  }
  if (by !== "ADMIN") await checkCancellationAbuse(actor.id);
  await invalidate("listings");

  const other = by === "RENTER" ? b.ownerId : b.renterId;
  await notify(other, "booking.cancelled", {
    title: "Booking cancelled",
    body: `Booking ${b.code} for "${b.listing.title}" was cancelled by the ${by.toLowerCase()}.${reason ? ` Reason: ${reason}` : ""}`,
    url: `/dashboard/bookings/${b.id}`,
  });
  if (by === "ADMIN") {
    await notify(b.ownerId, "booking.cancelled", { title: "Booking cancelled by support", body: `Booking ${b.code} was cancelled by our support team.`, url: `/dashboard/bookings/${b.id}` });
  }
  return { booking: updated, outcome };
}

// ------------------------------------------------------ handover / return --
export async function submitChecklist(bookingId: string, userId: string, input: z.infer<typeof checklistSchema>) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
  if (!b || (b.renterId !== userId && b.ownerId !== userId)) throw notFound("Booking");
  const role = b.ownerId === userId ? "OWNER" : "RENTER";
  const settings = await getSettings();

  if (input.type === "HANDOVER") {
    if (b.status !== "CONFIRMED") throw conflict("Handover is only possible for confirmed bookings", "INVALID_STATE");
    if (Date.now() < b.startAt.getTime() - 24 * HOUR) throw conflict("Handover opens 24 hours before the rental starts", "TOO_EARLY");
  } else if (!["ACTIVE", "OVERDUE"].includes(b.status)) {
    throw conflict("Return is only possible for active rentals", "INVALID_STATE");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.checklist.upsert({
      where: { bookingId_type_role: { bookingId: b.id, type: input.type, role } },
      create: { bookingId: b.id, type: input.type, role, submittedById: userId, condition: input.condition, notes: input.notes, items: input.items, photos: input.photos.map((p) => ({ ...p, takenAt: (p.takenAt ?? new Date()).toISOString(), uploadedAt: new Date().toISOString() })) },
      update: { condition: input.condition, notes: input.notes, items: input.items, photos: input.photos.map((p) => ({ ...p, takenAt: (p.takenAt ?? new Date()).toISOString(), uploadedAt: new Date().toISOString() })) },
    });
    await recordEvent(tx, b, `checklist.${input.type.toLowerCase()}.${role.toLowerCase()}`, userId, null, null, { photos: input.photos.length });
    const both = await tx.checklist.findMany({ where: { bookingId: b.id, type: input.type } });
    if (both.length < 2) return { advanced: false, booking: b };

    if (input.type === "HANDOVER") {
      const u = await transition(tx, b, ["CONFIRMED"], "ACTIVE", { handedOverAt: new Date() }, userId, "booking.handed_over");
      return { advanced: true, booking: u };
    }
    // Return: the earlier submission is the actual return time (fair to renter)
    const returnedAt = new Date(Math.min(...both.map((c) => c.createdAt.getTime())));
    const late = calculateLateFee(b.endAt, returnedAt, b.listing, settings.fees.lateFee);
    const depositDeduction = Math.min(b.depositAmount, late.lateFee);
    const u = await transition(
      tx,
      b,
      ["ACTIVE", "OVERDUE"],
      "RETURNED",
      {
        returnedAt,
        lateDays: late.lateDays,
        lateFeeAmount: late.lateFee,
        depositDeduction,
        inspectionDeadline: new Date(Date.now() + settings.booking.inspectionWindowHours * HOUR),
      },
      userId,
      "booking.returned",
      late,
    );
    return { advanced: true, booking: u };
  });

  if (result.advanced) {
    const other = role === "OWNER" ? b.renterId : b.ownerId;
    if (input.type === "HANDOVER") {
      await notify(b.renterId, "booking.handover", { title: "Rental started", body: `Enjoy "${b.listing.title}"! Return by ${b.endAt.toISOString()}.`, url: `/dashboard/bookings/${b.id}` });
      await notify(b.ownerId, "booking.handover", { title: "Handover complete", body: `"${b.listing.title}" is now with the renter.`, url: `/dashboard/bookings/${b.id}` });
    } else {
      await notify(b.ownerId, "booking.returned", {
        title: "Item returned — please inspect",
        body: `Inspect "${b.listing.title}" within ${settings.booking.inspectionWindowHours}h. If you do nothing, the deposit is released automatically.`,
        url: `/dashboard/bookings/${b.id}`,
      });
      await notify(b.renterId, "booking.returned", { title: "Return recorded", body: `Thanks for returning "${b.listing.title}". Your deposit will be released after inspection.`, url: `/dashboard/bookings/${b.id}` });
    }
    void other;
  } else {
    const other = role === "OWNER" ? b.renterId : b.ownerId;
    await notify(other, "system", {
      title: input.type === "HANDOVER" ? "Confirm handover" : "Confirm return",
      body: `The ${role.toLowerCase()} submitted the ${input.type.toLowerCase()} checklist for ${b.code}. Please add yours to continue.`,
      url: `/dashboard/bookings/${b.id}`,
      channels: ["push"],
    });
  }
  return result.booking;
}

// ------------------------------------------------------------ completion --
/**
 * Complete a returned booking: release (remaining) deposit to the renter
 * and schedule the owner payout (+ owner share of any late fee).
 */
export async function completeBooking(bookingId: string, actorId: string | null, opts: { extraDepositDeduction?: number; rentRefund?: number; note?: string } = {}) {
  const settings = await getSettings();
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { listing: true } });
  const payment = await bookingPayment(b.id);

  const depositDeduction = Math.min(b.depositAmount, b.depositDeduction + (opts.extraDepositDeduction ?? 0));
  const depositRelease = b.depositAmount - depositDeduction;
  const lateOwnerShare = b.lateFeeAmount ? Math.round(Math.min(b.lateFeeAmount, depositDeduction) * (1 - settings.fees.lateFee.platformShare)) : 0;
  const latePlatformShare = b.lateFeeAmount ? Math.min(b.lateFeeAmount, depositDeduction) - lateOwnerShare : 0;
  const damageToOwner = depositDeduction - Math.min(b.lateFeeAmount, depositDeduction);
  const rentRefund = Math.min(opts.rentRefund ?? 0, b.rentAmount);
  const rentRefundOwnerImpact = Math.round((rentRefund * b.ownerPayoutAmount) / Math.max(1, b.rentAmount));
  const ownerTotal = Math.max(0, b.ownerPayoutAmount - rentRefundOwnerImpact + lateOwnerShare + damageToOwner);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await transition(
      tx,
      b,
      ["RETURNED", "DISPUTED"],
      "COMPLETED",
      { completedAt: new Date(), depositDeduction, depositReleasedAt: new Date(), inspectionDeadline: null },
      actorId,
      "booking.completed",
      { depositRelease, depositDeduction, ownerTotal, rentRefund, note: opts.note },
    );
    await scheduleBookingPayout(b.id, ownerTotal, opts.note ?? "Rental completed", tx);
    await ledger(
      [
        { account: "DEPOSIT_HELD", amount: -b.depositAmount, description: "Deposit settled", bookingId: b.id },
        { account: "OWNER_PAYABLE", amount: ownerTotal - b.ownerPayoutAmount, description: "Completion adjustments (late fee/damages/refunds)", bookingId: b.id },
        { account: "PLATFORM_REVENUE", amount: latePlatformShare, description: "Late fee platform share", bookingId: b.id },
      ],
      tx,
    );
    return u;
  });

  if (payment) {
    const refundTotal = depositRelease + rentRefund;
    if (refundTotal > 0) {
      await refundPayment({
        paymentId: payment.id,
        amount: refundTotal,
        reason: rentRefund ? `Deposit release + partial refund (${b.code})` : `Security deposit release (${b.code})`,
        actorId,
        key: `refund:complete:${b.id}`,
        bookingId: b.id,
      });
    }
  }
  await notify(b.renterId, "booking.completed", {
    title: "Rental completed",
    body: `${depositRelease ? `Your deposit of ${formatMoney(depositRelease)} is being released. ` : ""}How was "${b.listing.title}"? Leave a review.`,
    url: `/dashboard/bookings/${b.id}`,
  });
  await notify(b.ownerId, "booking.completed", {
    title: "Rental completed",
    body: `${formatMoney(ownerTotal)} will be paid out to you shortly. Don't forget to review the renter.`,
    url: `/dashboard/bookings/${b.id}`,
  });
  return updated;
}

export async function submitInspection(bookingId: string, ownerId: string, input: z.infer<typeof inspectionSchema>) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.ownerId !== ownerId) throw notFound("Booking");
  if (b.status !== "RETURNED") throw conflict("Inspection is only possible after the item is returned", "INVALID_STATE");
  if (input.ok) return completeBooking(b.id, ownerId, { note: input.notes });

  const { openDispute } = await import("../disputes/disputes.service");
  await openDispute(ownerId, { bookingId: b.id, type: input.type, description: input.description, claimAmount: input.claimAmount, evidenceUrls: input.evidenceUrls });
  return prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
}

// --------------------------------------------------------------- scheduled --
/** Expire unanswered requests and unpaid acceptances. */
export async function expireStaleBookings() {
  const now = new Date();
  const stale = await prisma.booking.findMany({
    where: { status: { in: ["REQUESTED", "ACCEPTED"] }, expiresAt: { lt: now } },
    include: { listing: { select: { title: true } } },
    take: 500,
  });
  let expired = 0;
  for (const b of stale) {
    // Never expire a booking whose payment is captured (confirm will run)
    const paid = await prisma.payment.count({ where: { bookingId: b.id, status: "CAPTURED" } });
    if (paid) continue;
    try {
      await prisma.$transaction((tx) => transition(tx, b, ["REQUESTED", "ACCEPTED"], "EXPIRED", { expiresAt: null }, null, "booking.expired"));
      expired++;
      await notify(b.renterId, "booking.expired", {
        title: b.status === "REQUESTED" ? "Request expired" : "Payment window expired",
        body: b.status === "REQUESTED" ? `The owner didn't respond in time for "${b.listing.title}". Try similar items nearby.` : `Your booking for "${b.listing.title}" expired because payment wasn't completed.`,
        url: `/listing/${b.listingId}`,
      });
      if (b.status === "REQUESTED") {
        await notify(b.ownerId, "booking.expired", { title: "Request expired", body: `A booking request for "${b.listing.title}" expired without a response. Responding quickly improves your ranking.`, url: `/dashboard/bookings/${b.id}`, channels: [] });
      }
    } catch (err) {
      logger.debug({ err, bookingId: b.id }, "expire skipped");
    }
  }
  if (expired) await invalidate("listings");
  return { expired };
}

async function markReminder(b: Booking, key: string) {
  const sent = (b.remindersSent as string[]) ?? [];
  if (sent.includes(key)) return false;
  const res = await prisma.booking.updateMany({ where: { id: b.id, updatedAt: b.updatedAt }, data: { remindersSent: [...sent, key] } });
  return res.count > 0;
}

/** Pickup & return reminders. */
export async function sendReminders() {
  const now = Date.now();
  const upcoming = await prisma.booking.findMany({
    where: { status: "CONFIRMED", startAt: { gt: new Date(now), lt: new Date(now + 24 * HOUR) } },
    include: { listing: { select: { title: true } } },
  });
  for (const b of upcoming) {
    if (await markReminder(b, "start_24h")) {
      for (const uid of [b.renterId, b.ownerId]) {
        await notify(uid, "booking.reminder", { title: "Rental starts soon", body: `Booking ${b.code} ("${b.listing.title}") starts within 24 hours. Remember the handover checklist & photos.`, url: `/dashboard/bookings/${b.id}` });
      }
    }
  }
  const ending = await prisma.booking.findMany({
    where: { status: "ACTIVE", endAt: { gt: new Date(now), lt: new Date(now + 24 * HOUR) } },
    include: { listing: { select: { title: true } } },
  });
  for (const b of ending) {
    const hoursLeft = (b.endAt.getTime() - now) / HOUR;
    const key = hoursLeft <= 3 ? "return_3h" : "return_24h";
    if (await markReminder(b, key)) {
      await notify(b.renterId, "booking.reminder", {
        title: "Return reminder",
        body: `Please return "${b.listing.title}" by ${b.endAt.toISOString()}. Late returns are charged per extra day.`,
        url: `/dashboard/bookings/${b.id}`,
      });
    }
  }
  return { upcoming: upcoming.length, ending: ending.length };
}

/**
 * Overdue handling with escalating reminders; after N days the deposit is
 * captured and a NOT_RETURNED dispute is opened automatically.
 */
export async function handleOverdue() {
  const settings = await getSettings();
  const graceMs = settings.fees.lateFee.graceHours * HOUR;
  const now = Date.now();
  const newlyOverdue = await prisma.booking.findMany({ where: { status: "ACTIVE", endAt: { lt: new Date(now - graceMs) } }, include: { listing: true } });
  for (const b of newlyOverdue) {
    await prisma.$transaction((tx) => transition(tx, b, ["ACTIVE"], "OVERDUE", {}, null, "booking.overdue"));
    await notify(b.renterId, "booking.overdue", {
      title: "Rental overdue ⚠️",
      body: `"${b.listing.title}" was due back at ${b.endAt.toISOString()}. Late fees of ${formatMoney(Math.round((b.listing.priceDaily ?? (b.listing.priceHourly ?? 0) * 24) * settings.fees.lateFee.multiplier))}/day now apply. Please return it immediately.`,
      url: `/dashboard/bookings/${b.id}`,
    });
    await notify(b.ownerId, "booking.overdue", { title: "Rental overdue", body: `Booking ${b.code} is overdue. We've reminded the renter and will keep escalating.`, url: `/dashboard/bookings/${b.id}` });
  }

  const overdue = await prisma.booking.findMany({ where: { status: "OVERDUE" }, include: { listing: true } });
  for (const b of overdue) {
    const daysLate = Math.floor((now - b.endAt.getTime()) / (24 * HOUR));
    if (daysLate >= 1 && daysLate < settings.booking.overdueAutoDisputeDays && (await markReminder(b, `overdue_d${daysLate}`))) {
      await notify(b.renterId, "booking.overdue", {
        title: `Overdue by ${daysLate} day${daysLate > 1 ? "s" : ""}`,
        body: `Return "${b.listing.title}" now. After ${settings.booking.overdueAutoDisputeDays} days your deposit will be captured and the case escalated.`,
        url: `/dashboard/bookings/${b.id}`,
      });
    }
    if (daysLate >= settings.booking.overdueAutoDisputeDays && (await markReminder(b, "overdue_dispute"))) {
      const { openDispute } = await import("../disputes/disputes.service");
      await openDispute(b.ownerId, {
        bookingId: b.id,
        type: "NOT_RETURNED",
        description: `Automatically opened: item not returned ${daysLate} days after the rental ended.`,
        claimAmount: b.depositAmount,
        evidenceUrls: [],
        system: true,
      });
      const { raiseFlag } = await import("../trust/trust.service");
      await raiseFlag({ type: "OVERDUE_RENTAL", userId: b.renterId, severity: 3, details: { bookingId: b.id, daysLate } });
    }
  }
  return { newlyOverdue: newlyOverdue.length, overdue: overdue.length };
}

/** Owner didn't inspect in time → complete automatically. */
export async function autoCompleteInspections() {
  const due = await prisma.booking.findMany({ where: { status: "RETURNED", inspectionDeadline: { lt: new Date() } } });
  for (const b of due) {
    try {
      await completeBooking(b.id, null, { note: "Auto-completed after inspection window" });
    } catch (err) {
      logger.error({ err, bookingId: b.id }, "auto-complete failed");
    }
  }
  return { completed: due.length };
}

export { BLOCKING_STATUSES, isProActive };
export type { Listing };
