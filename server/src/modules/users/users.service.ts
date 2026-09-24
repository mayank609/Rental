/**
 * Account-level operations incl. DPDP Act 2023 rights: access (export) and
 * erasure (deletion), with deletion blocked while money/items are in flight.
 */
import { prisma } from "../../lib/prisma";
import { conflict } from "../../lib/errors";
import { audit } from "../../lib/audit";
import { ACTIVE_BOOKING_STATUSES } from "../bookings/availability";
import { revokeAllSessions } from "../auth/auth.service";
import { refreshCityCounts } from "../locations/locations.service";
import { invalidate } from "../../lib/cache";

export async function deletionBlockers(userId: string) {
  const [bookings, payouts, disputes] = await Promise.all([
    prisma.booking.count({ where: { OR: [{ renterId: userId }, { ownerId: userId }], status: { in: ACTIVE_BOOKING_STATUSES } } }),
    prisma.payout.count({ where: { ownerId: userId, status: { in: ["PENDING", "SCHEDULED", "PROCESSING", "ON_HOLD"] }, amount: { gt: 0 } } }),
    prisma.dispute.count({ where: { OR: [{ raisedById: userId }, { againstId: userId }], status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
  ]);
  const reasons: string[] = [];
  if (bookings) reasons.push(`${bookings} active or upcoming booking(s)`);
  if (payouts) reasons.push(`${payouts} pending payout(s)`);
  if (disputes) reasons.push(`${disputes} open dispute(s)`);
  return reasons;
}

/**
 * Soft-delete + anonymise PII. Financial records (bookings, invoices,
 * ledger) are retained as required by tax law but unlinked from identity.
 */
export async function deleteAccount(userId: string, ip?: string) {
  const blockers = await deletionBlockers(userId);
  if (blockers.length) {
    throw conflict(`Your account can't be deleted yet: ${blockers.join(", ")}. Please settle them first.`, "ACCOUNT_HAS_ACTIVE_ITEMS");
  }
  const listings = await prisma.listing.findMany({ where: { ownerId: userId, deletedAt: null }, select: { id: true, cityId: true } });
  await prisma.$transaction([
    prisma.listing.updateMany({ where: { ownerId: userId, deletedAt: null }, data: { status: "ARCHIVED", deletedAt: new Date() } }),
    prisma.address.deleteMany({ where: { userId } }),
    prisma.pushSubscription.deleteMany({ where: { userId } }),
    prisma.wishlistItem.deleteMany({ where: { userId } }),
    prisma.recentlyViewed.deleteMany({ where: { userId } }),
    prisma.payoutAccount.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        name: "Deleted user",
        email: null,
        phone: null,
        googleId: null,
        passwordHash: null,
        avatarUrl: null,
        bio: null,
        preferredLat: null,
        preferredLng: null,
        notificationPrefs: {},
        marketingOptIn: false,
      },
    }),
  ]);
  await revokeAllSessions(userId);
  await audit({ actorId: userId, action: "user.delete", entityType: "User", entityId: userId, ip });
  for (const cityId of new Set(listings.map((l) => l.cityId))) await refreshCityCounts(cityId);
  await invalidate("listings");
}

/** Machine-readable export of all personal data we hold. */
export async function exportUserData(userId: string) {
  const [user, addresses, listings, rentals, ownedBookings, reviewsWritten, reviewsReceived, messages, payments, payouts, notifications, kyc] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { subscription: true } }),
    prisma.address.findMany({ where: { userId } }),
    prisma.listing.findMany({ where: { ownerId: userId }, include: { images: true } }),
    prisma.booking.findMany({ where: { renterId: userId } }),
    prisma.booking.findMany({ where: { ownerId: userId } }),
    prisma.review.findMany({ where: { authorId: userId } }),
    prisma.review.findMany({ where: { subjectId: userId } }),
    prisma.message.findMany({ where: { senderId: userId } }),
    prisma.payment.findMany({ where: { userId }, include: { refunds: true } }),
    prisma.payout.findMany({ where: { ownerId: userId } }),
    prisma.notification.findMany({ where: { userId } }),
    prisma.kycDocument.findMany({ where: { userId }, select: { docType: true, docNumberMasked: true, status: true, createdAt: true } }),
  ]);
  const { passwordHash, ...safeUser } = user;
  void passwordHash;
  return { exportedAt: new Date().toISOString(), user: safeUser, addresses, listings, rentals, ownedBookings, reviewsWritten, reviewsReceived, messages, payments, payouts, notifications, kyc };
}
