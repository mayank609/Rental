/**
 * KYC review queue: list of submitted identity documents with a side panel
 * that streams the private file, plus approve / reject-with-reason.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime, fromNow } from "@/lib/format";
import { Button, Tabs } from "@/components/ui";
import { KeyValue, Mono, PageHeader, Panel, StatusPill } from "@/components/admin/AdminUi";
import { TableFooter } from "@/components/admin/DataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { KycDocumentPreview } from "@/components/admin/KycDocumentViewer";
import { useAdminMutation, useUrlFilters } from "@/components/admin/hooks";
import type { KycQueueDoc, PageMeta } from "@/components/admin/types";

type KycTab = "PENDING" | "VERIFIED" | "REJECTED";

export default function AdminKycPage() {
  const [f, setF] = useUrlFilters({ status: "PENDING", page: "1" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const q = useQuery({
    queryKey: ["admin", "kyc", f],
    queryFn: async () => (await api.get<{ documents: KycQueueDoc[]; meta: PageMeta }>("/admin/kyc", { params: { status: f.status, page: f.page, limit: 20 } })).data,
    placeholderData: keepPreviousData,
  });
  const docs = q.data?.documents ?? [];
  const selected = docs.find((d) => d.id === selectedId) ?? null;

  // Auto-select the first document so reviewers can work top-to-bottom.
  useEffect(() => {
    if (!q.isFetching && docs.length && !docs.some((d) => d.id === selectedId)) setSelectedId(docs[0].id);
    if (!docs.length) setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const review = useAdminMutation<{ id: string; approve: boolean; reason?: string }>({
    fn: ({ id, approve, reason }) => api.post(`/admin/kyc/${id}/review`, { approve, reason }),
    invalidate: [["admin", "kyc"], ["admin", "dashboard"], ["admin", "users"]],
    success: (_d, v) => (v.approve ? "Identity verified" : "Document rejected"),
    onSuccess: () => setRejecting(false),
  });

  return (
    <div>
      <PageHeader title="KYC queue" subtitle="Verify identity documents. Approval releases payouts held for missing KYC." />
      <Tabs<KycTab>
        className="mb-4"
        value={f.status as KycTab}
        onChange={(v) => setF({ status: v })}
        tabs={[
          { value: "PENDING", label: "Pending", count: f.status === "PENDING" ? q.data?.meta.total : undefined },
          { value: "VERIFIED", label: "Verified" },
          { value: "REJECTED", label: "Rejected" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            {q.isLoading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <ShieldCheck className="mb-2 h-8 w-8 text-emerald-500" />
                <p className="font-semibold text-slate-900">{f.status === "PENDING" ? "Queue is clear" : "No documents"}</p>
                <p className="text-sm text-slate-500">{f.status === "PENDING" ? "No documents are waiting for review." : "Nothing to show here yet."}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100" role="listbox" aria-label="KYC documents">
                {docs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={d.id === selectedId}
                      onClick={() => setSelectedId(d.id)}
                      className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-slate-50", d.id === selectedId && "bg-brand-50/60 ring-1 ring-inset ring-brand-200")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{d.user.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {d.docType.replace(/_/g, " ")} · <span className="font-mono">{d.docNumberMasked}</span>
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">{fromNow(d.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.data && q.data.meta.totalPages > 1 && <TableFooter meta={q.data.meta} onPageChange={(p) => setF({ page: String(p) })} />}
          </div>
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <Panel
              title={
                <span className="flex items-center gap-2">
                  {selected.docType.replace(/_/g, " ")} <StatusPill status={selected.status} />
                </span>
              }
              action={<Link to={`/admin/users/${selected.userId}`} className="link text-xs">Open user profile</Link>}
            >
              <KeyValue
                cols={3}
                items={[
                  { label: "Name", value: selected.user.name },
                  { label: "Email", value: selected.user.email },
                  { label: "Phone", value: selected.user.phone },
                  { label: "Document no.", value: <Mono>{selected.docNumberMasked}</Mono> },
                  { label: "Submitted", value: fmtDateTime(selected.createdAt) },
                  { label: "Reviewed", value: selected.reviewedAt ? fmtDateTime(selected.reviewedAt) : "—" },
                ]}
              />
              {selected.rejectionReason && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Rejected: {selected.rejectionReason}</p>}
              <div className="mt-4">
                {selected.hasFile ? <KycDocumentPreview key={selected.id} docId={selected.id} className="h-[52vh]" /> : <p className="rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-500">No file attached.</p>}
              </div>
              <p className="mt-2 text-xs text-slate-500">Check that the name matches the account and the document is legible, unexpired and unedited. Views are audited.</p>
              {selected.status === "PENDING" && (
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button variant="outline" icon={<X className="h-4 w-4" />} onClick={() => setRejecting(true)} disabled={review.isPending}>
                    Reject
                  </Button>
                  <Button icon={<Check className="h-4 w-4" />} loading={review.isPending && !rejecting} onClick={() => review.mutate({ id: selected.id, approve: true })}>
                    Approve & verify
                  </Button>
                </div>
              )}
            </Panel>
          ) : (
            <div className="card flex h-full min-h-60 items-center justify-center p-6 text-sm text-slate-500">Select a document to review</div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject document"
        description="The user is notified with your reason and asked to upload a clearer copy."
        confirmLabel="Reject"
        reason
        reasonRequired
        reasonPlaceholder="e.g. Photo is blurred — document number not readable"
        loading={review.isPending}
        onConfirm={(reason) => selected && review.mutate({ id: selected.id, approve: false, reason })}
      />
    </div>
  );
}
