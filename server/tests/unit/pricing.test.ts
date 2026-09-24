import { describe, expect, it } from "vitest";
import {
  calculateBreakdown, calculateCancellation, calculateLateFee, cheapestDayCombination, quoteRent, refundPercentFor, splitInclusiveTax, durationHours,
} from "../../src/modules/pricing/pricing";
import { DEFAULT_SETTINGS } from "../../src/modules/settings/settings.defaults";

const fees = DEFAULT_SETTINGS.fees;
const H = 3_600_000;
const D = 24 * H;
const t0 = new Date("2026-10-01T04:30:00.000Z");
const prices = { priceDaily: 100_000, priceWeekly: 550_000, priceMonthly: 1_800_000, priceHourly: null, securityDeposit: 500_000 };

describe("quoteRent", () => {
  it("charges per day, rounding partial days up", () => {
    const q = quoteRent(prices, t0, new Date(t0.getTime() + 2 * D + H));
    expect(q.unit).toBe("day");
    expect(q.units).toBe(3);
    expect(q.rent).toBe(300_000);
  });

  it("uses the weekly rate when cheaper (even overshooting)", () => {
    // 6 days daily = 6000, 1 week = 5500 → weekly wins
    const q = quoteRent(prices, t0, new Date(t0.getTime() + 6 * D));
    expect(q.rent).toBe(550_000);
    expect(q.lines[0].label).toContain("week");
  });

  it("combines months, weeks and days optimally", () => {
    const { cost } = cheapestDayCombination(38, prices);
    // 1 month (18000) + 1 week (5500) + 1 day (1000) = 24500
    expect(cost).toBe(2_450_000);
  });

  it("uses hourly pricing for short rentals, capped at the daily price", () => {
    const hourly = { ...prices, priceHourly: 15_000 };
    expect(quoteRent(hourly, t0, new Date(t0.getTime() + 3 * H))).toMatchObject({ unit: "hour", units: 3, rent: 45_000 });
    // 10h × 150 = 1500 > daily 1000 → capped to 1 day
    expect(quoteRent(hourly, t0, new Date(t0.getTime() + 10 * H))).toMatchObject({ unit: "day", rent: 100_000 });
  });

  it("supports hourly-only listings for long durations", () => {
    const q = quoteRent({ priceHourly: 5_000, securityDeposit: 0 }, t0, new Date(t0.getTime() + 30 * H));
    expect(q).toMatchObject({ unit: "hour", units: 30, rent: 150_000 });
  });

  it("rejects invalid ranges", () => {
    expect(() => quoteRent(prices, t0, t0)).toThrow();
  });

  it("computes at least one billable hour", () => {
    expect(durationHours(t0, new Date(t0.getTime() + 60_000))).toBe(1);
  });
});

describe("calculateBreakdown", () => {
  const end = new Date(t0.getTime() + 2 * D);

  it("adds renter service fee, GST on platform fees and deposit", () => {
    const b = calculateBreakdown(prices, t0, end, fees);
    expect(b.rentAmount).toBe(200_000);
    expect(b.serviceFee).toBe(10_000); // 5%
    expect(b.taxAmount).toBe(1_800); // 18% of service fee
    expect(b.depositAmount).toBe(500_000);
    expect(b.totalAmount).toBe(200_000 + 10_000 + 1_800 + 500_000);
  });

  it("splits the payment between owner and platform", () => {
    const b = calculateBreakdown(prices, t0, end, fees);
    expect(b.ownerCommission).toBe(30_000); // 15%
    expect(b.ownerCommissionTax).toBe(5_400); // 18% GST on commission
    expect(b.ownerPayoutAmount).toBe(200_000 - 30_000 - 5_400);
    expect(b.platformRevenue).toBe(10_000 + 30_000);
    // Money is conserved: renter total = owner + platform + taxes + deposit
    expect(b.totalAmount).toBe(b.ownerPayoutAmount + b.platformRevenue + b.taxAmount + b.ownerCommissionTax + b.depositAmount);
  });

  it("applies the lower Pro commission", () => {
    const b = calculateBreakdown(prices, t0, end, fees, { ownerIsPro: true });
    expect(b.ownerCommission).toBe(20_000);
    expect(b.rates.commissionRate).toBe(0.1);
  });

  it("charges the protection plan with a minimum fee", () => {
    const b = calculateBreakdown({ ...prices, priceDaily: 10_000 }, t0, new Date(t0.getTime() + D), fees, { protectionPlan: true });
    expect(b.protectionFee).toBe(fees.protectionPlan.minFee);
    const flat = calculateBreakdown(prices, t0, end, { ...fees, protectionPlan: { ...fees.protectionPlan, type: "FLAT", value: 9_900 } }, { protectionPlan: true });
    expect(flat.protectionFee).toBe(9_900);
  });

  it("gives owner-delivery fees to the owner and keeps platform delivery margin", () => {
    const own = calculateBreakdown(prices, t0, end, fees, { deliveryFee: 15_000 });
    expect(own.ownerPayoutAmount).toBe(200_000 - 30_000 - 5_400 + 15_000);
    const platform = calculateBreakdown(prices, t0, end, fees, { deliveryFee: 15_000, platformDelivery: true });
    expect(platform.platformRevenue).toBe(10_000 + 30_000 + 3_000);
    expect(platform.ownerPayoutAmount).toBe(200_000 - 30_000 - 5_400);
  });
});

