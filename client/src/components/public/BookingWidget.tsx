/**
 * Listing booking widget (sticky on desktop, bottom-sheet on mobile) and the
 * availability calendar. State is lifted to the page via useBookingDraft so
 * the inline calendar, desktop widget and mobile sheet stay in sync.
 */
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { format, isSameDay, isToday } from "date-fns";
import clsx from "clsx";
import { AlertCircle, CalendarDays, CalendarX, Pencil, ShieldCheck, Truck, Store, Zap } from "lucide-react";
import { api, apiError } from "@/lib/api";
import type { Listing, PlatformConfig, Quote } from "@/lib/types";
import type { Matcher } from "react-day-picker";
import { durationLabel, money, pct } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { Alert, Button, ButtonLink, Modal, Rating, Skeleton, Toggle } from "@/components/ui";
import { TIME_OPTIONS, draftPeriod, quoteParams, quoteToBreakdown, type BookingDraft, type DraftPeriod } from "./booking";

/* ------------------------------------------------------------ live quote */

export function useListingQuote(listingId: string | undefined, period: DraftPeriod, draft: BookingDraft) {
  const key = period.startAt && period.endAt && !period.problem ? `${period.startAt.toISOString()}|${period.endAt.toISOString()}|${draft.protection}|${draft.fulfillment}` : null;
  const debounced = useDebounce(key, 350);
  return useQuery({
    queryKey: ["quote", listingId, debounced],
    queryFn: async () => {
      const [s, e, prot, ful] = debounced!.split("|");
      return (await api.get<Quote>(`/listings/${listingId}/quote`, { params: quoteParams(new Date(s), new Date(e), prot === "true", ful as BookingDraft["fulfillment"]) })).data;
    },
    enabled: Boolean(listingId && debounced),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/* ------------------------------------------------------------- calendar */

export function AvailabilityCalendar({
  range, onChange, disabled, partial, months = 1, className,
}: { range: DateRange | undefined; onChange: (r: DateRange | undefined) => void; disabled: Matcher[]; partial: Date[]; months?: number; className?: string }) {
  return (
    <div className={className}>
      <DayPicker
        mode="range"
        selected={range}
        onSelect={onChange}
        disabled={disabled}
        excludeDisabled
        numberOfMonths={months}
        startMonth={new Date()}
        modifiers={{ partial }}
        modifiersClassNames={{ partial: "rn-partial" }}
        showOutsideDays={false}
      />
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-brand-600" /> Selected</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-slate-200" /> Unavailable</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-2 ring-amber-400" /> Partly booked</span>
      </div>
      <style>{`.rn-partial:not(.rdp-selected) .rdp-day_button{box-shadow:inset 0 0 0 2px #fbbf24}.rdp-disabled .rdp-day_button{text-decoration:line-through;color:#94a3b8}`}</style>
    </div>
  );
}

/* --------------------------------------------------------------- widget */

export interface BookingWidgetProps {
  listing: Listing;
  isOwner: boolean;
  config?: PlatformConfig;
  draft: BookingDraft;
  onDraft: (p: Partial<BookingDraft>) => void;
  disabled: Matcher[];
  partial: Date[];
  /** Inside the mobile bottom sheet we render without the card chrome. */
  bare?: boolean;
}

export function BookingWidget({ listing, isOwner, config, draft, onDraft, disabled, partial, bare }: BookingWidgetProps) {
  const navigate = useNavigate();
  const [calOpen, setCalOpen] = useState(false);
  const period = draftPeriod(draft, listing);
  const quote = useListingQuote(listing.id, period, draft);
  const p = listing.pricing;
  const hourly = Boolean(p.hourly);
  const protectionEnabled = config?.fees.protectionPlan.enabled ?? quote.data?.protectionAvailable ?? false;

  const from = draft.range?.from;
  const to = draft.range?.to ?? from;
  const sameDay = from && to && isSameDay(from, to);
  const nowHour = new Date().getHours();

  const book = () => {
    if (!period.startAt || !period.endAt) return;
    const qs = new URLSearchParams({ startAt: period.startAt.toISOString(), endAt: period.endAt.toISOString(), fulfillment: draft.fulfillment });
    if (draft.protection) qs.set("protection", "1");
    navigate(`/checkout/${listing.id}?${qs}`);
  };

  const unavailable = quote.data && !quote.data.available && !quote.isPlaceholderData;
  const canBook = !period.problem && quote.data && quote.data.available && !quote.isFetching && !quote.isError;

  const body = (
    <div className="space-y-4">
      {/* Price header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          {p.daily ? (
            <p><span className="text-2xl font-extrabold text-slate-900">{money(p.daily)}</span><span className="text-slate-500"> / day</span></p>
          ) : (
            <p><span className="text-2xl font-extrabold text-slate-900">{money(p.hourly)}</span><span className="text-slate-500"> / hour</span></p>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            {[p.daily && p.hourly ? `${money(p.hourly)}/hr` : null, p.weekly ? `${money(p.weekly)}/wk` : null, p.monthly ? `${money(p.monthly)}/mo` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Rating avg={listing.rating.avg} count={listing.rating.count} size="md" />
      </div>

      {isOwner ? (
        <div className="space-y-2">
          <Alert tone="brand" title="This is your listing">Renters see the booking options here.</Alert>
          <ButtonLink to={`/dashboard/listings/${listing.id}/edit`} block icon={<Pencil className="h-4 w-4" />}>Edit listing</ButtonLink>
          <ButtonLink to={`/dashboard/listings/${listing.id}/calendar`} block variant="outline" icon={<CalendarDays className="h-4 w-4" />}>Manage calendar</ButtonLink>
        </div>
      ) : (
        <>
          {/* Dates */}
          <div className="overflow-hidden rounded-xl border border-slate-300">
            <button type="button" onClick={() => setCalOpen(true)} className="grid w-full grid-cols-2 text-left hover:bg-slate-50" aria-label="Choose rental dates">
              <span className="border-r border-slate-300 px-3 py-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Pickup</span>
                <span className={clsx("block text-sm", from ? "font-medium text-slate-900" : "text-slate-400")}>{from ? format(from, "EEE, d MMM") : "Add date"}</span>
              </span>
              <span className="px-3 py-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Return</span>
                <span className={clsx("block text-sm", to ? "font-medium text-slate-900" : "text-slate-400")}>{to ? format(to, "EEE, d MMM") : "Add date"}</span>
              </span>
            </button>
            <div className="grid grid-cols-2 border-t border-slate-300">
              <label className="border-r border-slate-300 px-3 py-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Pickup time</span>
                <select value={draft.startTime} onChange={(e) => onDraft({ startTime: e.target.value })} className="w-full bg-transparent py-0.5 text-sm font-medium text-slate-900 outline-none">
                  {TIME_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value} disabled={Boolean(from && isToday(from) && t.hour <= nowHour)}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label className="px-3 py-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Return time</span>
                <select value={draft.endTime} onChange={(e) => onDraft({ endTime: e.target.value })} className="w-full bg-transparent py-0.5 text-sm font-medium text-slate-900 outline-none">
                  {TIME_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value} disabled={Boolean(sameDay && t.hour <= Number(draft.startTime.slice(0, 2)))}>{t.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            {hourly ? "Hourly rentals: pick the same day for pickup and return." : "Daily rental."} Min {durationLabel(listing.minRentalHours)}
            {listing.maxRentalHours ? ` · max ${durationLabel(listing.maxRentalHours)}` : ""}.
          </p>

          {/* Fulfillment */}
          {listing.pickupAvailable && listing.deliveryAvailable ? (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pickup or delivery">
              {([
                ["PICKUP", "Pickup", "Free", Store],
                ["DELIVERY", "Delivery", listing.deliveryFee ? `+${money(listing.deliveryFee)}` : "Free", Truck],
              ] as const).map(([v, label, sub, Icon]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={draft.fulfillment === v}
                  onClick={() => onDraft({ fulfillment: v })}
                  className={clsx("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition", draft.fulfillment === v ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-300 hover:bg-slate-50")}
                >
                  <Icon className="h-4 w-4 text-slate-500" />
                  <span><span className="block font-semibold text-slate-900">{label}</span><span className="text-xs text-slate-500">{sub}</span></span>
                </button>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              {listing.deliveryAvailable ? <><Truck className="h-4 w-4" /> Delivery only{listing.deliveryFee ? ` · ${money(listing.deliveryFee)}` : " · free"}</> : <><Store className="h-4 w-4" /> Pickup from owner</>}
            </p>
          )}

          {/* Protection */}
          {protectionEnabled && config && (
            <div className="rounded-xl bg-slate-50 p-3">
              <Toggle
                checked={draft.protection}
                onChange={(v) => onDraft({ protection: v })}
                label={<span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Damage protection</span>}
                description={`Covers accidental damage up to ${money(config.fees.protectionPlan.coverageCap)}. ${config.fees.protectionPlan.type === "PERCENT" ? `${pct(config.fees.protectionPlan.value)} of rent` : money(config.fees.protectionPlan.value)} (min ${money(config.fees.protectionPlan.minFee)}).`}
              />
            </div>
          )}

          {/* Quote */}
          <div aria-live="polite">
            {period.problem ? (
              draft.range?.from ? <Alert tone="amber" icon={<AlertCircle className="h-4 w-4" />}>{period.problem}</Alert> : null
            ) : quote.isError ? (
              <Alert tone="red" icon={<AlertCircle className="h-4 w-4" />}>{apiError(quote.error)}</Alert>
            ) : quote.isLoading || !quote.data ? (
              <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-5 w-full" /></div>
            ) : (
              <div className={clsx("space-y-3 transition-opacity", quote.isFetching && "opacity-60")}>
                {unavailable && <Alert tone="red" icon={<CalendarX className="h-4 w-4" />} title="Not available for these dates">Try different dates — greyed-out days are already booked.</Alert>}
                <p className="text-xs font-medium text-slate-500">{durationLabel(quote.data.hours)} · {format(period.startAt!, "d MMM, h:mm a")} → {format(period.endAt!, "d MMM, h:mm a")}</p>
                <PriceBreakdown b={quoteToBreakdown(quote.data)} compact />
              </div>
            )}
          </div>

          <Button block size="lg" disabled={Boolean(draft.range?.from) && !canBook} onClick={draft.range?.from ? book : () => setCalOpen(true)} icon={listing.instantBooking ? <Zap className="h-4 w-4 fill-white" /> : undefined}>
            {!draft.range?.from ? "Check availability" : listing.instantBooking ? "Book instantly" : "Request to book"}
          </Button>
          <p className="text-center text-xs text-slate-500">
            {listing.instantBooking ? "Confirmed instantly after payment." : "You won't be charged until the owner accepts."}
          </p>
        </>
      )}

      <Modal open={calOpen} onClose={() => setCalOpen(false)} title="Select dates" size="lg" footer={<Button onClick={() => setCalOpen(false)}>Done</Button>}>
        <AvailabilityCalendar
          range={draft.range}
          onChange={(r) => onDraft({ range: r })}
          disabled={disabled}
          partial={partial}
          months={typeof window !== "undefined" && window.innerWidth >= 768 ? 2 : 1}
        />
      </Modal>
    </div>
  );

  if (bare) return body;
  return <div className="card p-5 sm:p-6">{body}</div>;
}
