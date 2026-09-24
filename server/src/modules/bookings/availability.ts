/**
 * Availability rules shared by listings (calendar, search) and bookings.
 *
 * Statuses that hold the calendar. REQUESTED does not block (so a single
 * renter cannot squat dates); the owner accepting (or instant booking)
 * moves it to ACCEPTED which blocks until paid or expired. A PostgreSQL
 * exclusion constraint enforces the same rule at the database level.
 */
import type { BookingStatus } from "@prisma/client";
import { prisma, Prisma, Tx } from "../../lib/prisma";

export const BLOCKING_STATUSES: BookingStatus[] = ["ACCEPTED", "CONFIRMED", "ACTIVE", "OVERDUE"];
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ["REQUESTED", "ACCEPTED", "CONFIRMED", "ACTIVE", "OVERDUE", "RETURNED", "DISPUTED"];

/** Row-level lock on the listing to serialise concurrent booking attempts. */
export async function lockListing(tx: Tx, listingId: string) {
  await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${listingId} FOR UPDATE`;
}

export async function findConflicts(tx: Tx, listingId: string, startAt: Date, endAt: Date, excludeBookingId?: string) {
  const [bookings, blocks] = await Promise.all([
    tx.booking.findMany({
      where: {
        listingId,
        status: { in: BLOCKING_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeBookingId ? { NOT: { id: excludeBookingId } } : {}),
      },
      select: { id: true, startAt: true, endAt: true },
    }),
    tx.availabilityBlock.findMany({
      where: { listingId, startAt: { lt: endAt }, endAt: { gt: startAt } },
      select: { id: true, startAt: true, endAt: true },
    }),
  ]);
  return { bookings, blocks, available: bookings.length === 0 && blocks.length === 0 };
}

/** Calendar view of unavailable ranges for a listing. */
export async function getUnavailableRanges(listingId: string, from: Date, to: Date) {
  const { bookings, blocks } = await findConflicts(prisma, listingId, from, to);
  return [
    ...bookings.map((b) => ({ startAt: b.startAt, endAt: b.endAt, type: "booked" as const })),
    ...blocks.map((b) => ({ startAt: b.startAt, endAt: b.endAt, type: "blocked" as const, id: b.id })),
  ].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** True when the DB exclusion constraint rejected an overlapping booking. */
export function isOverlapViolation(err: unknown) {
  const msg = (err as Error)?.message ?? "";
  return (
    msg.includes("Booking_no_overlap") ||
    (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2004") ||
    msg.includes("23P01")
  );
}
