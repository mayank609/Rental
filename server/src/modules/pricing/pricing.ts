/**
 * Pure pricing engine — no I/O, fully unit tested.
 *
 * Money is always integer paise. Rounding happens once per line item with
 * Math.round so that the breakdown always sums exactly to the total.
 */
import type { PlatformSettings, RefundTier } from "../settings/settings.defaults";

export interface ListingPrices {
  priceHourly?: number | null;
  priceDaily?: number | null;
  priceWeekly?: number | null;
  priceMonthly?: number | null;
  securityDeposit: number;
}

export interface RentQuote {
  unit: "hour" | "day";
  units: number; // billable hours or days
  rent: number;
  /** Human readable breakdown of how the rent was derived. */
  lines: { label: string; amount: number }[];
}

const HOUR_MS = 3_600_000;

export function durationHours(start: Date, end: Date) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / HOUR_MS));
}

/**
 * Cheapest way to cover `days` using monthly(30)/weekly(7)/daily(1) rates.
 * Uses a small DP that allows "overshooting" (e.g. 6 days may be cheaper as
 * one week). Returns cost and the number of each unit used.
 */
export function cheapestDayCombination(days: number, p: ListingPrices) {
  const units: { size: number; price: number; label: string }[] = [];
  if (p.priceDaily) units.push({ size: 1, price: p.priceDaily, label: "day" });
  if (p.priceWeekly) units.push({ size: 7, price: p.priceWeekly, label: "week" });
  if (p.priceMonthly) units.push({ size: 30, price: p.priceMonthly, label: "month" });
  if (!units.length) throw new Error("Listing has no daily/weekly/monthly price");

  const limit = days + 30;
  const cost = new Array<number>(limit + 1).fill(Number.POSITIVE_INFINITY);
  const choice = new Array<number>(limit + 1).fill(-1);
  cost[0] = 0;
  for (let d = 1; d <= limit; d++) {
    units.forEach((u, i) => {
      const prev = d - u.size;
      if (prev >= 0 && cost[prev] + u.price < cost[d]) {
        cost[d] = cost[prev] + u.price;
        choice[d] = i;
      }
    });
  }
  // Best cost covering at least `days`
  let best = days;
  for (let d = days; d <= limit; d++) if (cost[d] < cost[best]) best = d;

  const counts: Record<string, number> = {};
  for (let d = best; d > 0; d -= units[choice[d]].size) {
    const u = units[choice[d]];
    counts[u.label] = (counts[u.label] ?? 0) + 1;
  }
  const lines = units
    .filter((u) => counts[u.label])
    .reverse()
    .map((u) => ({
      label: `${counts[u.label]} × ${u.label}${counts[u.label] > 1 ? "s" : ""}`,
      amount: counts[u.label] * u.price,
    }));
  return { cost: cost[best], lines };
}

/** Compute the rent for a period, choosing hourly or day-based pricing. */
export function quoteRent(p: ListingPrices, start: Date, end: Date): RentQuote {
  if (end <= start) throw new Error("End must be after start");
  const hours = durationHours(start, end);
  const hasDayPricing = Boolean(p.priceDaily || p.priceWeekly || p.priceMonthly);

  if (p.priceHourly && (hours < 24 || !hasDayPricing)) {
    const hourly = hours * p.priceHourly;
    // Never charge more for a few hours than for the whole day
    if (hasDayPricing && p.priceDaily && p.priceDaily < hourly) {
      return { unit: "day", units: 1, rent: p.priceDaily, lines: [{ label: "1 × day", amount: p.priceDaily }] };
    }
    return { unit: "hour", units: hours, rent: hourly, lines: [{ label: `${hours} × hour${hours > 1 ? "s" : ""}`, amount: hourly }] };
  }
  const days = Math.ceil(hours / 24);
  const { cost, lines } = cheapestDayCombination(days, p);
  return { unit: "day", units: days, rent: cost, lines };
}

export interface FeeOptions {
  protectionPlan?: boolean;
  deliveryFee?: number; // paise, 0 when pickup
  platformDelivery?: boolean;
  ownerIsPro?: boolean;
}

export interface PriceBreakdown {
  rent: RentQuote;
  rentAmount: number;
  serviceFee: number;
  protectionFee: number;
  deliveryFee: number;
  taxAmount: number; // GST on renter-side platform fees
  depositAmount: number;
  totalAmount: number; // Charged to renter now
  ownerCommission: number;
  ownerCommissionTax: number;
  ownerPayoutAmount: number;
  platformRevenue: number; // Excluding taxes
  rates: { commissionRate: number; serviceFeeRate: number; gstRate: number };
  currency: string;
}

