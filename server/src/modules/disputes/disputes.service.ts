/**
 * Disputes: either party raises an issue with evidence; payouts go on hold;
 * an admin/support agent resolves it deciding deposit deduction and refunds.
 */
import type { BookingStatus, DisputeType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { audit } from "../../lib/audit";
import { notify } from "../notifications/notifications.service";
import { holdBookingPayout } from "../payouts/payouts.service";
import { recordEvent, completeBooking } from "../bookings/bookings.service";
import { formatMoney } from "../../lib/util";

const DISPUTABLE: BookingStatus[] = ["CONFIRMED", "ACTIVE", "OVERDUE", "RETURNED", "COMPLETED"];

export async function openDispute(
  userId: string,
  input: { bookingId: string; type: DisputeType; description: string; claimAmount: number; evidenceUrls: string[]; system?: boolean },
) {
  const b = await prisma.booking.findUnique({ where: { id: input.bookingId }, include: { listing: { select: { title: true } } } });
  if (!b || (b.renterId !== userId && b.ownerId !== userId)) throw notFound("Booking");
  if (!DISPUTABLE.includes(b.status)) throw conflict("A dispute can't be opened for this booking", "INVALID_STATE");
  if (b.status === "COMPLETED" && b.completedAt && Date.now() - b.completedAt.getTime() > 7 * 24 * 3600_000) {
    throw conflict("Disputes must be raised within 7 days of completion", "DISPUTE_WINDOW_CLOSED");
  }
  const open = await prisma.dispute.findFirst({ where: { bookingId: b.id, status: { in: ["OPEN", "UNDER_REVIEW"] } } });
  if (open) throw conflict("There's already an open dispute for this booking", "DISPUTE_EXISTS");
  if (input.claimAmount > b.depositAmount + b.rentAmount + (b.protectionPlan ? 5_000_000 : 0)) {
    throw badRequest("Claim amount is higher than allowed for this booking");
  }
  const againstId = userId === b.ownerId ? b.renterId : b.ownerId;

  const dispute = await prisma.$transaction(async (tx) => {
    const d = await tx.dispute.create({
      data: {
        bookingId: b.id,
        raisedById: userId,
        againstId,
        type: input.type,
        description: input.description,
        claimAmount: input.claimAmount,
        evidence: { create: input.evidenceUrls.map((url) => ({ url, uploadedById: userId })) },
      },
    });
    // Completed bookings keep their status (payout may already be released);
    // in-flight ones move to DISPUTED and payouts are frozen.
    if (b.status !== "COMPLETED") {
      await tx.booking.update({ where: { id: b.id }, data: { status: "DISPUTED", inspectionDeadline: null } });
      await recordEvent(tx, b, "dispute.opened", input.system ? null : userId, b.status, "DISPUTED", { disputeId: d.id, type: input.type, previousStatus: b.status });
    } else {
      await recordEvent(tx, b, "dispute.opened", userId, null, null, { disputeId: d.id, type: input.type });
    }
    await holdBookingPayout(b.id, `Dispute ${d.id}`, tx);
    return d;
  });

  await notify(againstId, "dispute.opened", {
    title: "A dispute was raised",
    body: `A ${input.type.toLowerCase().replace(/_/g, " ")} issue was raised on booking ${b.code} ("${b.listing.title}"). Add your side and evidence.`,
    url: `/dashboard/disputes/${dispute.id}`,
  });
  await notify(userId, "dispute.opened", { title: "Dispute submitted", body: `Our team will review booking ${b.code} and respond within 48 hours.`, url: `/dashboard/disputes/${dispute.id}`, channels: [] });
  return dispute;
}

export async function addEvidence(disputeId: string, userId: string, input: { url?: string; note?: string }, isStaff = false) {
  const d = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!d || (!isStaff && d.raisedById !== userId && d.againstId !== userId)) throw notFound("Dispute");
  if (d.status === "RESOLVED" || d.status === "REJECTED") throw conflict("This dispute is closed");
  if (!input.url && !input.note) throw badRequest("Add a photo or a note");
  const ev = await prisma.disputeEvidence.create({ data: { disputeId, uploadedById: userId, url: input.url, note: input.note } });
  const other = userId === d.raisedById ? d.againstId : d.raisedById;
  await notify(other, "dispute.updated", { title: "New evidence added", body: "The other party added information to your dispute.", url: `/dashboard/disputes/${d.id}`, channels: ["push"] });
  return ev;
}

/**
 * Resolve a dispute. `depositDeduction` goes to the owner as compensation;
 * `refundAmount` is refunded to the renter out of the rent. The booking is
 * then completed (deposit remainder released, payout scheduled).
 */
export async function resolveDispute(
  disputeId: string,
  staffId: string,
  input: { decision: "RESOLVED" | "REJECTED"; resolution: string; depositDeduction: number; refundAmount: number },
) {
  const d = await prisma.dispute.findUnique({ where: { id: disputeId }, include: { booking: true } });
  if (!d) throw notFound("Dispute");
  if (d.status === "RESOLVED" || d.status === "REJECTED") throw conflict("Dispute already closed");
  const b = d.booking;
  const depositDeduction = input.decision === "REJECTED" ? 0 : Math.min(input.depositDeduction, b.depositAmount - b.depositDeduction);
  const refundAmount = input.decision === "REJECTED" ? 0 : Math.min(input.refundAmount, b.rentAmount);

  await prisma.dispute.update({
    where: { id: d.id },
    data: { status: input.decision, resolution: input.resolution, depositDeduction, refundAmount, resolvedById: staffId, resolvedAt: new Date() },
  });
  await audit({ actorId: staffId, action: "dispute.resolve", entityType: "Dispute", entityId: d.id, after: { ...input, depositDeduction, refundAmount } });

  if (b.status === "DISPUTED") {
    // Item still out (e.g. NOT_RETURNED) → mark returned on resolution
    if (!b.returnedAt) await prisma.booking.update({ where: { id: b.id }, data: { returnedAt: new Date() } });
    await completeBooking(b.id, staffId, { extraDepositDeduction: depositDeduction, rentRefund: refundAmount, note: `Dispute ${d.id} ${input.decision.toLowerCase()}` });
  } else if (b.status === "COMPLETED" && refundAmount > 0) {
    const { bookingPayment, refundPayment } = await import("../payments/payments.service");
    const p = await bookingPayment(b.id);
    if (p) await refundPayment({ paymentId: p.id, amount: refundAmount, reason: `Dispute resolution (${b.code})`, actorId: staffId, key: `refund:dispute:${d.id}`, bookingId: b.id });
    await prisma.payout.updateMany({ where: { bookingId: b.id, status: "ON_HOLD" }, data: { status: "SCHEDULED", scheduledFor: new Date(), amount: { decrement: Math.round((refundAmount * b.ownerPayoutAmount) / Math.max(1, b.rentAmount)) } } });
  } else {
    await prisma.payout.updateMany({ where: { bookingId: b.id, status: "ON_HOLD" }, data: { status: "SCHEDULED", scheduledFor: new Date() } });
  }

  const summary = input.decision === "REJECTED"
    ? "The claim was not upheld."
    : `Deposit deduction: ${formatMoney(depositDeduction)}; refund to renter: ${formatMoney(refundAmount)}.`;
  for (const uid of [d.raisedById, d.againstId]) {
    await notify(uid, "dispute.updated", { title: "Dispute resolved", body: `${summary} ${input.resolution}`, url: `/dashboard/disputes/${d.id}` });
  }
  return prisma.dispute.findUniqueOrThrow({ where: { id: d.id }, include: { evidence: true } });
}
