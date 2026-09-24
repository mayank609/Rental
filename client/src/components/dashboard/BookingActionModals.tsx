/**
 * Modals for booking lifecycle actions: decline, cancel (with refund
 * preview), handover/return checklists, owner inspection, review and
 * dispute. Every endpoint returns the fresh booking detail, which we write
 * straight into the ["booking", id] cache.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Camera, CheckCircle2, Info, Plus, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api, apiError, apiErrorCode } from "@/lib/api";
import { CONDITION_LABEL, money, toPaise } from "@/lib/format";
import type { BookingDetail, ChecklistPhoto, Condition } from "@/lib/types";
import { Alert, Button, Input, Modal, Select, Skeleton, Stars, Textarea } from "@/components/ui";
import { EvidenceUploader } from "./EvidenceUploader";
import { Countdown } from "./common";
import type { CancellationPreview, DisputeType } from "./types";

/** Apply a server-returned booking to the caches. */
export function useApplyBooking() {
  const qc = useQueryClient();
  return (b: BookingDetail | undefined, id: string) => {
    if (b) qc.setQueryData(["booking", id], b);
    else qc.invalidateQueries({ queryKey: ["booking", id] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

interface BaseProps {
  booking: BookingDetail;
  open: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/* Decline                                                             */
/* ------------------------------------------------------------------ */

const DECLINE_REASONS = ["Item not available on these dates", "Item needs repair / servicing", "Renter profile incomplete", "Other"];

export function DeclineModal({ booking, open, onClose }: BaseProps) {
  const apply = useApplyBooking();
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const [detail, setDetail] = useState("");
  const m = useMutation({
    mutationFn: async () => (await api.post<{ booking: BookingDetail }>(`/bookings/${booking.id}/decline`, { reason: [reason === "Other" ? "" : reason, detail.trim()].filter(Boolean).join(" — ") || undefined })).data.booking,
    onSuccess: (b) => {
      apply(b, booking.id);
      toast.success("Request declined. The renter has been notified.");
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Decline this request?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep request</Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>Decline request</Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">The renter won't be charged. Declining often can lower your listing's ranking, so block dates in your calendar when the item isn't available.</p>
      <div className="mt-4 space-y-2" role="radiogroup" aria-label="Reason">
        {DECLINE_REASONS.map((r) => (
          <label key={r} className={clsx("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm", reason === r ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50")}>
            <input type="radio" name="decline-reason" checked={reason === r} onChange={() => setReason(r)} className="text-brand-600" />
            {r}
          </label>
        ))}
      </div>
      <Textarea className="mt-4" label="Message to the renter (optional)" maxLength={400} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. It's booked offline that weekend — try the following week!" />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Cancel                                                              */
/* ------------------------------------------------------------------ */

export function CancelModal({ booking, open, onClose }: BaseProps) {
  const apply = useApplyBooking();
  const [reason, setReason] = useState("");
  const preview = useQuery({
    queryKey: ["booking", booking.id, "cancellation-preview"],
    queryFn: async () => (await api.get<CancellationPreview>(`/bookings/${booking.id}/cancellation-preview`)).data,
    enabled: open,
    staleTime: 0,
  });
  const m = useMutation({
    mutationFn: async () => (await api.post<{ booking: BookingDetail }>(`/bookings/${booking.id}/cancel`, { reason: reason.trim() || undefined })).data.booking,
    onSuccess: (b) => {
      apply(b, booking.id);
      toast.success("Booking cancelled");
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const isOwner = booking.viewerRole === "OWNER";
  const paid = booking.status === "CONFIRMED";
  const o = preview.data?.outcome;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel booking"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep booking</Button>
          <Button variant="danger" loading={m.isPending} disabled={preview.isLoading} onClick={() => m.mutate()}>Confirm cancellation</Button>
        </>
      }
    >
      {preview.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : preview.isError ? (
        <Alert tone="red" title="Couldn't load refund details">{apiError(preview.error)}</Alert>
      ) : o ? (
        <div className="space-y-4">
          {!paid ? (
            <Alert tone="blue" icon={<Info className="h-4 w-4" />} title="No payment has been made yet">
              {isOwner ? "The renter hasn't paid, so there's no penalty for cancelling now." : "You haven't been charged, so nothing will be deducted."}
            </Alert>
          ) : isOwner ? (
            <>
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <p className="text-sm text-slate-500">The renter will be refunded</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{money(o.refundAmount)}</p>
                <p className="text-xs text-slate-500">100% including deposit</p>
              </div>
              {o.ownerPenalty > 0 && (
                <Alert tone="red" icon={<ShieldAlert className="h-4 w-4" />} title={`A ${money(o.ownerPenalty)} cancellation penalty applies`}>
                  Owners cancelling a paid booking are charged a penalty, deducted from future payouts. Frequent cancellations can also lower your ranking or suspend your listings.
                </Alert>
              )}
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <p className="text-sm text-slate-500">You'll get back</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{money(o.refundAmount)}</p>
                <p className="text-xs text-slate-500">{o.refundPercent}% of rent refunded + full deposit · of {money(booking.pricing.totalAmount)} paid</p>
              </div>
              {o.refundPercent < 100 && (
                <Alert tone="amber" title="Partial refund">
                  Under the <b>{preview.data!.policy.toLowerCase()}</b> policy, only {o.refundPercent}% of the rent is refundable at this point. Service fees are refunded only for full refunds.
                </Alert>
              )}
              <p className="text-xs text-slate-500">Refunds go back to your original payment method within 5–7 working days.</p>
            </>
          )}
          {preview.data!.tiers.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{preview.data!.policy.toLowerCase()} policy</p>
              <ul className="mt-1.5 space-y-1 text-sm text-slate-600">
                {[...preview.data!.tiers].sort((a, b) => b.hoursBefore - a.hoursBefore).map((t) => (
                  <li key={t.hoursBefore} className="flex justify-between">
                    <span>{t.hoursBefore > 0 ? `${t.hoursBefore >= 24 && t.hoursBefore % 24 === 0 ? `${t.hoursBefore / 24} day${t.hoursBefore > 24 ? "s" : ""}` : `${t.hoursBefore} hours`}+ before start` : "After that"}</span>
                    <span className="font-medium">{t.refundPercent}% rent refund</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
      <Textarea className="mt-4" label="Reason (shared with the other party)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Let them know why you're cancelling" />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Handover / return checklist                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_ITEMS: Record<"HANDOVER" | "RETURN", string[]> = {
  HANDOVER: ["Item powers on / works", "All accessories included", "No visible damage", "Cleaned & ready to use", "Usage instructions explained"],
  RETURN: ["Item powers on / works", "All accessories returned", "No new damage", "Returned clean"],
};

export function ChecklistModal({ booking, open, onClose, type }: BaseProps & { type: "HANDOVER" | "RETURN" }) {
  const apply = useApplyBooking();
  const [items, setItems] = useState(() => DEFAULT_ITEMS[type].map((label) => ({ label, ok: true })));
  const [newItem, setNewItem] = useState("");
  const [condition, setCondition] = useState<Condition>("GOOD");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<ChecklistPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) setItems(DEFAULT_ITEMS[type].map((label) => ({ label, ok: true })));
  }, [open, type]);

  const m = useMutation({
    mutationFn: async () =>
      (await api.post<{ booking: BookingDetail }>(`/bookings/${booking.id}/checklists`, { type, condition, notes: notes.trim() || undefined, items: items.filter((i) => i.label.trim()), photos })).data.booking,
    onSuccess: (b) => {
      apply(b, booking.id);
      toast.success(type === "HANDOVER" ? "Handover checklist saved" : "Return checklist saved");
      setPhotos([]);
      setNotes("");
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const isHandover = type === "HANDOVER";
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isHandover ? "Handover checklist" : "Return checklist"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={m.isPending} disabled={!photos.length || uploading} onClick={() => m.mutate()} icon={<CheckCircle2 className="h-4 w-4" />}>
            Submit checklist
          </Button>
        </>
      }
    >
      <Alert tone="brand" icon={<Camera className="h-4 w-4" />} title="Photos are your evidence">
        Take clear photos of the item from all sides, including serial numbers and any existing marks. They're timestamped and used to resolve disputes about damage or missing parts.
      </Alert>

      <div className="mt-5">
        <p className="label">Checklist</p>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                checked={it.ok}
                onChange={(e) => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                aria-label={`${it.label} OK`}
              />
              <input
                value={it.label}
                onChange={(e) => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value.slice(0, 120) } : x)))}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none focus:underline"
                aria-label="Checklist item"
              />
              <span className={clsx("text-xs font-semibold", it.ok ? "text-emerald-600" : "text-red-600")}>{it.ok ? "OK" : "Issue"}</span>
              <button type="button" onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Remove item">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newItem.trim() || items.length >= 30) return;
            setItems((arr) => [...arr, { label: newItem.trim().slice(0, 120), ok: true }]);
            setNewItem("");
          }}
        >
          <input className="input" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item, e.g. Charger included" aria-label="New checklist item" />
          <Button type="submit" variant="outline" icon={<Plus className="h-4 w-4" />}>Add</Button>
        </form>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Select label="Overall condition" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
          {Object.entries(CONDITION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </div>
      <Textarea className="mt-4" label="Notes (optional)" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isHandover ? "e.g. Small scratch on the left side, already present" : "e.g. Returned with all 3 lenses, battery at 50%"} />

      <div className="mt-5">
        <p className="label">Photos <span className="text-red-600">*</span></p>
        <EvidenceUploader value={photos} onChange={setPhotos} purpose="checklist" withLocation onBusyChange={setUploading} label="Take photo" />
        {!photos.length && <p className="mt-1 text-xs text-amber-700">At least one photo is required.</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Owner inspection                                                    */
/* ------------------------------------------------------------------ */

export function InspectModal({ booking, open, onClose }: BaseProps) {
  const apply = useApplyBooking();
  const [mode, setMode] = useState<"ok" | "damage">("ok");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<"DAMAGE" | "NOT_AS_DESCRIBED" | "LATE_RETURN" | "OTHER">("DAMAGE");
  const [description, setDescription] = useState("");
  const [claim, setClaim] = useState("");
  const [photos, setPhotos] = useState<ChecklistPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const maxClaim = booking.pricing.depositAmount + booking.pricing.rentAmount + (booking.protectionPlan ? 5_000_000 : 0);
  const claimPaise = toPaise(claim) ?? 0;

  const m = useMutation({
    mutationFn: async () => {
      const body =
        mode === "ok"
          ? { ok: true, notes: notes.trim() || undefined }
          : { ok: false, type, description: description.trim(), claimAmount: claimPaise, evidenceUrls: photos.map((p) => p.url) };
      return (await api.post<{ booking: BookingDetail }>(`/bookings/${booking.id}/inspection`, body)).data.booking;
    },
    onSuccess: (b) => {
      apply(b, booking.id);
      toast.success(mode === "ok" ? "Deposit released — thanks for renting!" : "Damage report submitted. Our team will review it.");
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const damageValid = description.trim().length >= 10 && claimPaise >= 0 && claimPaise <= maxClaim;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Inspect returned item"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {mode === "ok" ? (
            <Button loading={m.isPending} onClick={() => m.mutate()} icon={<ShieldCheck className="h-4 w-4" />}>Release deposit</Button>
          ) : (
            <Button variant="danger" loading={m.isPending} disabled={!damageValid || uploading} onClick={() => m.mutate()}>Submit damage report</Button>
          )}
        </>
      }
    >
      {booking.timestamps.inspectionDeadline && (
        <p className="mb-4 text-sm text-slate-600">
          Inspection window: <Countdown to={booking.timestamps.inspectionDeadline} />. If you don't respond in time, the deposit is released automatically.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            { v: "ok", title: "Everything's OK", desc: `Release the ${money(booking.pricing.depositAmount)} deposit to the renter and complete the rental.`, icon: <ShieldCheck className="h-5 w-5 text-emerald-600" /> },
            { v: "damage", title: "Report a problem", desc: "Claim from the deposit for damage, missing parts or other issues.", icon: <ShieldAlert className="h-5 w-5 text-red-600" /> },
          ] as const
        ).map((o) => (
          <button key={o.v} type="button" onClick={() => setMode(o.v)} className={clsx("rounded-2xl border p-4 text-left transition", mode === o.v ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:bg-slate-50")} aria-pressed={mode === o.v}>
            {o.icon}
            <p className="mt-2 font-semibold text-slate-900">{o.title}</p>
            <p className="mt-0.5 text-xs text-slate-600">{o.desc}</p>
          </button>
        ))}
      </div>

      {mode === "ok" ? (
        <Textarea className="mt-5" label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Issue type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="DAMAGE">Damage</option>
              <option value="NOT_AS_DESCRIBED">Missing parts / not as handed over</option>
              <option value="LATE_RETURN">Late return</option>
              <option value="OTHER">Other</option>
            </Select>
            <Input
              label="Claim amount"
              prefix="₹"
              type="number"
              inputMode="decimal"
              min={0}
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              error={claimPaise > maxClaim ? `Max claim is ${money(maxClaim)}` : null}
              hint={`Deposit held: ${money(booking.pricing.depositAmount)}`}
            />
          </div>
          <Textarea label="What happened?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} error={description && description.trim().length < 10 ? "Please describe the issue (at least 10 characters)" : null} placeholder="Describe the damage, when you noticed it and how you estimated the repair cost." />
          <div>
            <p className="label">Evidence photos</p>
            <EvidenceUploader value={photos} onChange={setPhotos} purpose="dispute" onBusyChange={setUploading} />
          </div>
          <p className="text-xs text-slate-500">A dispute will be opened and reviewed by our team using both parties' checklist photos. The deposit stays on hold until it's resolved.</p>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

export function ReviewModal({ booking, open, onClose }: BaseProps) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const other = booking.viewerRole === "OWNER" ? booking.renter : booking.owner;
  const m = useMutation({
    mutationFn: () => api.post("/reviews", { bookingId: booking.id, rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking", booking.id] });
      toast.success("Thanks for your review!");
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const words = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Rate ${other.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Later</Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>Submit review</Button>
        </>
      }
    >
      <div className="flex flex-col items-center text-center">
        <p className="text-sm text-slate-600">How was {booking.viewerRole === "OWNER" ? "renting to" : "renting from"} {other.name}?</p>
        <div className="mt-3">
          <Stars value={rating} onChange={setRating} size={36} />
        </div>
        <p className="mt-1 text-sm font-semibold text-amber-600">{words[rating]}</p>
      </div>
      <Textarea className="mt-5" label="Your review (public)" maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={booking.viewerRole === "OWNER" ? "Was the item returned on time and in good condition?" : "How was the item and the pickup experience?"} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Dispute                                                             */
/* ------------------------------------------------------------------ */

export const DISPUTE_TYPE_LABEL: Record<DisputeType, string> = {
  DAMAGE: "Damage",
  NOT_RETURNED: "Item not returned",
  NOT_AS_DESCRIBED: "Not as described",
  NO_SHOW: "No-show",
  LATE_RETURN: "Late return",
  PAYMENT: "Payment issue",
  OTHER: "Other",
};

export function DisputeModal({ booking, open, onClose }: BaseProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isOwner = booking.viewerRole === "OWNER";
  const types: DisputeType[] = isOwner ? ["DAMAGE", "NOT_RETURNED", "LATE_RETURN", "NO_SHOW", "PAYMENT", "OTHER"] : ["NOT_AS_DESCRIBED", "DAMAGE", "NO_SHOW", "PAYMENT", "OTHER"];
  const [type, setType] = useState<DisputeType>(types[0]);
  const [description, setDescription] = useState("");
  const [claim, setClaim] = useState("");
  const [photos, setPhotos] = useState<ChecklistPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const claimPaise = toPaise(claim) ?? 0;

  const m = useMutation({
    mutationFn: async () =>
      (await api.post<{ dispute: { id: string } }>("/disputes", { bookingId: booking.id, type, description: description.trim(), claimAmount: claimPaise, evidenceUrls: photos.map((p) => p.url) })).data.dispute,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["booking", booking.id] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
      toast.success("Dispute opened. Our team typically responds within 48 hours.");
      onClose();
      navigate(`/dashboard/disputes/${d.id}`);
    },
    onError: (e) => {
      const code = apiErrorCode(e);
      toast.error(code === "DISPUTE_EXISTS" ? "There's already an open dispute for this booking." : apiError(e));
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Report a problem"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={m.isPending} disabled={description.trim().length < 10 || uploading} onClick={() => m.mutate()}>Open dispute</Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Try messaging the other party first — most issues are sorted out quickly. If that doesn't work, our team will review the checklist photos, messages and your evidence, and decide on deposit deductions or refunds.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Select label="What went wrong?" value={type} onChange={(e) => setType(e.target.value as DisputeType)}>
          {types.map((t) => (
            <option key={t} value={t}>{DISPUTE_TYPE_LABEL[t]}</option>
          ))}
        </Select>
        <Input label="Amount claimed (optional)" prefix="₹" type="number" min={0} inputMode="decimal" value={claim} onChange={(e) => setClaim(e.target.value)} hint={isOwner ? `Deposit held: ${money(booking.pricing.depositAmount)}` : "Refund you're requesting"} />
      </div>
      <Textarea className="mt-4" label="Describe the issue" maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} error={description && description.trim().length < 10 ? "At least 10 characters" : null} placeholder="Be specific: what happened, when, and what outcome you're asking for." />
      <div className="mt-4">
        <p className="label">Evidence photos (recommended)</p>
        <EvidenceUploader value={photos} onChange={setPhotos} purpose="dispute" onBusyChange={setUploading} />
      </div>
    </Modal>
  );
}