/** Full checkout breakdown for renter + payout split for owner. */
export function calculateBreakdown(
  prices: ListingPrices,
  start: Date,
  end: Date,
  fees: PlatformSettings["fees"],
  opts: FeeOptions = {},
  currency = "INR",
): PriceBreakdown {
  const rent = quoteRent(prices, start, end);
  const rentAmount = rent.rent;
  const commissionRate = opts.ownerIsPro ? fees.proOwnerCommissionRate : fees.ownerCommissionRate;
  const serviceFee = Math.round(rentAmount * fees.renterServiceFeeRate);

  let protectionFee = 0;
  if (opts.protectionPlan && fees.protectionPlan.enabled) {
    protectionFee =
      fees.protectionPlan.type === "FLAT"
        ? Math.round(fees.protectionPlan.value)
        : Math.max(fees.protectionPlan.minFee, Math.round(rentAmount * fees.protectionPlan.value));
  }

  const deliveryFee = Math.max(0, Math.round(opts.deliveryFee ?? 0));
  const deliveryMargin = opts.platformDelivery ? Math.round(deliveryFee * fees.deliveryMarginRate) : 0;

  // GST is levied on the platform's own supplies only (not on owner's rent).
  const taxAmount = Math.round((serviceFee + protectionFee + deliveryMargin) * fees.gstRate);
  const ownerCommission = Math.round(rentAmount * commissionRate);
  const ownerCommissionTax = Math.round(ownerCommission * fees.gstRate);

  const depositAmount = prices.securityDeposit ?? 0;
  const totalAmount = rentAmount + serviceFee + protectionFee + deliveryFee + taxAmount + depositAmount;

  // Owner delivers themselves → owner keeps delivery fee. Platform delivery →
  // the delivery partner is paid out of it and the platform keeps the margin.
  const ownerDeliveryShare = opts.platformDelivery ? 0 : deliveryFee;
  const ownerPayoutAmount = rentAmount - ownerCommission - ownerCommissionTax + ownerDeliveryShare;
  const platformRevenue = serviceFee + ownerCommission + protectionFee + deliveryMargin;

  return {
    rent,
    rentAmount,
    serviceFee,
    protectionFee,
    deliveryFee,
    taxAmount,
    depositAmount,
    totalAmount,
    ownerCommission,
    ownerCommissionTax,
    ownerPayoutAmount,
    platformRevenue,
    rates: { commissionRate, serviceFeeRate: fees.renterServiceFeeRate, gstRate: fees.gstRate },
    currency,
  };
}

// ---------------------------------------------------------------------------
// Cancellations
// ---------------------------------------------------------------------------

export interface CancellationInput {
  cancelledBy: "RENTER" | "OWNER" | "ADMIN";
  paid: boolean;
  hoursBeforeStart: number;
  tiers: RefundTier[];
  booking: Pick<
    PriceBreakdown,
    "rentAmount" | "serviceFee" | "protectionFee" | "deliveryFee" | "taxAmount" | "depositAmount" | "totalAmount" | "ownerCommission" | "ownerCommissionTax"
  >;
  fees: PlatformSettings["fees"];
}

export interface CancellationOutcome {
  refundPercent: number; // Percentage of rent refunded
  refundAmount: number; // Total refunded to renter
  ownerPayout: number; // What the owner still receives
  platformRetained: number;
  ownerPenalty: number;
}

/** Pick the refund percentage from ordered tiers for a given notice period. */
export function refundPercentFor(tiers: RefundTier[], hoursBeforeStart: number) {
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  for (const t of sorted) if (hoursBeforeStart >= t.hoursBefore) return t.refundPercent;
  return 0;
}

export function calculateCancellation(input: CancellationInput): CancellationOutcome {
  const { booking: b, fees } = input;
  if (!input.paid) {
    return { refundPercent: 100, refundAmount: 0, ownerPayout: 0, platformRetained: 0, ownerPenalty: 0 };
  }

  // Owner / admin cancellation → renter gets everything back; owner is penalised.
  if (input.cancelledBy !== "RENTER") {
    const ownerPenalty =
      input.cancelledBy === "OWNER"
        ? Math.max(fees.ownerCancellationPenaltyMin, Math.round(b.rentAmount * fees.ownerCancellationPenaltyRate))
        : 0;
    return { refundPercent: 100, refundAmount: b.totalAmount, ownerPayout: 0, platformRetained: 0, ownerPenalty };
  }

  const pct = refundPercentFor(input.tiers, input.hoursBeforeStart);
  const rentRefund = Math.round((b.rentAmount * pct) / 100);
  const retainedRent = b.rentAmount - rentRefund;
  // Service fee + its GST are refunded only on a full refund. Deposit, delivery
  // (not yet performed) and protection are always refunded.
  const feesRefund = pct === 100 ? b.serviceFee + b.taxAmount : 0;
  const refundAmount = rentRefund + feesRefund + b.depositAmount + b.deliveryFee + b.protectionFee;

  // Owner receives retained rent minus proportional commission (+GST on it).
  const commissionOnRetained = Math.round((retainedRent * b.ownerCommission) / Math.max(1, b.rentAmount));
  const commissionTaxOnRetained = Math.round((retainedRent * b.ownerCommissionTax) / Math.max(1, b.rentAmount));
  const ownerPayout = retainedRent - commissionOnRetained - commissionTaxOnRetained;
  const platformRetained = b.totalAmount - refundAmount - ownerPayout;
  return { refundPercent: pct, refundAmount, ownerPayout, platformRetained, ownerPenalty: 0 };
}

// ---------------------------------------------------------------------------
// Late returns
// ---------------------------------------------------------------------------

export function calculateLateFee(
  scheduledEnd: Date,
  actualReturn: Date,
  prices: ListingPrices,
  lateCfg: PlatformSettings["fees"]["lateFee"],
) {
  const lateMs = actualReturn.getTime() - scheduledEnd.getTime() - lateCfg.graceHours * HOUR_MS;
  if (lateMs <= 0) return { lateDays: 0, lateFee: 0, ownerShare: 0, platformShare: 0 };
  const lateDays = Math.ceil(lateMs / (24 * HOUR_MS));
  const daily = prices.priceDaily ?? (prices.priceHourly ? prices.priceHourly * 24 : 0);
  const lateFee = Math.round(lateDays * daily * lateCfg.multiplier);
  const platformShare = Math.round(lateFee * lateCfg.platformShare);
  return { lateDays, lateFee, ownerShare: lateFee - platformShare, platformShare };
}

/** Split a lump sum across a GST-inclusive amount (used for invoices). */
export function splitInclusiveTax(amountInclTax: number, rate: number) {
  const base = Math.round(amountInclTax / (1 + rate));
  return { base, tax: amountInclTax - base };
}
