/**
 * Availability calendar for one listing: booked vs owner-blocked dates,
 * block a range (POST /blocks) and remove blocks (DELETE /blocks/:id).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { addDays, addMonths, differenceInCalendarDays, startOfDay } from "date-fns";
import toast from "react-hot-toast";
import { CalendarOff, CalendarX2, Lock, Pencil, Trash2, X } from "lucide-react";
import { api, apiError, apiErrorCode } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { Seo } from "@/components/Seo";
import { Alert, Button, ButtonLink, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { ErrorState, PageHeader } from "@/components/dashboard/common";

interface Range {
  startAt: string;
  endAt: string;
  type: "booked" | "blocked";
  id?: string;
}

/** Display a [start, end) interval as inclusive calendar days. */
const toDays = (r: Range) => ({ from: new Date(r.startAt), to: new Date(new Date(r.endAt).getTime() - 1) });

function useIsWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export default function ListingCalendarPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const wide = useIsWide();
  const [range, setRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");
  const today = startOfDay(new Date());
  const to = addMonths(today, 12);

  const listing = useQuery({ queryKey: ["listing", id, "owner"], queryFn: async () => (await api.get<{ listing: Listing }>(`/listings/${id}`)).data.listing });
  const avail = useQuery({
    queryKey: ["listing", id, "availability"],
    queryFn: async () => (await api.get<{ unavailable: Range[] }>(`/listings/${id}/availability`, { params: { from: today.toISOString(), to: to.toISOString() } })).data.unavailable,
  });

  const booked = useMemo(() => (avail.data ?? []).filter((r) => r.type === "booked"), [avail.data]);
  const blocked = useMemo(() => (avail.data ?? []).filter((r) => r.type === "blocked"), [avail.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["listing", id, "availability"] });
  };
  const add = useMutation({
    mutationFn: async () => {
      const startAt = startOfDay(range!.from!);
      const endAt = addDays(startOfDay(range!.to ?? range!.from!), 1);
      return api.post(`/listings/${id}/blocks`, { startAt: startAt.toISOString(), endAt: endAt.toISOString(), reason: reason.trim() || undefined });
    },
    onSuccess: () => {
      invalidate();
      setRange(undefined);
      setReason("");
      toast.success("Dates blocked — renters can't book them");
    },
    onError: (e) => toast.error(apiErrorCode(e) === "DATES_BOOKED" ? "Those dates overlap an existing booking. Pick dates that aren't booked." : apiError(e)),
  });
  const remove = useMutation({
    mutationFn: (blockId: string) => api.delete(`/listings/${id}/blocks/${blockId}`),
    onSuccess: () => {
      invalidate();
      toast.success("Dates are available again");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const selectedDays = range?.from ? differenceInCalendarDays(range.to ?? range.from, range.from) + 1 : 0;
  const overlapsBooked = Boolean(
    range?.from && booked.some((b) => new Date(b.startAt) < addDays(startOfDay(range.to ?? range.from!), 1) && new Date(b.endAt) > startOfDay(range.from!)),
  );

  return (
    <div>
      <Seo title="Availability calendar" noindex />
      <PageHeader
        back={{ to: "/dashboard/listings", label: "My listings" }}
        title="Availability"
        subtitle={listing.data ? listing.data.title : <Skeleton className="h-4 w-48" />}
        action={<ButtonLink to={`/dashboard/listings/${id}/edit`} variant="outline" icon={<Pencil className="h-4 w-4" />}>Edit listing</ButtonLink>}
      />

      {listing.isError && <ErrorState error={listing.error} onRetry={() => listing.refetch()} className="mb-6" />}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-x-auto">
          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
            <Legend className="bg-brand-600" label="Booked by renters" />
            <Legend className="bg-slate-400 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,.5)_3px,rgba(255,255,255,.5)_6px)]" label="Blocked by you" />
            <Legend className="bg-amber-400" label="Selected" />
          </div>
          {avail.isLoading ? (
            <Skeleton className="h-80 w-full rounded-2xl" />
          ) : avail.isError ? (
            <ErrorState error={avail.error} onRetry={() => avail.refetch()} />
          ) : (
            <div className="flex justify-center">
              <DayPicker
                mode="range"
                numberOfMonths={wide ? 2 : 1}
                selected={range}
                onSelect={setRange}
                startMonth={today}
                endMonth={to}
                disabled={[{ before: today }, ...booked.map(toDays)]}
                excludeDisabled
                modifiers={{ booked: booked.map(toDays), blocked: blocked.map(toDays) }}
                modifiersClassNames={{ booked: "rn-booked", blocked: "rn-blocked" }}
                weekStartsOn={1}
              />
            </div>
          )}
          <style>{`
            .rn-booked:not(.rdp-outside) .rdp-day_button { background: var(--color-brand-600); color: #fff; opacity: 1; border-radius: 10px; }
            .rn-blocked:not(.rdp-outside) .rdp-day_button { background-color: #94a3b8; background-image: repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,.45) 3px, rgba(255,255,255,.45) 6px); color: #fff; border-radius: 10px; }
            .rdp-range_start .rdp-day_button, .rdp-range_end .rdp-day_button { background: #f59e0b !important; border-color: #f59e0b; color: #fff; }
            .rdp-range_middle { background: #fef3c7 !important; }
            .rdp-range_middle .rdp-day_button { color: #92400e; }
          `}</style>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <CalendarOff className="h-4 w-4 text-slate-500" /> Block dates
            </h2>
            {range?.from ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                  <span>
                    <b>{fmtDate(range.from)}</b>
                    {range.to && range.to.getTime() !== range.from.getTime() && <> → <b>{fmtDate(range.to)}</b></>} · {selectedDays} day{selectedDays > 1 ? "s" : ""}
                  </span>
                  <button onClick={() => setRange(undefined)} aria-label="Clear selection" className="text-amber-700 hover:text-amber-900">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {overlapsBooked && <Alert tone="red">This range includes booked dates. Choose dates that aren't booked.</Alert>}
                <Input label="Reason (only you see this)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Personal use, servicing" />
                <Button block loading={add.isPending} disabled={overlapsBooked} onClick={() => add.mutate()} icon={<Lock className="h-4 w-4" />}>
                  Block {selectedDays} day{selectedDays > 1 ? "s" : ""}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Select a start and end date on the calendar to make them unavailable — for personal use, servicing or offline rentals.</p>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-900">Blocked periods</h2>
            {avail.isLoading ? (
              <Skeleton className="mt-3 h-16 w-full" />
            ) : blocked.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {blocked.map((b) => {
                  const d = toDays(b);
                  return (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm text-slate-700">
                        {fmtDate(d.from)}
                        {differenceInCalendarDays(d.to, d.from) > 0 && ` → ${fmtDate(d.to)}`}
                      </span>
                      <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === b.id} onClick={() => b.id && remove.mutate(b.id)} icon={<Trash2 className="h-4 w-4 text-red-600" />} aria-label="Remove block">
                        Unblock
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState className="mt-3 !py-8" icon={<CalendarX2 className="h-5 w-5" />} title="No blocked dates" description="Your item is bookable on all free dates." />
            )}
          </Card>

          {booked.length > 0 && (
            <Card>
              <h2 className="font-semibold text-slate-900">Upcoming bookings</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {booked.map((b, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-600" /> {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                  </li>
                ))}
              </ul>
              <Link to="/dashboard/bookings?tab=upcoming" className="link mt-3 inline-block text-sm">View bookings</Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3.5 w-3.5 rounded ${className}`} /> {label}
    </span>
  );
}
