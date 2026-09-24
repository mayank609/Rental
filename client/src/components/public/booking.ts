/**
 * Booking-draft helpers shared by the listing page widget and checkout:
 * combine picked dates + times, validate against listing rules and map the
 * server quote into PriceBreakdown's shape.
 */
import { useMemo, useState } from "react";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import type { DateRange, Matcher } from "react-day-picker";
import type { Listing, Quote } from "@/lib/types";
import type { BreakdownLike } from "@/components/PriceBreakdown";
import { durationLabel } from "@/lib/format";

export type Fulfillment = "PICKUP" | "DELIVERY";

export interface BookingDraft {
  range: DateRange | undefined;
  startTime: string; // "HH:mm"
  endTime: string;
  fulfillment: Fulfillment;
  protection: boolean;
}

/** "HH:00" options for the time selects. */
export const TIME_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const v = `${String(h).padStart(2, "0")}:00`;
  const label = format(new Date(2000, 0, 1, h), "h:mm a");
  return { value: v, label, hour: h };
});

export const withTime = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m || 0, 0, 0);
  return d;
};

const hh = (h: number) => `${String(Math.max(0, Math.min(23, h))).padStart(2, "0")}:00`;

export function defaultFulfillment(l: Pick<Listing, "pickupAvailable" | "deliveryAvailable">): Fulfillment {
  return l.pickupAvailable || !l.deliveryAvailable ? "PICKUP" : "DELIVERY";
}

/** Controlled state for the booking widget, with range-change smartness for hourly items. */
export function useBookingDraft(listing: Listing | undefined, initial?: Partial<BookingDraft>) {
  const [draft, setDraft] = useState<BookingDraft>(() => ({
    range: undefined,
    startTime: "10:00",
    endTime: "10:00",
    fulfillment: listing ? defaultFulfillment(listing) : "PICKUP",
    protection: false,
    ...initial,
  }));

  const update = (patch: Partial<BookingDraft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      // Picking a single day on an hourly listing: make the end time sensible.
      if (patch.range && listing?.pricing.hourly && next.range?.from && next.range.to && isSameDay(next.range.from, next.range.to)) {
        const sh = Number(next.startTime.slice(0, 2));
        const eh = Number(next.endTime.slice(0, 2));
        if (eh <= sh) next.endTime = hh(sh + Math.max(1, Math.min(listing.minRentalHours, 23 - sh)));
      }
      return next;
    });

  return [draft, update] as const;
}

export interface DraftPeriod {
  startAt: Date | null;
  endAt: Date | null;
  hours: number;
  /** Client-side validation message (server re-validates). */
  problem: string | null;
}

export function draftPeriod(draft: BookingDraft, listing: Pick<Listing, "minRentalHours" | "maxRentalHours">): DraftPeriod {
  const from = draft.range?.from;
  if (!from) return { startAt: null, endAt: null, hours: 0, problem: "Select your rental dates" };
  const to = draft.range?.to ?? from;
  const startAt = withTime(from, draft.startTime);
  const endAt = withTime(to, draft.endTime);
  const hours = Math.ceil((endAt.getTime() - startAt.getTime()) / 3600_000);
  let problem: string | null = null;
  if (startAt.getTime() < Date.now()) problem = "Start time is in the past";
  else if (hours <= 0) problem = "Return time must be after pickup time";
  else if (hours < listing.minRentalHours) problem = `Minimum rental period is ${durationLabel(listing.minRentalHours)}`;
  else if (listing.maxRentalHours && hours > listing.maxRentalHours) problem = `Maximum rental period is ${durationLabel(listing.maxRentalHours)}`;
  return { startAt, endAt, hours, problem };
}

export interface UnavailableRange {
  startAt: string;
  endAt: string;
  type: "booked" | "blocked";
}

/**
 * Splits unavailable datetime ranges into fully-unavailable days (disabled in
 * the calendar) and partially-booked days (still selectable for hourly rentals).
 */
export function calendarMatchers(ranges: UnavailableRange[] | undefined) {
  const full: Date[] = [];
  const partial: Date[] = [];
  const today = startOfDay(new Date());
  for (const r of ranges ?? []) {
    const s = new Date(r.startAt);
    const e = new Date(r.endAt);
    for (let d = startOfDay(s); d < e; d = addDays(d, 1)) {
      if (d < today) continue;
      const covered = s <= d && e >= addDays(d, 1);
      (covered ? full : partial).push(d);
    }
  }
  const disabled: Matcher[] = [{ before: today }, ...full];
  return { disabled, partial };
}

export function useCalendarMatchers(ranges: UnavailableRange[] | undefined) {
  return useMemo(() => calendarMatchers(ranges), [ranges]);
}

/** Quote → PriceBreakdown props. */
export function quoteToBreakdown(q: Quote): BreakdownLike {
  const b = q.breakdown;
  return {
    rentLines: b.rent.lines,
    rentAmount: b.rent.amount,
    serviceFee: b.serviceFee,
    serviceFeeRate: b.rates.serviceFeeRate,
    protectionFee: b.protectionFee,
    deliveryFee: b.deliveryFee,
    taxAmount: b.taxAmount,
    gstRate: b.rates.gstRate,
    depositAmount: b.depositAmount,
    totalAmount: b.totalAmount,
  };
}

/** Query params for GET /listings/:id/quote (booleans only sent when true). */
export function quoteParams(startAt: Date, endAt: Date, protection: boolean, fulfillment: Fulfillment) {
  const p: Record<string, string | boolean> = { startAt: startAt.toISOString(), endAt: endAt.toISOString(), fulfillment };
  if (protection) p.protectionPlan = true;
  return p;
}
