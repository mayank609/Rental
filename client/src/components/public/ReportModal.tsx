/** Report a listing or user to the trust & safety team (POST /reports). */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, apiError } from "@/lib/api";
import { Button, Modal, Select, Textarea } from "@/components/ui";

const REASONS: { value: string; label: string; for: ("LISTING" | "USER")[] }[] = [
  { value: "PROHIBITED_ITEM", label: "Prohibited or illegal item", for: ["LISTING"] },
  { value: "FAKE_LISTING", label: "Fake or misleading listing", for: ["LISTING"] },
  { value: "SCAM", label: "Scam or fraud", for: ["LISTING", "USER"] },
  { value: "OFF_PLATFORM_PAYMENT", label: "Asked to pay outside the platform", for: ["LISTING", "USER"] },
  { value: "HARASSMENT", label: "Harassment or abuse", for: ["USER"] },
  { value: "INAPPROPRIATE", label: "Inappropriate content", for: ["LISTING", "USER"] },
  { value: "SPAM", label: "Spam", for: ["LISTING", "USER"] },
  { value: "OTHER", label: "Something else", for: ["LISTING", "USER"] },
];

export function ReportModal({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: "LISTING" | "USER"; targetId: string }) {
  const options = REASONS.filter((r) => r.for.includes(targetType));
  const [reason, setReason] = useState(options[0].value);
  const [details, setDetails] = useState("");
  const m = useMutation({
    mutationFn: () => api.post("/reports", { targetType, targetId, reason, details: details.trim() || undefined }),
    onSuccess: () => {
      toast.success("Thanks — our trust & safety team will review this.");
      setDetails("");
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={targetType === "LISTING" ? "Report this listing" : "Report this user"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>Submit report</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Select label="What's wrong?" name="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Textarea label="Details (optional)" name="details" maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Tell us what happened. Reports are confidential." />
        <p className="text-xs text-slate-500">Reports are confidential. If you're in immediate danger, contact local authorities (112).</p>
      </form>
    </Modal>
  );
}
