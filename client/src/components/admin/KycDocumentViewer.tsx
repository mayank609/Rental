/**
 * Streams a private KYC document (GET /admin/kyc/:id/file) as a blob and
 * renders it inline — image or PDF iframe. Each view is audited server-side.
 * Object URLs are revoked on unmount so documents don't linger in memory.
 */
import { useEffect, useState } from "react";
import { FileWarning } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Modal, Spinner } from "@/components/ui";

export function KycDocumentPreview({ docId, className }: { docId: string; className?: string }) {
  const [state, setState] = useState<{ url: string; type: string } | { error: string } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setState(null);
    api
      .get<Blob>(`/admin/kyc/${docId}/file`, { responseType: "blob" })
      .then((r) => {
        if (cancelled) return;
        url = URL.createObjectURL(r.data);
        setState({ url, type: r.data.type || String(r.headers["content-type"] ?? "") });
      })
      .catch((e) => !cancelled && setState({ error: apiError(e, "Could not load the document") }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [docId]);

  const box = className ?? "h-[60vh]";
  if (!state)
    return (
      <div className={`flex items-center justify-center rounded-xl bg-slate-100 text-brand-600 ${box}`}>
        <Spinner className="h-7 w-7" />
      </div>
    );
  if ("error" in state)
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm text-slate-500 ${box}`}>
        <FileWarning className="h-6 w-6" /> {state.error}
      </div>
    );
  return state.type.includes("pdf") ? (
    <iframe title="KYC document" src={state.url} className={`w-full rounded-xl border border-slate-200 bg-white ${box}`} />
  ) : (
    <div className={`flex items-center justify-center overflow-auto rounded-xl bg-slate-900/95 ${box}`}>
      <img src={state.url} alt="KYC document" className="max-h-full max-w-full object-contain" />
    </div>
  );
}

export function KycDocumentModal({ docId, title, onClose }: { docId: string | null; title?: string; onClose: () => void }) {
  return (
    <Modal open={Boolean(docId)} onClose={onClose} title={title ?? "Identity document"} size="xl">
      {docId && <KycDocumentPreview docId={docId} />}
      <p className="mt-3 text-xs text-slate-500">Access to identity documents is logged in the audit trail. Do not download or share.</p>
    </Modal>
  );
}
