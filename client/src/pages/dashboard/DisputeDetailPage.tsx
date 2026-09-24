/**
 * Dispute detail: claim summary, both parties' checklist photos as
 * evidence, an evidence thread (notes + photos) and the final resolution.
 */
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import { ArrowRight, Camera, CheckCircle2, Gavel, Info, Paperclip, Scale, Send, XCircle } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { CONDITION_LABEL, fmtDateTime, fmtRange, money } from "@/lib/format";
import type { ChecklistPhoto } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Seo } from "@/components/Seo";
import { StatusBadge } from "@/components/StatusBadge";
import { Alert, Avatar, Badge, Button, Card, Skeleton, Textarea } from "@/components/ui";
import { ErrorState, PageHeader, PhotoGrid, useNotificationEvent } from "@/components/dashboard/common";
import { EvidenceUploader } from "@/components/dashboard/EvidenceUploader";
import { DISPUTE_TYPE_LABEL } from "@/components/dashboard/BookingActionModals";
import { DISPUTE_STATUS } from "@/components/dashboard/constants";
import type { DisputeDetail } from "@/components/dashboard/types";

export default function DisputeDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<ChecklistPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  const q = useQuery({ queryKey: ["dispute", id], queryFn: async () => (await api.get<{ dispute: DisputeDetail }>(`/disputes/${id}`)).data.dispute });
  const { refetch } = q;
  useNotificationEvent(
    useCallback(
      (n) => {
        if (n.data?.disputeId === id || (typeof n.data?.url === "string" && n.data.url.includes(id))) refetch();
      },
      [id, refetch],
    ),
  );

  const add = useMutation({
    mutationFn: async () => {
      const text = note.trim();
      if (!photos.length) return api.post(`/disputes/${id}/evidence`, { note: text });
      // One evidence row per photo; the note is attached to the first.
      for (const [i, p] of photos.entries()) {
        await api.post(`/disputes/${id}/evidence`, { url: p.url, ...(i === 0 && text ? { note: text } : {}) });
      }
    },
    onSuccess: () => {
      setNote("");
      setPhotos([]);
      refetch();
      toast.success("Evidence added — the other party and our team have been notified");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  if (q.isLoading)
    return (
      <div>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
        <Skeleton className="mt-6 h-72 w-full rounded-2xl" />
      </div>
    );
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => refetch()} />;

  const d = q.data;
  const s = DISPUTE_STATUS[d.status];
  const closed = d.status === "RESOLVED" || d.status === "REJECTED";
  const raisedByMe = d.raisedById === user?.id;
  const nameFor = (uid: string) => (uid === user?.id ? "You" : uid === d.raisedBy.id ? d.raisedBy.name : uid === d.against.id ? d.against.name : "RentNest team");
  const roleFor = (uid: string) => (uid === d.booking.ownerId ? "Owner" : uid === d.booking.renterId ? "Renter" : "Support");

  return (
    <div>
      <Seo title="Dispute" noindex />
      <PageHeader
        back={{ to: "/dashboard/disputes", label: "Disputes" }}
        title={DISPUTE_TYPE_LABEL[d.type] ?? d.type}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.label}</Badge>
            <span>{raisedByMe ? `You raised this against ${d.against.name}` : `${d.raisedBy.name} raised this against you`}</span>
            <span className="text-slate-300">•</span>
            <span>{fmtDateTime(d.createdAt)}</span>
          </span>
        }
      />

      {/* Status explanation / resolution */}
      {closed ? (
        <Card className={clsx("mb-6 ring-1 ring-inset", d.status === "RESOLVED" ? "bg-emerald-50/60 ring-emerald-200" : "bg-slate-50 ring-slate-200")}>
          <div className="flex gap-4">
            <div className={clsx("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", d.status === "RESOLVED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>
              {d.status === "RESOLVED" ? <Scale className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-slate-900">{d.status === "RESOLVED" ? "Dispute resolved" : "Dispute closed without action"}</h2>
              {d.resolution && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{d.resolution}</p>}
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <dt className="text-xs text-slate-500">Deducted from deposit</dt>
                  <dd className="text-lg font-bold text-slate-900">{money(d.depositDeduction)}</dd>
                </div>
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <dt className="text-xs text-slate-500">Refunded to renter</dt>
                  <dd className="text-lg font-bold text-slate-900">{money(d.refundAmount)}</dd>
                </div>
                {d.resolvedAt && (
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <dt className="text-xs text-slate-500">Decided on</dt>
                    <dd className="text-sm font-semibold text-slate-900">{fmtDateTime(d.resolvedAt)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </Card>
      ) : (
        <Alert tone={d.status === "UNDER_REVIEW" ? "blue" : "amber"} className="mb-6" icon={<Gavel className="h-4 w-4" />} title={d.status === "UNDER_REVIEW" ? "Our team is reviewing this dispute" : "Dispute opened"}>
          We compare the handover & return checklist photos, messages and the evidence below. Deposit and payouts for this booking stay on hold until a decision is made — usually within 48–72 hours. Add anything that helps explain what happened.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Claim */}
          <Card>
            <h2 className="font-semibold text-slate-900">Claim</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{d.description}</p>
            {d.claimAmount > 0 && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-200">Amount claimed: {money(d.claimAmount)}</p>
            )}
          </Card>

          {/* Evidence thread */}
          <Card>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Paperclip className="h-4 w-4 text-slate-500" /> Evidence & updates
            </h2>
            {d.evidence.length ? (
              <ol className="mt-4 space-y-4">
                {d.evidence.map((e) => {
                  const mine = e.uploadedById === user?.id;
                  return (
                    <li key={e.id} className={clsx("flex gap-3", mine && "flex-row-reverse")}>
                      <Avatar name={e.uploadedBy.name} size={32} />
                      <div className={clsx("max-w-[85%] rounded-2xl p-3", mine ? "bg-brand-50" : roleFor(e.uploadedById) === "Support" ? "bg-amber-50" : "bg-slate-50")}>
                        <p className="text-xs font-semibold text-slate-600">
                          {mine ? "You" : e.uploadedBy.name} <span className="font-normal text-slate-400">· {roleFor(e.uploadedById)} · {fmtDateTime(e.createdAt)}</span>
                        </p>
                        {e.note && <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{e.note}</p>}
                        {e.url && <PhotoGrid photos={[e.url]} className="mt-2" />}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No evidence has been added yet.</p>
            )}

            {!closed ? (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <Textarea label="Add a note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Explain what happened, share repair quotes, or respond to the other party's claim." />
                <div className="mt-3">
                  <p className="label">Photos</p>
                  <EvidenceUploader value={photos} onChange={setPhotos} purpose="dispute" onBusyChange={setUploading} />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button loading={add.isPending} disabled={(!note.trim() && !photos.length) || uploading} onClick={() => add.mutate()} icon={<Send className="h-4 w-4" />}>
                    Submit evidence
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-6 flex items-center gap-1.5 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <Info className="h-3.5 w-3.5" /> This dispute is closed. Contact support if you have new information.
              </p>
            )}
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          {/* Booking */}
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Booking</p>
            <p className="mt-1 font-semibold text-slate-900">{d.booking.listing.title}</p>
            <p className="text-sm text-slate-600">#{d.booking.code} · {fmtRange(d.booking.startAt, d.booking.endAt)}</p>
            <div className="mt-2"><StatusBadge status={d.booking.status} /></div>
            <Link to={`/dashboard/bookings/${d.booking.id}`} className="link mt-3 inline-flex items-center gap-1 text-sm">
              Open booking <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>

          {/* Checklist evidence */}
          <Card>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Camera className="h-4 w-4 text-slate-500" /> Checklist photos
            </h2>
            <p className="mt-1 text-xs text-slate-500">Timestamped photos both parties took at handover and return.</p>
            {d.booking.checklists.length ? (
              <div className="mt-4 space-y-4">
                {d.booking.checklists.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {c.type === "HANDOVER" ? "Handover" : "Return"} · {c.role === "OWNER" ? "Owner" : "Renter"}
                      </p>
                      <span className="text-[11px] text-slate-500">{fmtDateTime(c.createdAt)}</span>
                    </div>
                    {c.condition && <p className="text-xs text-slate-600">Condition: {CONDITION_LABEL[c.condition] ?? c.condition}</p>}
                    {c.items.some((i) => !i.ok) && (
                      <p className="mt-1 text-xs text-red-600">Issues: {c.items.filter((i) => !i.ok).map((i) => i.label).join(", ")}</p>
                    )}
                    {c.items.length > 0 && c.items.every((i) => i.ok) && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> All {c.items.length} items OK</p>
                    )}
                    {c.notes && <p className="mt-1 text-xs text-slate-600">“{c.notes}”</p>}
                    <PhotoGrid photos={c.photos} size="sm" className="mt-2" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No checklists were submitted for this booking.</p>
            )}
          </Card>

          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parties</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center justify-between"><span className="text-slate-500">Raised by</span><span className="font-medium">{nameFor(d.raisedBy.id)} ({roleFor(d.raisedBy.id)})</span></li>
              <li className="flex items-center justify-between"><span className="text-slate-500">Against</span><span className="font-medium">{nameFor(d.against.id)} ({roleFor(d.against.id)})</span></li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