describe("cancellations", () => {
  const b = calculateBreakdown(prices, t0, new Date(t0.getTime() + 2 * D), fees);
  const tiers = DEFAULT_SETTINGS.cancellationPolicies;

  it("picks the right refund tier", () => {
    expect(refundPercentFor(tiers.MODERATE, 100)).toBe(100);
    expect(refundPercentFor(tiers.MODERATE, 48)).toBe(50);
    expect(refundPercentFor(tiers.MODERATE, 2)).toBe(0);
    expect(refundPercentFor(tiers.STRICT, 200)).toBe(50);
    expect(refundPercentFor(tiers.FLEXIBLE, 30)).toBe(100);
  });

  it("refunds nothing and pays nothing for unpaid bookings", () => {
    const o = calculateCancellation({ cancelledBy: "RENTER", paid: false, hoursBeforeStart: 1, tiers: tiers.STRICT, booking: b, fees });
    expect(o).toMatchObject({ refundAmount: 0, ownerPayout: 0 });
  });

  it("gives a full refund (incl. fees) on an early renter cancellation", () => {
    const o = calculateCancellation({ cancelledBy: "RENTER", paid: true, hoursBeforeStart: 100, tiers: tiers.MODERATE, booking: b, fees });
    expect(o.refundAmount).toBe(b.totalAmount);
    expect(o.ownerPayout).toBe(0);
    expect(o.platformRetained).toBe(0);
  });

  it("keeps service fee and pays owner the retained rent on partial refunds", () => {
    const o = calculateCancellation({ cancelledBy: "RENTER", paid: true, hoursBeforeStart: 30, tiers: tiers.MODERATE, booking: b, fees });
    expect(o.refundPercent).toBe(50);
    expect(o.refundAmount).toBe(100_000 + b.depositAmount); // half rent + deposit
    expect(o.ownerPayout).toBe(100_000 - 15_000 - 2_700);
    expect(o.refundAmount + o.ownerPayout + o.platformRetained).toBe(b.totalAmount);
  });

  it("refunds everything and penalises the owner when the owner cancels", () => {
    const o = calculateCancellation({ cancelledBy: "OWNER", paid: true, hoursBeforeStart: 5, tiers: tiers.STRICT, booking: b, fees });
    expect(o.refundAmount).toBe(b.totalAmount);
    expect(o.ownerPenalty).toBe(Math.max(fees.ownerCancellationPenaltyMin, 20_000));
  });

  it("does not penalise owners for admin cancellations", () => {
    const o = calculateCancellation({ cancelledBy: "ADMIN", paid: true, hoursBeforeStart: 5, tiers: tiers.STRICT, booking: b, fees });
    expect(o.ownerPenalty).toBe(0);
    expect(o.refundAmount).toBe(b.totalAmount);
  });
});

describe("late fees", () => {
  it("is zero within the grace period", () => {
    const end = new Date(t0.getTime() + D);
    expect(calculateLateFee(end, new Date(end.getTime() + H), prices, fees.lateFee).lateFee).toBe(0);
  });

  it("charges per started extra day and splits owner/platform", () => {
    const end = new Date(t0.getTime() + D);
    const r = calculateLateFee(end, new Date(end.getTime() + 30 * H), prices, fees.lateFee);
    expect(r.lateDays).toBe(2);
    expect(r.lateFee).toBe(Math.round(2 * 100_000 * 1.5));
    expect(r.platformShare).toBe(Math.round(r.lateFee * 0.3));
    expect(r.ownerShare + r.platformShare).toBe(r.lateFee);
  });
});

describe("splitInclusiveTax", () => {
  it("splits a GST-inclusive amount", () => {
    const s = splitInclusiveTax(11_800, 0.18);
    expect(s).toEqual({ base: 10_000, tax: 1_800 });
  });
});
