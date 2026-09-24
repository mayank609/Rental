/**
 * Staff booking view: parties with contact details, full money breakdown
 * incl. platform revenue, payments/refunds/payouts, handover/return
 * checklists with photos, event timeline, disputes; admin cancellation.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtDateTime, fmtRange, money } from "@/lib/format";
import { Avatar, Button, PageLoader, VerifiedBadge } from "@/components/ui";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { ErrorPanel, KeyValue, PageHeader, Panel, StatusPill } from "@/components/admin/AdminUi";
import { ChecklistGrid } from "@/components/admin/ChecklistGrid";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { useAdminMutation } from "@/components/admin/hooks";
import type { AdminBookingDetail, CancelOutcome } from "@/components/admin/types";

const CANCELLABLE = ["REQUESTED", "ACCEPTED", "CONFIRMED"];

export default function AdminBookingDetailPage() {
  const { id = "" } = useParams();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [outcome, setOutcome] = useState<CancelOutcome | null>(null);
  const q = useQuery({ queryKey: ["admin", "bookings", id], queryFn: async () => (await api.get<{ booking: AdminBookingDetail }>(`/admin/bookings/${id}`)).data.booking });

  const cancel = useAdminMutation<string, { outcome: CancelOutcome }>({
    fn: async (reason) => (await api.post(`/admin/bookings/${id}/cancel`, { reason })).data,
    invalidate: [["admin", "bookings"], ["admin", "payments"], ["admin", "payouts"]],
    success: "Booking cancelled",
    onSuccess: (d) => {
      setCancelOpen(false);
      setOutcome(d.outcome);
    },
  });

  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorPanel message={apiError(q.error, "Booking not found")} onRetry={() => q.refetch()} />;
  const b = q.data;
  const p = b.pricing;
  const canCancel = CANCELLABLE.includes(b.status) && b.actions.includes("cancel");

  return (
    <div>
      <PageHeader
        back={{ to: "/admin/bookings", label: "Bookings" }}
        title={<span className="font-mono">{b.code}</span>}
        badge={<StatusPill status={b.status} kind="booking" />}
        subtitle={<><Link to={`/admin/listings?tab=all&q=${b.listing.id}`} className="link">{b.listing.title}</Link> · {b.listing.city}{b.listing.locality ? `, ${b.listing.locality}` : ""} · {fmtRange(b.startAt, b.endAt)}</>}
        actions={
          canCancel && (
            <Button variant="danger" size="sm" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>
              Cancel booking
            </Button>
          )
        }
      />

      {outcome && (
        <div className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
          <p className="font-semibold">Cancellation processed</p>
          <p className="mt-1">
            Refund to renter: <b>{money(outcome.refundAmount)}</b> ({outcome.refundPercent}% of rent) · Owner payout: <b>{money(outcome.ownerPayout)}</b> · Platform retained: <b>{money(outcome.platformRetained)}</b>
            {outcome.ownerPenalty > 0 && <> · Owner penalty: <b>{money(outcome.ownerPenalty)}</b></>}
          </p>
        </div>
      )}
      {b.cancellationReason && <p className="mb-4 rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-700">Cancellation reason: {b.cancellationReason}</p>}
      {b.declineReason && <p className="mb-4 rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-700">Decline reason: {b.declineReason}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {([["Renter", b.renter], ["Owner", b.owner]] as const).map(([label, u]) => (
              <Panel key={label} title={label}>
                <Link to={`/admin/users/${u.id}`} className="flex items-center gap-3 hover:opacity-80">
                  <Avatar name={u.name} src={u.avatarUrl} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{u.name}</p>
                    <VerifiedBadge user={u} />
                  </div>
                </Link>
                <div className="mt-3 space-y-0.5 text-sm text-slate-600">
                  <p>{u.email ?? "—"}</p>
                  <p>{u.phone ?? "—"}</p>
                </div>
              </Panel>
            ))}
          </div>

          <Panel title="Details">
            <KeyValue
              cols={3}
              items={[
                { label: "Fulfilment", value: b.fulfillment === "DELIVERY" ? "Delivery" : "Pickup" },
                { label: "Instant book", value: b.instantBook ? "Yes" : "No" },
                { label: "Protection", value: b.protectionPlan ? "Yes" : "No" },
                { label: "Policy", value: b.cancellationPolicy.toLowerCase() },
                { label: "Agreement", value: `v${b.agreement.version}` },
                { label: "Late days", value: b.lateDays || "—" },
                { label: "Pickup address", value: b.listing.pickupAddress ? `${b.listing.pickupAddress.line1}, ${b.listing.pickupAddress.locality}, ${b.listing.pickupAddress.city}` : "—" },
                { label: "Delivery address", value: b.deliveryAddress ? Object.values(b.deliveryAddress).filter(Boolean).join(", ") : "—", hidden: b.fulfillment !== "DELIVERY" },
                { label: "Message", value: b.message, hidden: !b.message },
              ]}
            />
          </Panel>

          <Panel title="Payments & refunds" padded={false}>
            {b.payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No payments.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {b.payments.map((pm) => (
                  <li key={pm.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold tabular-nums text-slate-900">{money(pm.amount)}</span>
                      <StatusPill status={pm.status} />
                      <span className="text-xs text-slate-500">{pm.method ?? ""} · {fmtDateTime(pm.createdAt)}</span>
                      <Link to={`/admin/payments?q=${pm.id}`} className="link ml-auto text-xs">Open in payments</Link>
                    </div>
                    {pm.refunds.map((r) => (
                      <div key={r.id} className="mt-1.5 flex flex-wrap items-center gap-2 pl-4 text-xs text-slate-600">
                        ↳ Refund <b className="tabular-nums">{money(r.amount)}</b> <StatusPill status={r.status} /> {r.reason} · {fmtDateTime(r.createdAt)}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Payouts" padded={false}>
            {!b.payouts?.length ? (
              <p className="px-5 py-6 text-sm text-slate-500">No payouts.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {b.payouts.map((po) => (
                  <li key={po.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                    <span className={`font-semibold tabular-nums ${po.amount < 0 ? "text-red-700" : "text-slate-900"}`}>{money(po.amount)}</span>
                    <StatusPill status={po.status} />
                    {po.note && <span className="text-xs text-slate-500">{po.note}</span>}
                    <span className="ml-auto text-xs text-slate-500">{po.paidAt ? `Paid ${fmtDateTime(po.paidAt)}` : po.scheduledFor ? `Scheduled ${fmtDateTime(po.scheduledFor)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Checklists">
            {b.checklists.length === 0 ? <p className="text-sm text-slate-500">No handover or return checklists yet.</p> : <ChecklistGrid checklists={b.checklists} />}
          </Panel>

          {b.disputes.length > 0 && (
            <Panel title="Disputes" padded={false}>
              <ul className="divide-y divide-slate-100">
                {b.disputes.map((d) => (
                  <li key={d.id}>
                    <Link to={`/admin/disputes/${d.id}`} className="block px-5 py-3 text-sm hover:bg-slate-50">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{d.type.replace(/_/g, " ").toLowerCase()}</span>
                        <StatusPill status={d.status} />
                        {d.claimAmount > 0 && <span className="text-xs text-slate-500">claim {money(d.claimAmount)}</span>}
                        <span className="ml-auto text-xs text-slate-500">{fmtDateTime(d.createdAt)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-slate-600">{d.description}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Renter charges">
            <PriceBreakdown b={{ ...p, rentLines: p.rentLines }} compact />
          </Panel>
          <Panel title="Platform & owner split">
            <dl className="space-y-1.5 text-sm">
              <Row label="Owner commission" value={money(p.ownerCommission)} />
              <Row label="GST on commission" value={money(p.ownerCommissionTax)} />
              <Row label="Owner payout" value={money(p.ownerPayoutAmount)} strong />
              <Row label="Platform revenue (ex-GST)" value={money(p.platformRevenue)} strong />
              {b.lateFeeAmount > 0 && <Row label="Late fee" value={money(b.lateFeeAmount)} />}
              {b.depositDeduction > 0 && <Row label="Deposit deduction" value={money(b.depositDeduction)} />}
              {b.refundAmount > 0 && <Row label="Refunded to renter" value={money(b.refundAmount)} />}
              {(b.ownerPenaltyAmount ?? 0) > 0 && <Row label="Owner penalty" value={money(b.ownerPenaltyAmount)} />}
            </dl>
          </Panel>
          <Panel title="Timeline">
            {b.events.length === 0 && <p className="text-sm text-slate-500">No events recorded.</p>}
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {b.events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />
                  <p className="font-medium text-slate-800">
                    {e.type}
                    {e.toStatus && <span className="ml-1.5 text-xs font-normal text-slate-500">→ {e.toStatus.toLowerCase()}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtDateTime(e.createdAt)} · {e.actor?.name ?? "System"}
                  </p>
                  {e.data != null && typeof e.data === "object" && Object.keys(e.data).length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">Data</summary>
                      <JsonViewer value={e.data} className="mt-1" />
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Timestamps">
            <dl className="space-y-1 text-xs">
              {Object.entries(b.timestamps)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-slate-500">{k.replace(/At$/, "").replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                    <dd className="tabular-nums text-slate-800">{fmtDateTime(v!)}</dd>
                  </div>
                ))}
            </dl>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${b.code}`}
        description={
          <>
            An admin cancellation refunds the renter <b>in full</b> ({money(p.totalAmount)} if paid) with no owner penalty. Both parties are notified. This can't be undone.
          </>
        }
        confirmLabel="Cancel booking"
        reason
        reasonRequired
        reasonPlaceholder="e.g. Listing found to be a prohibited item"
        loading={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold text-slate-900" : "text-slate-600"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
