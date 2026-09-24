/**
 * Booking views. Contact details and the exact pickup address are only
 * revealed to the counter-party once the booking is paid (CONFIRMED+).
 */
import type { Booking, BookingStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { publicUser } from "../users/users.serializers";

const REVEAL_STATUSES: BookingStatus[] = ["CONFIRMED", "ACTIVE", "OVERDUE", "RETURNED", "COMPLETED", "DISPUTED"];
export const contactsRevealed = (s: BookingStatus) => REVEAL_STATUSES.includes(s);

export function allowedActions(b: Booking, viewerId: string, extras: { hasReview: boolean; checklistRoles: Record<string, string[]>; openDispute: boolean }) {
  const isOwner = b.ownerId === viewerId;
  const isRenter = b.renterId === viewerId;
  const role = isOwner ? "OWNER" : "RENTER";
  const a: string[] = [];
  const now = Date.now();
  if (isOwner && b.status === "REQUESTED") a.push("accept", "decline");
  if (isRenter && b.status === "ACCEPTED") a.push("pay");
  if ((isOwner || isRenter) && ["REQUESTED", "ACCEPTED", "CONFIRMED"].includes(b.status)) a.push("cancel");
  if (b.status === "CONFIRMED" && now >= b.startAt.getTime() - 24 * 3600_000 && !(extras.checklistRoles.HANDOVER ?? []).includes(role)) a.push("handover");
  if (["ACTIVE", "OVERDUE"].includes(b.status) && !(extras.checklistRoles.RETURN ?? []).includes(role)) a.push("return");
  if (isOwner && b.status === "RETURNED") a.push("inspect");
  if (b.status === "COMPLETED" && !extras.hasReview && b.completedAt && now - b.completedAt.getTime() < 14 * 24 * 3600_000) a.push("review");
  if (!extras.openDispute && ["ACTIVE", "OVERDUE", "RETURNED", "COMPLETED", "CONFIRMED"].includes(b.status)) {
    if (b.status !== "COMPLETED" || (b.completedAt && now - b.completedAt.getTime() < 7 * 24 * 3600_000)) a.push("dispute");
  }
  if (contactsRevealed(b.status) || b.status === "CANCELLED") a.push("invoice");
  return a;
}

export async function bookingDetail(bookingId: string, viewerId: string, isStaff = false) {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      listing: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, address: true, city: true, locality: true } },
      renter: { include: { subscription: true } },
      owner: { include: { subscription: true } },
      checklists: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { id: true, name: true } } } },
      payments: { orderBy: { createdAt: "desc" }, include: { refunds: true } },
      payouts: true,
      reviews: true,
      disputes: { include: { evidence: true }, orderBy: { createdAt: "desc" } },
      invoices: { select: { id: true, number: true, type: true, userId: true, amount: true, createdAt: true } },
    },
  });
  const isOwner = b.ownerId === viewerId;
  const reveal = contactsRevealed(b.status) || isStaff;
  const checklistRoles: Record<string, string[]> = {};
  for (const c of b.checklists) checklistRoles[c.type] = [...(checklistRoles[c.type] ?? []), c.role];
  const conversation = await prisma.conversation.findUnique({ where: { listingId_renterId: { listingId: b.listingId, renterId: b.renterId } }, select: { id: true } });
  const openDispute = b.disputes.some((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");

  const breakdown = b.priceBreakdown as Record<string, unknown>;
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    viewerRole: isOwner ? "OWNER" : b.renterId === viewerId ? "RENTER" : "STAFF",
    startAt: b.startAt,
    endAt: b.endAt,
    expiresAt: b.expiresAt,
    fulfillment: b.fulfillment,
    deliveryAddress: isOwner || b.renterId === viewerId || isStaff ? b.deliveryAddress : null,
    instantBook: b.instantBook,
    protectionPlan: b.protectionPlan,
    cancellationPolicy: b.cancellationPolicy,
    message: b.message,
    listing: {
      id: b.listing.id,
      title: b.listing.title,
      slug: b.listing.slug,
      image: b.listing.images[0]?.thumbUrl ?? null,
      city: b.listing.city.name,
      locality: b.listing.locality?.name ?? null,
      approxLocation: { lat: b.listing.approxLat, lng: b.listing.approxLng },
      pickupAddress: reveal && b.listing.address
        ? { line1: b.listing.address.line1, line2: b.listing.address.line2, locality: b.listing.address.locality, city: b.listing.address.city, pincode: b.listing.address.pincode, lat: b.listing.lat, lng: b.listing.lng }
        : null,
      rules: b.listing.rules,
    },
    renter: { ...publicUser(b.renter), ...(reveal ? { phone: b.renter.phone, email: b.renter.email } : {}) },
    owner: { ...publicUser(b.owner), ...(reveal ? { phone: b.owner.phone, email: b.owner.email } : {}) },
    pricing: {
      unit: b.pricingUnit,
      units: b.pricingUnits,
      rentAmount: b.rentAmount,
      rentLines: (breakdown?.rent as { lines?: unknown })?.lines ?? [],
      serviceFee: b.serviceFee,
      protectionFee: b.protectionFee,
      deliveryFee: b.deliveryFee,
      taxAmount: b.taxAmount,
      depositAmount: b.depositAmount,
      totalAmount: b.totalAmount,
      ...(isOwner || isStaff
        ? { ownerCommission: b.ownerCommission, ownerCommissionTax: b.ownerCommissionTax, ownerPayoutAmount: b.ownerPayoutAmount }
        : {}),
      ...(isStaff ? { platformRevenue: b.platformRevenue } : {}),
    },
    lateDays: b.lateDays,
    lateFeeAmount: b.lateFeeAmount,
    depositDeduction: b.depositDeduction,
    refundAmount: b.refundAmount,
    ownerPenaltyAmount: isOwner || isStaff ? b.ownerPenaltyAmount : undefined,
    agreement: { version: b.agreementVersion, acceptedAt: b.agreementAcceptedAt },
    timestamps: {
      createdAt: b.createdAt, acceptedAt: b.acceptedAt, confirmedAt: b.confirmedAt, handedOverAt: b.handedOverAt,
      returnedAt: b.returnedAt, inspectionDeadline: b.inspectionDeadline, completedAt: b.completedAt, cancelledAt: b.cancelledAt, declinedAt: b.declinedAt,
    },
    cancellationReason: b.cancellationReason,
    declineReason: b.declineReason,
    checklists: b.checklists,
    events: b.events.map((e) => ({ id: e.id, type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, actor: e.actor, data: e.data, createdAt: e.createdAt })),
    payments: b.payments
      .filter((p) => p.userId === viewerId || isStaff)
      .map((p) => ({ id: p.id, status: p.status, amount: p.amount, refundedAmount: p.refundedAmount, method: p.method, createdAt: p.createdAt, refunds: p.refunds.map((r) => ({ id: r.id, amount: r.amount, status: r.status, reason: r.reason, createdAt: r.createdAt })) })),
    payouts: isOwner || isStaff ? b.payouts.map((p) => ({ id: p.id, amount: p.amount, status: p.status, scheduledFor: p.scheduledFor, paidAt: p.paidAt, note: p.note })) : undefined,
    reviews: b.reviews.map((r) => ({ id: r.id, authorId: r.authorId, role: r.role, rating: r.rating, comment: r.comment, createdAt: r.createdAt })),
    disputes: b.disputes.map((d) => ({ id: d.id, type: d.type, status: d.status, description: d.description, claimAmount: d.claimAmount, resolution: d.resolution, raisedById: d.raisedById, createdAt: d.createdAt, evidence: d.evidence })),
    invoices: b.invoices.filter((i) => i.userId === viewerId || isStaff),
    conversationId: conversation?.id ?? null,
    actions: isStaff && !isOwner && b.renterId !== viewerId ? ["cancel"] : allowedActions(b, viewerId, { hasReview: b.reviews.some((r) => r.authorId === viewerId), checklistRoles, openDispute }),
  };
}

export function bookingSummary(b: Booking & { listing: { id: string; title: string; images: { thumbUrl: string }[] }; renter: { id: string; name: string; avatarUrl: string | null }; owner: { id: string; name: string; avatarUrl: string | null } }, viewerId: string) {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    startAt: b.startAt,
    endAt: b.endAt,
    expiresAt: b.expiresAt,
    totalAmount: b.totalAmount,
    ownerPayoutAmount: b.ownerId === viewerId ? b.ownerPayoutAmount : undefined,
    listing: { id: b.listing.id, title: b.listing.title, image: b.listing.images[0]?.thumbUrl ?? null },
    counterparty: b.ownerId === viewerId ? b.renter : b.owner,
    viewerRole: b.ownerId === viewerId ? "OWNER" : "RENTER",
    createdAt: b.createdAt,
  };
}
