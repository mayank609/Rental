/**
 * Small building blocks shared by the dashboard pages: page headers,
 * error/loading states, countdowns, blob downloads, photo galleries and
 * the booking list card.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import toast from "react-hot-toast";
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, ImageOff, MapPin, RefreshCw } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtDateTime, fmtRange, money } from "@/lib/format";
import type { BookingSummary, ChecklistPhoto } from "@/lib/types";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, Button, Card, Modal, Skeleton } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function PageHeader({ title, subtitle, action, back }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="mb-6">
      {back && (
        <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
    </header>
  );
}

/** Error card with a retry button (used for failed queries). */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/60 px-6 py-10 text-center", className)} role="alert">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="mt-3 font-semibold text-slate-900">We couldn't load this</p>
      <p className="mt-1 max-w-md text-sm text-slate-600">{apiError(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx("space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card flex gap-4 p-4">
          <Skeleton className="h-20 w-20 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/** Re-renders every `ms` so countdowns stay live. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function formatLeft(msLeft: number) {
  if (msLeft <= 0) return "expired";
  const mins = Math.floor(msLeft / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(1, m)}m left`;
}

/** Inline countdown pill: amber normally, red in the last hour. */
export function Countdown({ to, label, className }: { to: string | Date; label?: string; className?: string }) {
  const now = useNow(15_000);
  const left = new Date(to).getTime() - now;
  const urgent = left < 3600_000;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
        left <= 0 ? "bg-slate-100 text-slate-600 ring-slate-200" : urgent ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-800 ring-amber-200",
        className,
      )}
      title={fmtDateTime(to)}
    >
      <Clock className="h-3 w-3" />
      {label ? `${label} · ` : ""}
      {formatLeft(left)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Downloads                                                           */
/* ------------------------------------------------------------------ */

/** Download an authenticated API resource as a file. */
export async function downloadFromApi(path: string, filename: string) {
  const r = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Hook that tracks which invoice is downloading and reports errors. */
export function useInvoiceDownload() {
  const [busy, setBusy] = useState<string | null>(null);
  const download = useCallback(async (inv: { id: string; number: string }) => {
    setBusy(inv.id);
    try {
      await downloadFromApi(`/invoices/${inv.id}/pdf`, `${inv.number.replace(/\//g, "-")}.pdf`);
    } catch (e) {
      toast.error(apiError(e, "Couldn't download the invoice"));
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, download };
}

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  RENTER_RECEIPT: "Rental receipt",
  OWNER_STATEMENT: "Owner statement",
  PLATFORM_FEE: "Platform fee invoice",
  PROMOTION: "Listing boost",
  SUBSCRIPTION: "Owner Pro",
};

/* ------------------------------------------------------------------ */
/* Photos                                                              */
/* ------------------------------------------------------------------ */

/** Thumbnail grid with a lightbox; shows capture time/location when present. */
export function PhotoGrid({ photos, className, size = "md" }: { photos: (ChecklistPhoto | string)[]; className?: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState<number | null>(null);
  const list = photos.map((p) => (typeof p === "string" ? { url: p } : p)) as ChecklistPhoto[];
  if (!list.length)
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <ImageOff className="h-3.5 w-3.5" /> No photos
      </p>
    );
  const cur = open != null ? list[open] : null;
  return (
    <>
      <div className={clsx("flex flex-wrap gap-2", className)}>
        {list.map((p, i) => (
          <button key={`${p.url}-${i}`} type="button" onClick={() => setOpen(i)} className={clsx("group relative overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200", size === "sm" ? "h-14 w-14" : "h-20 w-20")} aria-label={`Open photo ${i + 1}`}>
            <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
          </button>
        ))}
      </div>
      <Modal open={cur != null} onClose={() => setOpen(null)} title={`Photo ${(open ?? 0) + 1} of ${list.length}`} size="xl">
        {cur && (
          <div>
            <img src={cur.url} alt="" className="mx-auto max-h-[70vh] rounded-xl object-contain" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>{cur.takenAt ? `Taken ${fmtDateTime(cur.takenAt)}` : "Capture time not recorded"}</span>
              {cur.lat != null && cur.lng != null && (
                <a className="link inline-flex items-center gap-1" href={`https://www.google.com/maps?q=${cur.lat},${cur.lng}`} target="_blank" rel="noreferrer">
                  <MapPin className="h-3.5 w-3.5" /> {cur.lat.toFixed(4)}, {cur.lng.toFixed(4)}
                </a>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={open === 0} onClick={() => setOpen((o) => (o ?? 1) - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={open === list.length - 1} onClick={() => setOpen((o) => (o ?? 0) + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

/** Booking list row used by My rentals, Booking requests and Overview. */
export function BookingListCard({ b, actions }: { b: BookingSummary; actions?: ReactNode }) {
  const showExpiry = (b.status === "REQUESTED" || b.status === "ACCEPTED") && b.expiresAt;
  const amount = b.viewerRole === "OWNER" && b.ownerPayoutAmount != null ? b.ownerPayoutAmount : b.totalAmount;
  return (
    <Card padded={false} className="overflow-hidden transition hover:shadow-md">
      <Link to={`/dashboard/bookings/${b.id}`} className="flex gap-4 p-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-24 sm:w-24">
          {b.listing.image ? <img src={b.listing.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><ImageOff className="h-5 w-5" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={b.status} />
            {showExpiry && <Countdown to={b.expiresAt!} label={b.status === "REQUESTED" ? "Respond" : "Pay"} />}
            <span className="text-xs text-slate-400">#{b.code}</span>
          </div>
          <h3 className="mt-1.5 line-clamp-1 font-semibold text-slate-900">{b.listing.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{fmtRange(b.startAt, b.endAt)}</span>
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
              <Avatar name={b.counterparty.name} src={b.counterparty.avatarUrl} size={22} />
              <span className="truncate">
                {b.viewerRole === "OWNER" ? "Renter" : "Owner"}: {b.counterparty.name}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-bold text-slate-900">{money(amount)}</span>
              <span className="block text-[11px] text-slate-500">{b.viewerRole === "OWNER" ? "your payout" : "total paid"}</span>
            </span>
          </div>
        </div>
      </Link>
      {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">{actions}</div>}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: { url?: string; bookingId?: string; conversationId?: string; disputeId?: string } & Record<string, unknown>;
}

/** Runs `fn` whenever a realtime "notification" socket event arrives. */
export function useNotificationEvent(fn: (n: NotificationPayload) => void) {
  const [handler] = useState(() => ({ current: fn }));
  handler.current = fn;
  const stable = useCallback((n: NotificationPayload) => handler.current(n), [handler]);
  useSocketEvent<NotificationPayload>("notification", stable);
}
