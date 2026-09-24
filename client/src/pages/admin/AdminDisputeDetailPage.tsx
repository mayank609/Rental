/**
 * Dispute workbench: parties, booking amounts, claim, side-by-side evidence
 * (uploaded evidence + handover/return checklist photos), staff notes,
 * "mark under review" and the resolution form with a live money preview.
 *
 * Resolution semantics (server disputes.service):
 * - depositDeduction → paid to the owner from the renter's deposit
 * - refundAmount     → refunded to the renter from the rent (owner payout
 *                      is reduced proportionally)
 * - REJECTED         → no deduction, no refund; booking completes normally
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Eye, FileText, MessageSquarePlus, Scale } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtDateTime, money, toPaise } from "@/lib/format";
import type { Checklist, ChecklistPhoto } from "@/lib/types";
import { Badge, Button, Input, PageLoader, Textarea } from "@/components/ui";
import { ErrorPanel, KeyValue, Mono, PageHeader, Panel, StatusPill, Thumb } from "@/components/admin/AdminUi";
import { ChecklistGrid } from "@/components/admin/ChecklistGrid";
import { SlaIndicator } from "@/components/admin/SlaIndicator";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useAdminMutation } from "@/components/admin/hooks";
import type { DisputeDetail, EvidenceRow } from "@/components/admin/types";

/** Checklist JSON columns arrive untyped from this endpoint — normalise them. */
function normaliseChecklists(raw: DisputeDetail["booking"]["checklists"]): Checklist[] {
  return raw.map((c) => ({
    ...c,
    items: Array.isArray(c.items) ? (c.items as Checklist["items"]) : [],
    photos: Array.isArray(c.photos) ? (c.photos as unknown[]).map((p) => (typeof p === "string" ? { url: p } : (p as ChecklistPhoto))).filter((p) => p?.url) : [],
  }));
}

