/**
 * Confirmation dialog for (destructive) admin actions. Optionally collects a
 * reason; `reasonRequired` blocks confirmation until one is entered.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Modal, Textarea } from "@/components/ui";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  /** Show a reason textarea. */
  reason?: boolean;
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Minimum reason length when required (server validation often needs 3+). */
  reasonMin?: number;
  children?: ReactNode;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel = "Confirm", tone = "danger", loading, reason, reasonRequired, reasonLabel = "Reason", reasonPlaceholder, reasonMin = 3, children,
}: Props) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  const invalid = Boolean(reason && reasonRequired && text.trim().length < reasonMin);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} disabled={invalid} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {description && (
          <div className="flex gap-3 text-sm text-slate-600">
            {tone === "danger" && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />}
            <div>{description}</div>
          </div>
        )}
        {children}
        {reason && (
          <Textarea
            label={`${reasonLabel}${reasonRequired ? "" : " (optional)"}`}
            name="confirm-reason"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={reasonPlaceholder}
            maxLength={500}
            hint={reasonRequired ? `At least ${reasonMin} characters. Stored in the audit log.` : "Stored in the audit log."}
            autoFocus
          />
        )}
      </div>
    </Modal>
  );
}
