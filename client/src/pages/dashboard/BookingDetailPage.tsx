/**
 * Booking detail — the hub for a single rental, for both renter and owner.
 * Buttons are driven strictly by the server's `booking.actions`; contact
 * details and the exact pickup address only render when the API returns
 * them (i.e. once the booking is paid/confirmed).
 */
import { useCallback, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import {
  AlertTriangle, ArrowRight, Ban, CalendarClock, Camera, Check, CheckCircle2, ClipboardCheck, Clock, CreditCard, Download, ExternalLink,
  FileText, Gavel, Hourglass, Mail, MapPin, MessageCircle, Navigation, PackageCheck, Phone, RotateCcw, ShieldCheck, Star, Truck, Wallet, XCircle,
} from "lucide-react";
import { api, apiError } from "@/lib/api";
import { CONDITION_LABEL, STATUS_LABEL, fmtDate, fmtDateTime, fromNow, listingPath, money } from "@/lib/format";
import { startCheckout } from "@/lib/payments";
import type { BookingAction, BookingDetail, Checklist } from "@/lib/types";
import { usePlatformConfig } from "@/hooks/useConfig";
import { Seo } from "@/components/Seo";
import { StatusBadge } from "@/components/StatusBadge";
import { PriceBreakdown, type BreakdownLike } from "@/components/PriceBreakdown";
import { Alert, Avatar, Badge, Button, ButtonLink, Card, Rating, Skeleton, VerifiedBadge, type Tone } from "@/components/ui";
import { Countdown, ErrorState, PageHeader, PhotoGrid, useInvoiceDownload, useNotificationEvent, INVOICE_TYPE_LABEL } from "@/components/dashboard/common";
import { CancelModal, ChecklistModal, DeclineModal, DisputeModal, InspectModal, ReviewModal, useApplyBooking, DISPUTE_TYPE_LABEL } from "@/components/dashboard/BookingActionModals";
import type { DisputeType } from "@/components/dashboard/types";

type ModalKind = "decline" | "cancel" | "handover" | "return" | "inspect" | "review" | "dispute" | null;

/* ------------------------------------------------------------------ */
/* Status guidance                                                     */
/* ------------------------------------------------------------------ */

interface Guidance {
  title: string;
  body: ReactNode;
  tone: Tone;
  icon: ReactNode;
  deadline?: { at: string; label: string };
}

function guidanceFor(b: BookingDetail): Guidance {
  const owner = b.viewerRole === "OWNER";
  const other = owner ? b.renter.name : b.owner.name;
  switch (b.status) {
    case "REQUESTED":
      return owner
        ? { title: "New booking request", body: `${other} wants to rent your item. Accept to lock the dates — they'll then have a short window to pay. Unanswered requests expire automatically.`, tone: "amber", icon: <Hourglass />, deadline: b.expiresAt ? { at: b.expiresAt, label: "Respond within" } : undefined }
        : { title: "Waiting for the owner", body: `We've sent your request to ${other}. You won't be charged until they accept and you complete payment.`, tone: "amber", icon: <Hourglass />, deadline: b.expiresAt ? { at: b.expiresAt, label: "Owner must respond" } : undefined };
    case "ACCEPTED":
      return owner
        ? { title: "Accepted — awaiting payment", body: `The dates are held for ${other} while they pay. You'll be notified as soon as the booking is confirmed.`, tone: "blue", icon: <CreditCard />, deadline: b.expiresAt ? { at: b.expiresAt, label: "Payment window" } : undefined }
        : { title: "Accepted! Complete payment to confirm", body: "Your dates are held for a limited time. Pay securely now — the deposit is refunded after return and inspection.", tone: "blue", icon: <CreditCard />, deadline: b.expiresAt ? { at: b.expiresAt, label: "Pay within" } : undefined };
    case "CONFIRMED":
      return owner
        ? { title: "Confirmed and paid", body: `Contact details and the pickup address are now shared. At handover, complete the checklist with photos together with ${other}.`, tone: "green", icon: <CheckCircle2 />, deadline: { at: b.startAt, label: "Starts" } }
        : { title: "You're all set!", body: `Pickup details and ${other}'s contact are below. At pickup, inspect the item and complete the handover checklist with photos — it protects your deposit.`, tone: "green", icon: <CheckCircle2 />, deadline: { at: b.startAt, label: "Starts" } };
    case "ACTIVE":
      return owner
        ? { title: "Rental in progress", body: `${other} has the item. When it comes back, complete the return checklist with photos.`, tone: "violet", icon: <PackageCheck />, deadline: { at: b.endAt, label: "Return due" } }
        : { title: "Enjoy your rental", body: "Please return the item on time and in the same condition. Complete the return checklist with photos when you hand it back.", tone: "violet", icon: <PackageCheck />, deadline: { at: b.endAt, label: "Return due" } };
    case "OVERDUE":
      return owner
        ? { title: "Return is overdue", body: `The rental period has ended. Late fees are accruing and can be deducted from the deposit. Contact ${other}, or open a dispute if the item isn't returned.`, tone: "red", icon: <AlertTriangle /> }
        : { title: "Your return is overdue", body: "Late fees are being charged per extra day and will be deducted from your deposit. Return the item as soon as possible and complete the return checklist.", tone: "red", icon: <AlertTriangle /> };
    case "RETURNED":
      return owner
        ? { title: "Item returned — inspect it", body: "Check the item against the handover photos. Release the deposit if everything's fine, or report damage within the inspection window.", tone: "blue", icon: <ClipboardCheck />, deadline: b.timestamps.inspectionDeadline ? { at: b.timestamps.inspectionDeadline, label: "Inspection window" } : undefined }
        : { title: "Returned — inspection in progress", body: `${other} is inspecting the item. Your deposit is released automatically if no issue is reported in time.`, tone: "blue", icon: <ClipboardCheck />, deadline: b.timestamps.inspectionDeadline ? { at: b.timestamps.inspectionDeadline, label: "Deposit released in" } : undefined };
    case "COMPLETED":
      return { title: "Rental completed", body: owner ? "Your payout is scheduled per the payout timeline. Leave a review for the renter to help the community." : "Your deposit has been processed. Leave a review to help others rent with confidence.", tone: "green", icon: <Star /> };
    case "DISPUTED":
      return { title: "Under dispute", body: "Our team is reviewing the evidence from both sides. Deposit and payouts are on hold until it's resolved — add any extra evidence on the dispute page.", tone: "red", icon: <Gavel /> };
    case "DECLINED":
      return { title: "Request declined", body: owner ? "You declined this request." : `${other} couldn't accept this request. You weren't charged — try similar items nearby.`, tone: "gray", icon: <XCircle /> };
    case "EXPIRED":
      return { title: "Request expired", body: owner ? "This request expired before it was accepted or paid." : "This booking expired before it was accepted or paid. You weren't charged.", tone: "gray", icon: <Clock /> };
    case "CANCELLED":
      return { title: "Booking cancelled", body: b.refundAmount > 0 && !owner ? `A refund of ${money(b.refundAmount)} has been issued to your original payment method.` : "This booking was cancelled.", tone: "gray", icon: <Ban /> };
    default:
      return { title: STATUS_LABEL[b.status] ?? b.status, body: "", tone: "gray", icon: <Clock /> };
  }
}

const heroTone: Record<Tone, string> = {
  amber: "from-amber-50 to-white ring-amber-200 [&_.hero-icon]:bg-amber-100 [&_.hero-icon]:text-amber-700",
  blue: "from-sky-50 to-white ring-sky-200 [&_.hero-icon]:bg-sky-100 [&_.hero-icon]:text-sky-700",
  green: "from-emerald-50 to-white ring-emerald-200 [&_.hero-icon]:bg-emerald-100 [&_.hero-icon]:text-emerald-700",
  violet: "from-violet-50 to-white ring-violet-200 [&_.hero-icon]:bg-violet-100 [&_.hero-icon]:text-violet-700",
  red: "from-red-50 to-white ring-red-200 [&_.hero-icon]:bg-red-100 [&_.hero-icon]:text-red-700",
  gray: "from-slate-100 to-white ring-slate-200 [&_.hero-icon]:bg-slate-200 [&_.hero-icon]:text-slate-600",
  brand: "from-brand-50 to-white ring-brand-200 [&_.hero-icon]:bg-brand-100 [&_.hero-icon]:text-brand-700",
};

/* ------------------------------------------------------------------ */
/* Timeline labels                                                     */
/* ------------------------------------------------------------------ */

const EVENT_LABEL: Record<string, string> = {
  "booking.requested": "Booking requested",
  "booking.instant_booked": "Instantly booked",
  "booking.accepted": "Request accepted",
  "booking.declined": "Request declined",
  "booking.auto_declined": "Automatically declined (dates taken)",
  "booking.expired": "Expired",
  "booking.confirmed": "Payment received — booking confirmed",
  "booking.cancelled": "Booking cancelled",
  "booking.auto_cancelled": "Automatically cancelled",
  "booking.handed_over": "Item handed over",
  "booking.overdue": "Return overdue",
  "booking.returned": "Item returned",
  "booking.completed": "Rental completed",
  "checklist.handover": "Handover checklist submitted",
  "checklist.return": "Return checklist submitted",
  "dispute.opened": "Dispute opened",
  "dispute.resolve": "Dispute resolved",
  "dispute.resolved": "Dispute resolved",
};
const eventLabel = (e: BookingDetail["events"][number]) =>
  EVENT_LABEL[e.type] ?? (e.toStatus ? `Status → ${STATUS_LABEL[e.toStatus] ?? e.toStatus}` : e.type.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase()));

