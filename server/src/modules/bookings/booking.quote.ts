/**
 * Validates a requested rental period against listing rules and returns the
 * full price breakdown. Shared by the public quote endpoint and booking
 * creation so the renter always pays exactly what they were shown.
 */
import type { Listing, Subscription } from "@prisma/client";
import { calculateBreakdown, durationHours } from "../pricing/pricing";
import { getSettings } from "../settings/settings.service";
import { badRequest } from "../../lib/errors";
import { isProActive } from "../users/users.serializers";
import { env } from "../../config/env";

export interface QuoteOptions {
  protectionPlan?: boolean;
  fulfillment?: "PICKUP" | "DELIVERY";
}

export async function quoteListing(
  listing: Listing & { owner?: { subscription?: Subscription | null } | null },
  startAt: Date,
  endAt: Date,
  opts: QuoteOptions = {},
) {
  const settings = await getSettings();
  const now = Date.now();
  if (!(startAt instanceof Date) || isNaN(startAt.getTime()) || isNaN(endAt.getTime())) throw badRequest("Invalid dates");
  if (endAt <= startAt) throw badRequest("End time must be after start time", { field: "endAt" });
  if (startAt.getTime() < now + settings.booking.minLeadTimeHours * 3600_000 - 60_000) {
    throw badRequest(`Bookings must start at least ${settings.booking.minLeadTimeHours}h from now`, { field: "startAt" });
  }
  if (startAt.getTime() > now + settings.booking.maxAdvanceDays * 24 * 3600_000) {
    throw badRequest(`Bookings can be made up to ${settings.booking.maxAdvanceDays} days in advance`, { field: "startAt" });
  }
  const hours = durationHours(startAt, endAt);
  if (hours < listing.minRentalHours) {
    throw badRequest(`Minimum rental period is ${formatHours(listing.minRentalHours)}`, { field: "endAt", minRentalHours: listing.minRentalHours });
  }
  if (listing.maxRentalHours && hours > listing.maxRentalHours) {
    throw badRequest(`Maximum rental period is ${formatHours(listing.maxRentalHours)}`, { field: "endAt", maxRentalHours: listing.maxRentalHours });
  }
  const fulfillment = opts.fulfillment ?? "PICKUP";
  if (fulfillment === "DELIVERY" && !listing.deliveryAvailable) throw badRequest("Delivery is not available for this item");
  if (fulfillment === "PICKUP" && !listing.pickupAvailable) throw badRequest("This item is delivery-only");

  const breakdown = calculateBreakdown(
    listing,
    startAt,
    endAt,
    settings.fees,
    {
      protectionPlan: opts.protectionPlan,
      deliveryFee: fulfillment === "DELIVERY" ? listing.deliveryFee ?? 0 : 0,
      ownerIsPro: isProActive(listing.owner?.subscription),
    },
    env.CURRENCY,
  );
  return { breakdown, hours, fulfillment, protectionAvailable: settings.fees.protectionPlan.enabled, protectionCoverageCap: settings.fees.protectionPlan.coverageCap };
}

export function formatHours(h: number) {
  if (h % 24 === 0) return `${h / 24} day${h === 24 ? "" : "s"}`;
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/** Renter-facing view of the breakdown (no owner-side numbers). */
export function renterBreakdown(b: ReturnType<typeof calculateBreakdown>) {
  return {
    rent: { unit: b.rent.unit, units: b.rent.units, amount: b.rentAmount, lines: b.rent.lines },
    serviceFee: b.serviceFee,
    protectionFee: b.protectionFee,
    deliveryFee: b.deliveryFee,
    taxAmount: b.taxAmount,
    depositAmount: b.depositAmount,
    totalAmount: b.totalAmount,
    payableExcludingDeposit: b.totalAmount - b.depositAmount,
    rates: { serviceFeeRate: b.rates.serviceFeeRate, gstRate: b.rates.gstRate },
    currency: b.currency,
  };
}

/** Owner-facing view of the payout split. */
export function ownerBreakdown(b: ReturnType<typeof calculateBreakdown>) {
  return {
    rentAmount: b.rentAmount,
    deliveryFee: b.deliveryFee,
    commission: b.ownerCommission,
    commissionTax: b.ownerCommissionTax,
    commissionRate: b.rates.commissionRate,
    payout: b.ownerPayoutAmount,
    currency: b.currency,
  };
}