export default function AdminDisputeDetailPage() {
  const { id = "" } = useParams();
  const [note, setNote] = useState("");
  const q = useQuery({ queryKey: ["admin", "disputes", id], queryFn: async () => (await api.get<{ dispute: DisputeDetail }>(`/disputes/${id}`)).data.dispute });

  const review = useAdminMutation({
    fn: () => api.post(`/admin/disputes/${id}/review`),
    invalidate: [["admin", "disputes"]],
    success: "Marked as under review — both parties notified",
  });
  const addNote = useAdminMutation<string>({
    fn: (n) => api.post(`/disputes/${id}/evidence`, { note: n }),
    invalidate: [["admin", "disputes", id]],
    success: "Note added",
    onSuccess: () => setNote(""),
  });

  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorPanel message={apiError(q.error, "Dispute not found")} onRetry={() => q.refetch()} />;
  const d = q.data;
  const b = d.booking;
  const open = d.status === "OPEN" || d.status === "UNDER_REVIEW";
  const checklists = normaliseChecklists(b.checklists);
  const sideOf = (uid: string) => (uid === b.renterId ? "RENTER" : uid === b.ownerId ? "OWNER" : "STAFF");
  const partyName = (role: "RENTER" | "OWNER") => (d.raisedById === (role === "RENTER" ? b.renterId : b.ownerId) ? d.raisedBy.name : d.against.name);
  const staffNotes = d.evidence.filter((e) => sideOf(e.uploadedById) === "STAFF");

  return (
    <div>
      <PageHeader
        back={{ to: "/admin/disputes", label: "Disputes" }}
        title={<span className="capitalize">{d.type.replace(/_/g, " ").toLowerCase()} dispute</span>}
        badge={<StatusPill status={d.status} />}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link to={`/admin/bookings/${b.id}`} className="link font-mono text-xs">{b.code}</Link> · {b.listing.title} · <SlaIndicator createdAt={d.createdAt} open={open} />
          </span>
        }
        actions={
          d.status === "OPEN" && (
            <Button variant="outline" size="sm" icon={<Eye className="h-4 w-4" />} loading={review.isPending} onClick={() => review.mutate()}>
              Mark under review
            </Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Claim">
            <KeyValue
              cols={3}
              items={[
                { label: "Raised by", value: <><Link className="link" to={`/admin/users/${d.raisedById}`}>{d.raisedBy.name}</Link> <Badge tone={sideOf(d.raisedById) === "OWNER" ? "brand" : "blue"}>{sideOf(d.raisedById).toLowerCase()}</Badge></> },
                { label: "Against", value: <><Link className="link" to={`/admin/users/${d.againstId}`}>{d.against.name}</Link> <Badge tone={sideOf(d.againstId) === "OWNER" ? "brand" : "blue"}>{sideOf(d.againstId).toLowerCase()}</Badge></> },
                { label: "Opened", value: fmtDateTime(d.createdAt) },
                { label: "Claim amount", value: <b>{d.claimAmount ? money(d.claimAmount) : "—"}</b> },
                { label: "Security deposit", value: money(b.depositAmount) },
                { label: "Rent", value: money(b.rentAmount) },
                { label: "Booking status", value: <StatusPill status={b.status} kind="booking" /> },
                { label: "Owner payout (planned)", value: money(b.ownerPayoutAmount) },
                { label: "Protection plan", value: b.protectionPlan ? "Yes" : "No" },
              ]}
            />
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-800 ring-1 ring-inset ring-slate-200">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
              <p className="whitespace-pre-line">{d.description}</p>
            </div>
            {d.resolution && (
              <div className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
                <p className="font-semibold">Resolution{d.resolvedAt ? ` · ${fmtDateTime(d.resolvedAt)}` : ""}</p>
                <p className="mt-1 whitespace-pre-line">{d.resolution}</p>
                <p className="mt-2 text-xs">Deposit deduction to owner: <b>{money(d.depositDeduction)}</b> · Refund to renter: <b>{money(d.refundAmount)}</b></p>
              </div>
            )}
          </Panel>

          <Panel title="Evidence from both sides">
            <div className="grid gap-4 md:grid-cols-2">
              {(["RENTER", "OWNER"] as const).map((role) => (
                <EvidenceColumn
                  key={role}
                  title={`${role === "RENTER" ? "Renter" : "Owner"} · ${partyName(role)}`}
                  tone={role === "OWNER" ? "brand" : "blue"}
                  evidence={d.evidence.filter((e) => sideOf(e.uploadedById) === role)}
                />
              ))}
            </div>
          </Panel>

          <Panel title="Handover & return checklists">
            {checklists.length === 0 ? <p className="text-sm text-slate-500">No checklists were submitted for this booking.</p> : <ChecklistGrid checklists={checklists} />}
          </Panel>
        </div>

        <div className="space-y-4">
          {open ? <ResolveForm dispute={d} /> : null}

          <Panel title={`Staff notes (${staffNotes.length})`}>
            {staffNotes.length > 0 && (
              <ul className="mb-4 space-y-3">
                {staffNotes.map((e) => (
                  <li key={e.id} className="rounded-lg bg-amber-50/60 p-3 text-sm ring-1 ring-inset ring-amber-100">
                    <p className="whitespace-pre-line text-slate-800">{e.note}</p>
                    <p className="mt-1 text-xs text-slate-500">{e.uploadedBy?.name ?? "Staff"} · {fmtDateTime(e.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            {open ? (
              <form
                onSubmit={(ev) => {
                  ev.preventDefault();
                  if (note.trim()) addNote.mutate(note.trim());
                }}
              >
                <Textarea name="staff-note" label="Add note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Visible to both parties as case information." />
                <div className="mt-2 flex justify-end">
                  <Button type="submit" size="sm" variant="secondary" icon={<MessageSquarePlus className="h-4 w-4" />} loading={addNote.isPending} disabled={!note.trim()}>
                    Add note
                  </Button>
                </div>
              </form>
            ) : (
              staffNotes.length === 0 && <p className="text-sm text-slate-500">No notes.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function EvidenceColumn({ title, tone, evidence }: { title: string; tone: "brand" | "blue"; evidence: EvidenceRow[] }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <Badge tone={tone} className="mb-3">{title}</Badge>
      {evidence.length === 0 ? (
        <p className="text-sm text-slate-400">No evidence submitted.</p>
      ) : (
        <ul className="space-y-3">
          {evidence.map((e) => (
            <li key={e.id} className="text-sm">
              {e.url && (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(e.url) || e.url.includes("/uploads/") ? (
                <Thumb src={e.url} alt="Evidence photo" className="h-32 w-full" caption={`Uploaded ${fmtDateTime(e.createdAt)}`} />
              ) : (
                <a href={e.url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1"><FileText className="h-4 w-4" /> Open attachment</a>
              ))}
              {e.note && <p className="mt-1 whitespace-pre-line text-slate-700">{e.note}</p>}
              <p className="mt-0.5 text-xs text-slate-500">{fmtDateTime(e.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Resolve form with ₹ inputs (sent in paise) and a live "who gets what" preview. */
function ResolveForm({ dispute: d }: { dispute: DisputeDetail }) {
  const b = d.booking;
  const [decision, setDecision] = useState<"RESOLVED" | "REJECTED">("RESOLVED");
  const [resolution, setResolution] = useState("");
  const [deduction, setDeduction] = useState("");
  const [refund, setRefund] = useState("");
  const [confirming, setConfirming] = useState(false);

  const maxDeduction = Math.max(0, b.depositAmount - b.depositDeduction);
  const maxRefund = b.rentAmount;
  const completed = b.status === "COMPLETED";
  const dedP = decision === "REJECTED" ? 0 : toPaise(deduction) ?? 0;
  const refP = decision === "REJECTED" ? 0 : toPaise(refund) ?? 0;
  const errors = {
    deduction: dedP < 0 ? "Must be positive" : dedP > maxDeduction ? `Max ${money(maxDeduction)}` : null,
    refund: refP < 0 ? "Must be positive" : refP > maxRefund ? `Max ${money(maxRefund)}` : null,
    resolution: resolution.trim().length > 0 && resolution.trim().length < 5 ? "At least 5 characters" : null,
  };
  const invalid = Boolean(errors.deduction || errors.refund) || resolution.trim().length < 5;

  // Mirror of completeBooking(): owner payout shrinks proportionally to the rent refund.
  const preview = useMemo(() => {
    const ownerImpact = Math.round((refP * b.ownerPayoutAmount) / Math.max(1, b.rentAmount));
    const depositBack = completed ? 0 : Math.max(0, b.depositAmount - b.depositDeduction - dedP);
    return {
      renterDeposit: depositBack,
      renterRefund: refP,
      renterTotal: depositBack + refP,
      ownerPayout: Math.max(0, b.ownerPayoutAmount - ownerImpact),
      ownerComp: completed ? 0 : dedP,
      ownerTotal: Math.max(0, b.ownerPayoutAmount - ownerImpact) + (completed ? 0 : dedP),
    };
  }, [refP, dedP, b, completed]);

  const resolve = useAdminMutation({
    fn: () => api.post(`/admin/disputes/${d.id}/resolve`, { decision, resolution: resolution.trim(), depositDeduction: dedP, refundAmount: refP }),
    invalidate: [["admin", "disputes"], ["admin", "bookings"], ["admin", "payouts"], ["admin", "payments"], ["admin", "dashboard"]],
    success: "Dispute closed — both parties notified",
    onSuccess: () => setConfirming(false),
  });

  return (
    <Panel title={<span className="flex items-center gap-2"><Scale className="h-4 w-4 text-slate-400" /> Resolve dispute</span>}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) setConfirming(true);
        }}
      >
        <div role="radiogroup" aria-label="Decision" className="grid grid-cols-2 gap-2">
          {(["RESOLVED", "REJECTED"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={decision === v}
              onClick={() => setDecision(v)}
              className={clsx("rounded-xl border px-3 py-2 text-left text-sm transition", decision === v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 hover:bg-slate-50")}
            >
              <p className="font-semibold">{v === "RESOLVED" ? "Uphold claim" : "Reject claim"}</p>
              <p className="text-xs opacity-80">{v === "RESOLVED" ? "Set deduction / refund" : "No money moves"}</p>
            </button>
          ))}
        </div>

        {decision === "RESOLVED" && (
          <>
            {completed && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Booking already completed — the deposit was released, so only a rent refund will move money.</p>}
            <Input
              label="Deposit deduction → owner"
              name="deduction"
              type="number"
              min={0}
              step="0.01"
              prefix="₹"
              value={deduction}
              onChange={(e) => setDeduction(e.target.value)}
              error={errors.deduction}
              hint={`Max ${money(maxDeduction)} (remaining deposit)`}
              disabled={completed}
            />
            <Input label="Rent refund → renter" name="refund" type="number" min={0} step="0.01" prefix="₹" value={refund} onChange={(e) => setRefund(e.target.value)} error={errors.refund} hint={`Max ${money(maxRefund)} (rent paid)`} />
          </>
        )}

        <Textarea label="Resolution (sent to both parties)" name="resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} error={errors.resolution} maxLength={4000} placeholder="Summarise the evidence and the decision." />

        <div className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-inset ring-slate-200">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated outcome</p>
          <dl className="space-y-1">
            <PreviewRow label="Renter · deposit returned" value={preview.renterDeposit} />
            <PreviewRow label="Renter · rent refund" value={preview.renterRefund} />
            <PreviewRow label="Renter receives" value={preview.renterTotal} strong />
            <div className="my-1.5 border-t border-dashed border-slate-200" />
            <PreviewRow label="Owner · rental payout" value={preview.ownerPayout} />
            <PreviewRow label="Owner · damage compensation" value={preview.ownerComp} />
            <PreviewRow label="Owner receives" value={preview.ownerTotal} strong />
          </dl>
          <p className="mt-2 text-[11px] text-slate-500">Excludes any late-fee share. Final amounts are calculated server-side.</p>
        </div>

        <Button type="submit" block loading={resolve.isPending} disabled={invalid} variant={decision === "REJECTED" ? "dark" : "primary"}>
          {decision === "RESOLVED" ? "Resolve dispute" : "Reject dispute"}
        </Button>
        <p className="text-center text-xs text-slate-500">
          Booking <Mono>{b.code}</Mono> will be completed and payouts released.
        </p>
      </form>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={decision === "RESOLVED" ? "Resolve dispute?" : "Reject dispute?"}
        tone={decision === "RESOLVED" ? "primary" : "danger"}
        confirmLabel={decision === "RESOLVED" ? "Resolve" : "Reject"}
        loading={resolve.isPending}
        onConfirm={() => resolve.mutate()}
        description={
          <>
            Renter receives <b>{money(preview.renterTotal)}</b>, owner receives <b>{money(preview.ownerTotal)}</b> (estimate). Refunds and payouts are triggered immediately and can't be undone.
          </>
        }
      />
    </Panel>
  );
}

function PreviewRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={clsx("flex justify-between gap-2", strong ? "font-semibold text-slate-900" : "text-slate-600")}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{money(value)}</dd>
    </div>
  );
}