/** Map booking pricing to the PriceBreakdown component's shape. */
const toBreakdown = (p: BookingDetail["pricing"]): BreakdownLike => ({
  rentLines: p.rentLines,
  rentAmount: p.rentAmount,
  serviceFee: p.serviceFee,
  protectionFee: p.protectionFee,
  deliveryFee: p.deliveryFee,
  taxAmount: p.taxAmount,
  depositAmount: p.depositAmount,
  totalAmount: p.totalAmount,
});

const PAYMENT_TONE: Record<string, Tone> = { CAPTURED: "green", PAID: "green", SUCCEEDED: "green", REFUNDED: "gray", PARTIALLY_REFUNDED: "amber", FAILED: "red", CREATED: "amber", PENDING: "amber", PROCESSED: "green", PROCESSING: "amber", SCHEDULED: "blue", ON_HOLD: "red", CANCELLED: "gray" };
const humanize = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function BookingDetailPage() {
  const { id = "" } = useParams();
  const [modal, setModal] = useState<ModalKind>(null);
  const apply = useApplyBooking();
  const { data: config } = usePlatformConfig();

  const q = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => (await api.get<{ booking: BookingDetail }>(`/bookings/${id}`)).data.booking,
    enabled: Boolean(id),
  });
  const b = q.data;

  // Refetch when a realtime notification concerns this booking.
  const { refetch } = q;
  useNotificationEvent(
    useCallback(
      (n) => {
        if (n.data?.bookingId === id || (typeof n.data?.url === "string" && n.data.url.includes(id))) refetch();
      },
      [id, refetch],
    ),
  );

  const accept = useMutation({
    mutationFn: async () => (await api.post<{ booking: BookingDetail }>(`/bookings/${id}/accept`)).data.booking,
    onSuccess: (bk) => {
      apply(bk, id);
      toast.success("Accepted! The renter has been asked to pay.");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const pay = useMutation({
    mutationFn: async () => {
      const r = await api.post(`/bookings/${id}/pay`, { idempotencyKey: `booking-${id}-${b?.pricing.totalAmount ?? 0}` });
      return startCheckout(r.data.checkout, `Booking ${b?.code ?? ""} · ${b?.listing.title ?? ""}`);
    },
    onSuccess: async (res) => {
      if (res.status === "success") {
        toast.success(res.message ?? "Payment successful — booking confirmed!");
        const fresh = await refetch();
        // Webhook confirmation can lag a few seconds; poll once more.
        if (fresh.data?.status === "ACCEPTED") setTimeout(() => refetch(), 3000);
        apply(undefined, id);
      } else if (res.status === "cancelled") toast("Payment cancelled. Your dates stay held until the payment window closes.");
      else toast.error(res.message ?? "Payment failed. Please try again.");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  if (q.isLoading) return <DetailSkeleton />;
  if (q.isError || !b) return <ErrorState error={q.error} onRetry={() => refetch()} />;

  const owner = b.viewerRole === "OWNER";
  const other = owner ? b.renter : b.owner;
  const g = guidanceFor(b);
  const has = (a: BookingAction) => b.actions.includes(a);
  const openDispute = b.disputes.find((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");
  const myReview = b.reviews.find((r) => r.authorId !== other.id);
  const theirReview = b.reviews.find((r) => r.authorId === other.id);
  const back = owner ? { to: "/dashboard/bookings", label: "Booking requests" } : { to: "/dashboard/rentals", label: "My rentals" };

  /** Primary action buttons, in priority order. */
  const actionButtons = (
    <>
      {has("pay") && (
        <Button size="lg" loading={pay.isPending} onClick={() => pay.mutate()} icon={<CreditCard className="h-4 w-4" />}>
          Pay {money(b.pricing.totalAmount)}
        </Button>
      )}
      {has("accept") && (
        <Button size="lg" loading={accept.isPending} onClick={() => accept.mutate()} icon={<Check className="h-4 w-4" />}>
          Accept request
        </Button>
      )}
      {has("decline") && (
        <Button size="lg" variant="outline" onClick={() => setModal("decline")} icon={<XCircle className="h-4 w-4" />}>
          Decline
        </Button>
      )}
      {has("handover") && (
        <Button size="lg" onClick={() => setModal("handover")} icon={<Camera className="h-4 w-4" />}>
          Handover checklist
        </Button>
      )}
      {has("return") && (
        <Button size="lg" onClick={() => setModal("return")} icon={<RotateCcw className="h-4 w-4" />}>
          Return checklist
        </Button>
      )}
      {has("inspect") && (
        <Button size="lg" onClick={() => setModal("inspect")} icon={<ClipboardCheck className="h-4 w-4" />}>
          Inspect & release deposit
        </Button>
      )}
      {has("review") && (
        <Button size="lg" onClick={() => setModal("review")} icon={<Star className="h-4 w-4" />}>
          Leave a review
        </Button>
      )}
      {b.conversationId && (
        <ButtonLink size="lg" variant="outline" to={`/dashboard/messages/${b.conversationId}`} icon={<MessageCircle className="h-4 w-4" />}>
          Message
        </ButtonLink>
      )}
    </>
  );

  return (
    <div>
      <Seo title={`Booking ${b.code}`} noindex />
      <PageHeader
        back={back}
        title={<span className="line-clamp-2">{b.listing.title}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={b.status} />
            <span>Booking #{b.code}</span>
            <span className="text-slate-300">•</span>
            <span>You're the {owner ? "owner" : "renter"}</span>
            {b.instantBook && <Badge tone="brand">Instant book</Badge>}
          </span>
        }
      />

      {/* Status hero */}
      <section className={clsx("rounded-3xl bg-gradient-to-br p-5 ring-1 ring-inset sm:p-6", heroTone[g.tone])} aria-live="polite">
        <div className="flex gap-4">
          <div className="hero-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl [&_svg]:h-6 [&_svg]:w-6">{g.icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{g.title}</h2>
              {g.deadline && new Date(g.deadline.at).getTime() > Date.now() && <Countdown to={g.deadline.at} label={g.deadline.label} />}
            </div>
            {g.body && <p className="mt-1 text-sm leading-relaxed text-slate-700">{g.body}</p>}
            {b.status === "DECLINED" && b.declineReason && <p className="mt-2 text-sm text-slate-600">Reason: “{b.declineReason}”</p>}
            {b.status === "CANCELLED" && b.cancellationReason && <p className="mt-2 text-sm text-slate-600">Reason: “{b.cancellationReason}”</p>}
            {b.status === "DECLINED" && !owner && (
              <Link to={`/listing/${b.listing.id}/${b.listing.slug}`} className="link mt-2 inline-flex items-center gap-1 text-sm">
                View listing & similar items <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {openDispute && (
              <Link to={`/dashboard/disputes/${openDispute.id}`} className="link mt-2 inline-flex items-center gap-1 text-sm">
                Go to dispute <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actionButtons}</div>
        {(has("cancel") || has("dispute")) && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {has("cancel") && (
              <button onClick={() => setModal("cancel")} className="font-medium text-slate-600 underline-offset-2 hover:text-red-600 hover:underline">
                Cancel booking
              </button>
            )}
            {has("dispute") && (
              <button onClick={() => setModal("dispute")} className="font-medium text-slate-600 underline-offset-2 hover:text-red-600 hover:underline">
                Report a problem
              </button>
            )}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Dates & fulfilment */}
          <Card>
            <h3 className="font-semibold text-slate-900">Rental period</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <DateBlock label={owner ? "Handover" : "Pickup"} value={b.startAt} />
              <DateBlock label="Return" value={b.endAt} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-slate-400" /> {b.pricing.units} {b.pricing.unit}
                {b.pricing.units === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                {b.fulfillment === "DELIVERY" ? <Truck className="h-4 w-4 text-slate-400" /> : <MapPin className="h-4 w-4 text-slate-400" />}
                {b.fulfillment === "DELIVERY" ? "Delivery by owner" : "Self pickup"}
              </span>
              {b.protectionPlan && (
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <ShieldCheck className="h-4 w-4" /> Damage protection
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-slate-400" /> {humanize(b.cancellationPolicy)} cancellation
              </span>
            </div>
            {b.message && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Message from {b.renter.name}</p>
                <p className="mt-1 whitespace-pre-line">{b.message}</p>
              </div>
            )}
          </Card>

          {/* Location */}
          <LocationCard b={b} />

          {/* Late fee / deposit info */}
          {(b.lateDays > 0 || b.lateFeeAmount > 0 || b.depositDeduction > 0 || (b.ownerPenaltyAmount ?? 0) > 0) && (
            <Card>
              <h3 className="font-semibold text-slate-900">Charges & deductions</h3>
              <dl className="mt-3 space-y-2 text-sm">
                {b.lateDays > 0 && <Row label={`Late return (${b.lateDays} day${b.lateDays > 1 ? "s" : ""})`} value={money(b.lateFeeAmount)} />}
                {b.depositDeduction > 0 && <Row label="Deducted from deposit" value={money(b.depositDeduction)} />}
                {b.depositDeduction > 0 && <Row label="Deposit refunded" value={money(Math.max(0, b.pricing.depositAmount - b.depositDeduction))} />}
                {(b.ownerPenaltyAmount ?? 0) > 0 && <Row label="Owner cancellation penalty" value={money(b.ownerPenaltyAmount)} />}
              </dl>
              {config && b.lateDays > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  Late fees are charged at {config.fees.lateFee.multiplier}× the daily rate per extra day after a {config.fees.lateFee.graceHours}h grace period.
                </p>
              )}
            </Card>
          )}

          {/* Checklists */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Handover & return checklists</h3>
              <Camera className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-1 text-xs text-slate-500">Timestamped photos from both sides — the main evidence if anything goes wrong.</p>
            {b.checklists.length ? (
              <div className="mt-4 space-y-4">
                {b.checklists.map((c) => (
                  <ChecklistView key={c.id} c={c} b={b} />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                {["CONFIRMED"].includes(b.status) ? "The handover checklist opens 24 hours before the start time." : "No checklists yet."}
              </p>
            )}
          </Card>

          {/* Reviews */}
          {(myReview || theirReview) && (
            <Card>
              <h3 className="font-semibold text-slate-900">Reviews</h3>
              <div className="mt-3 space-y-3">
                {[myReview && { r: myReview, who: "Your review" }, theirReview && { r: theirReview, who: `${other.name}'s review` }].filter(Boolean).map((x) => {
                  const { r, who } = x as { r: BookingDetail["reviews"][number]; who: string };
                  return (
                    <div key={r.id} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{who}</span>
                        <span className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={clsx("h-4 w-4", i < r.rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />)}</span>
                      </div>
                      {r.comment && <p className="mt-1 text-sm text-slate-700">{r.comment}</p>}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Disputes */}
          {b.disputes.length > 0 && (
            <Card>
              <h3 className="font-semibold text-slate-900">Disputes</h3>
              <ul className="mt-3 divide-y divide-slate-100">
                {b.disputes.map((d) => (
                  <li key={d.id}>
                    <Link to={`/dashboard/disputes/${d.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{DISPUTE_TYPE_LABEL[d.type as DisputeType] ?? d.type}</span>
                        <span className="block truncate text-xs text-slate-500">{d.description}</span>
                      </span>
                      <Badge tone={d.status === "RESOLVED" ? "green" : d.status === "REJECTED" ? "gray" : "red"}>{humanize(d.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <h3 className="font-semibold text-slate-900">Timeline</h3>
            <ol className="relative mt-4 space-y-4 border-l border-slate-200 pl-5">
              {b.events.map((e, i) => (
                <li key={e.id} className="relative">
                  <span className={clsx("absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white", i === b.events.length - 1 ? "bg-brand-600" : "bg-slate-300")} />
                  <p className="text-sm font-medium text-slate-900">{eventLabel(e)}</p>
                  <p className="text-xs text-slate-500">
                    {fmtDateTime(e.createdAt)}
                    {e.actor ? ` · by ${e.actor.name}` : " · automatic"}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Side column */}
        <aside className="space-y-6">
          {/* Listing */}
          <Card padded={false} className="overflow-hidden">
            <Link to={listingPath(b.listing)} className="flex gap-3 p-4 hover:bg-slate-50">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">{b.listing.image && <img src={b.listing.image} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold text-slate-900">{b.listing.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{[b.listing.locality, b.listing.city].filter(Boolean).join(", ")}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                  View listing <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </Link>
            {b.listing.rules && (
              <div className="border-t border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">House rules</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{b.listing.rules}</p>
              </div>
            )}
          </Card>

          {/* Counterparty */}
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{owner ? "Renter" : "Owner"}</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={other.name} src={other.avatarUrl} size={48} />
              <div className="min-w-0">
                <Link to={`/users/${other.id}`} className="block truncate font-semibold text-slate-900 hover:text-brand-700">{other.name}</Link>
                <div className="flex flex-wrap items-center gap-2">
                  <Rating avg={owner ? other.renterRating.avg : other.ownerRating.avg} count={owner ? other.renterRating.count : other.ownerRating.count} />
                  <VerifiedBadge user={other} />
                </div>
              </div>
            </div>
            {other.phone || other.email ? (
              <div className="mt-4 space-y-2">
                {other.phone && (
                  <a href={`tel:${other.phone}`} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
                    <Phone className="h-4 w-4 text-brand-600" /> {other.phone}
                  </a>
                )}
                {other.email && (
                  <a href={`mailto:${other.email}`} className="flex items-center gap-2 truncate rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
                    <Mail className="h-4 w-4 shrink-0 text-brand-600" /> <span className="truncate">{other.email}</span>
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                Phone and email are shared once the booking is confirmed. Until then, use in-app messages — payments made outside {config?.platformName ?? "the platform"} aren't protected.
              </p>
            )}
            {b.conversationId && (
              <ButtonLink to={`/dashboard/messages/${b.conversationId}`} variant="secondary" block className="mt-3" icon={<MessageCircle className="h-4 w-4" />}>
                Send a message
              </ButtonLink>
            )}
          </Card>

          {/* Price */}
          <Card>
            <h3 className="mb-4 font-semibold text-slate-900">{owner ? "Renter paid" : "Price details"}</h3>
            <PriceBreakdown b={toBreakdown(b.pricing)} compact />
            {owner && b.pricing.ownerPayoutAmount != null && (
              <div className="mt-5 rounded-2xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-200">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                  <Wallet className="h-4 w-4" /> Your earnings
                </p>
                <dl className="mt-2 space-y-1.5 text-sm text-emerald-900">
                  <Row label="Rent" value={money(b.pricing.rentAmount)} />
                  <Row label="Platform commission" value={`− ${money(b.pricing.ownerCommission ?? 0)}`} />
                  <Row label="GST on commission" value={`− ${money(b.pricing.ownerCommissionTax ?? 0)}`} />
                  {b.pricing.deliveryFee > 0 && <p className="text-xs text-emerald-700">Delivery fee of {money(b.pricing.deliveryFee)} is included in your payout where applicable.</p>}
                  <div className="border-t border-emerald-200 pt-1.5">
                    <Row label={<b>Payout</b>} value={<b>{money(b.pricing.ownerPayoutAmount)}</b>} />
                  </div>
                </dl>
                <p className="mt-2 text-xs text-emerald-700">The security deposit is held by the platform and returned to the renter after inspection.</p>
              </div>
            )}
          </Card>

          {/* Payments / refunds / payouts */}
          {(b.payments.length > 0 || (b.payouts?.length ?? 0) > 0) && (
            <Card>
              <h3 className="font-semibold text-slate-900">{owner ? "Payouts" : "Payments & refunds"}</h3>
              <ul className="mt-3 space-y-3 text-sm">
                {b.payments.map((p) => (
                  <li key={p.id} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">Payment{p.method ? ` · ${p.method.toUpperCase()}` : ""}</span>
                      <span className="font-semibold">{money(p.amount)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                      <span>{fmtDateTime(p.createdAt)}</span>
                      <Badge tone={PAYMENT_TONE[p.status] ?? "gray"}>{humanize(p.status)}</Badge>
                    </div>
                    {p.refunds.map((r) => (
                      <div key={r.id} className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-xs">
                        <span className="text-slate-600">
                          Refund · {r.reason ? humanize(r.reason) : ""} · {fmtDate(r.createdAt)}
                        </span>
                        <span className="flex items-center gap-2">
                          <b>{money(r.amount)}</b>
                          <Badge tone={PAYMENT_TONE[r.status] ?? "gray"}>{humanize(r.status)}</Badge>
                        </span>
                      </div>
                    ))}
                  </li>
                ))}
                {b.payouts?.map((p) => (
                  <li key={p.id} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">Payout</span>
                      <span className="font-semibold">{money(p.amount)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                      <span>{p.paidAt ? `Paid ${fmtDate(p.paidAt)}` : p.scheduledFor ? `Scheduled for ${fmtDate(p.scheduledFor)}` : "Released after the rental completes"}</span>
                      <Badge tone={PAYMENT_TONE[p.status] ?? "gray"}>{humanize(p.status)}</Badge>
                    </div>
                    {p.note && <p className="mt-1 text-xs text-slate-500">{p.note}</p>}
                  </li>
                ))}
              </ul>
              {owner && (
                <Link to="/dashboard/earnings" className="link mt-3 inline-block text-sm">
                  Earnings & payout settings
                </Link>
              )}
            </Card>
          )}

          {/* Invoices */}
          {has("invoice") && <InvoicesCard invoices={b.invoices} />}

          <p className="px-1 text-xs text-slate-500">
            Rental agreement v{b.agreement.version} accepted {fmtDateTime(b.agreement.acceptedAt)}.{" "}
            <Link to="/rental-agreement" className="link">Read agreement</Link>
          </p>
        </aside>
      </div>

      {/* Modals */}
      <DeclineModal booking={b} open={modal === "decline"} onClose={() => setModal(null)} />
      <CancelModal booking={b} open={modal === "cancel"} onClose={() => setModal(null)} />
      <ChecklistModal booking={b} type="HANDOVER" open={modal === "handover"} onClose={() => setModal(null)} />
      <ChecklistModal booking={b} type="RETURN" open={modal === "return"} onClose={() => setModal(null)} />
      <InspectModal booking={b} open={modal === "inspect"} onClose={() => setModal(null)} />
      <ReviewModal booking={b} open={modal === "review"} onClose={() => setModal(null)} />
      <DisputeModal booking={b} open={modal === "dispute"} onClose={() => setModal(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function DateBlock({ label, value }: { label: string; value: string }) {
  const d = new Date(value);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <span className="text-[11px] font-semibold uppercase">{d.toLocaleString("en-IN", { month: "short" })}</span>
        <span className="text-xl font-bold leading-none">{d.getDate()}</span>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="font-semibold text-slate-900">{d.toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>
        <p className="text-xs text-slate-500">{fromNow(value)}</p>
      </div>
    </div>
  );
}

function LocationCard({ b }: { b: BookingDetail }) {
  const addr = b.listing.pickupAddress;
  const delivery = b.fulfillment === "DELIVERY" ? b.deliveryAddress : null;
  return (
    <Card>
      <h3 className="font-semibold text-slate-900">{delivery ? "Delivery address" : "Pickup location"}</h3>
      {delivery ? (
        <p className="mt-2 text-sm text-slate-700">{[delivery.line1, delivery.line2, delivery.locality, delivery.city, delivery.pincode].filter(Boolean).join(", ")}</p>
      ) : addr ? (
        <>
          <p className="mt-2 text-sm text-slate-700">{[addr.line1, addr.line2, addr.locality, addr.city, addr.pincode].filter(Boolean).join(", ")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700" href={`https://www.google.com/maps/dir/?api=1&destination=${addr.lat},${addr.lng}`} target="_blank" rel="noreferrer">
              <Navigation className="h-4 w-4" /> Open in Google Maps
            </a>
          </div>
        </>
      ) : (
        <div className="mt-2 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>
            Around <b>{[b.listing.locality, b.listing.city].filter(Boolean).join(", ")}</b>. The exact address is shared after the booking is confirmed.
          </p>
        </div>
      )}
    </Card>
  );
}

function ChecklistView({ c, b }: { c: Checklist; b: BookingDetail }) {
  const by = c.role === "OWNER" ? b.owner.name : b.renter.name;
  const mine = c.role === b.viewerRole;
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-900">
          {c.type === "HANDOVER" ? "Handover" : "Return"} · {mine ? "You" : by}
        </p>
        <span className="text-xs text-slate-500">{fmtDateTime(c.createdAt)}</span>
      </div>
      {c.condition && <p className="mt-1 text-sm text-slate-600">Condition: <b>{CONDITION_LABEL[c.condition] ?? c.condition}</b></p>}
      {c.items.length > 0 && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {c.items.map((it, i) => (
            <li key={i} className="flex items-center gap-1.5 text-sm">
              {it.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              <span className={it.ok ? "text-slate-700" : "font-medium text-red-700"}>{it.label}</span>
            </li>
          ))}
        </ul>
      )}
      {c.notes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{c.notes}</p>}
      <PhotoGrid photos={c.photos} className="mt-3" />
    </div>
  );
}

function InvoicesCard({ invoices }: { invoices: BookingDetail["invoices"] }) {
  const { busy, download } = useInvoiceDownload();
  return (
    <Card>
      <h3 className="font-semibold text-slate-900">Invoices</h3>
      {invoices.length ? (
        <ul className="mt-3 divide-y divide-slate-100">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{INVOICE_TYPE_LABEL[inv.type] ?? humanize(inv.type)}</span>
                <span className="block text-xs text-slate-500">
                  {inv.number} · {money(inv.amount)}
                </span>
              </span>
              <Button size="sm" variant="outline" loading={busy === inv.id} onClick={() => download(inv)} icon={<Download className="h-4 w-4" />} aria-label={`Download ${inv.number}`}>
                PDF
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Alert tone="gray" className="mt-3">Invoices are generated shortly after payment. Check back in a few minutes.</Alert>
      )}
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-8 w-2/3" />
      <Skeleton className="mt-6 h-40 w-full rounded-3xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
