/**
 * Owner payouts: totals per status, filterable table and ADMIN-only
 * actions (hold / release / retry / cancel, "run payouts now").
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Banknote, Pause, Play, PlayCircle, RefreshCw, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { Button } from "@/components/ui";
import { AdminOnly, FilterBar, FilterSelect, PageHeader, StatusPill } from "@/components/admin/AdminUi";
import { CellActions, DataTable, type Column } from "@/components/admin/DataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { cleanParams, useAdminMutation, useUrlFilters } from "@/components/admin/hooks";
import type { GroupTotal, PageMeta, PayoutRow } from "@/components/admin/types";

const STATUSES = ["PENDING", "ON_HOLD", "SCHEDULED", "PROCESSING", "PAID", "FAILED", "CANCELLED"];
type PayoutAction = "hold" | "release" | "retry" | "cancel";

/** Which actions make sense for each status. */
const ACTIONS_FOR: Record<string, PayoutAction[]> = {
  PENDING: ["hold", "cancel"],
  SCHEDULED: ["hold", "cancel"],
  ON_HOLD: ["release", "cancel"],
  FAILED: ["retry", "hold", "cancel"],
};
const ACTION_UI: Record<PayoutAction, { label: string; icon: React.ReactNode; variant: "outline" | "danger" }> = {
  hold: { label: "Hold", icon: <Pause className="h-3.5 w-3.5" />, variant: "outline" },
  release: { label: "Release", icon: <Play className="h-3.5 w-3.5" />, variant: "outline" },
  retry: { label: "Retry", icon: <RefreshCw className="h-3.5 w-3.5" />, variant: "outline" },
  cancel: { label: "Cancel", icon: <XCircle className="h-3.5 w-3.5" />, variant: "danger" },
};

export default function AdminPayoutsPage() {
  const [f, setF] = useUrlFilters({ status: "", page: "1" });
  const [confirm, setConfirm] = useState<{ payout: PayoutRow; action: PayoutAction } | null>(null);
  const [runOpen, setRunOpen] = useState(false);

  const q = useQuery({
    queryKey: ["admin", "payouts", f],
    queryFn: async () => (await api.get<{ payouts: PayoutRow[]; totals: GroupTotal[]; meta: PageMeta }>("/admin/payouts", { params: cleanParams(f) })).data,
    placeholderData: keepPreviousData,
  });

  const act = useAdminMutation<{ id: string; action: PayoutAction }>({
    fn: ({ id, action }) => api.post(`/admin/payouts/${id}/${action}`),
    invalidate: [["admin", "payouts"]],
    success: (_d, v) => `Payout ${{ hold: "put on hold", release: "released", retry: "queued for retry", cancel: "cancelled" }[v.action]}`,
    onSuccess: () => setConfirm(null),
  });
  const runNow = useAdminMutation<void, { owners: number; paid: number }>({
    fn: async () => (await api.post("/admin/payouts-run")).data,
    invalidate: [["admin", "payouts"]],
    success: (d) => `Payout run complete — ${d.paid} of ${d.owners} owner(s) paid`,
    onSuccess: () => setRunOpen(false),
  });

  const totals = q.data?.totals ?? [];
  const columns: Column<PayoutRow>[] = [
    { key: "owner", header: "Owner", sort: (p) => p.owner.name, cell: (p) => <Link to={`/admin/users/${p.owner.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">{p.owner.name}</Link> },
    { key: "kyc", header: "KYC", hideBelow: "sm", sort: (p) => p.owner.kycStatus, cell: (p) => <StatusPill status={p.owner.kycStatus} /> },
    { key: "booking", header: "Booking", hideBelow: "md", cell: (p) => (p.booking ? <Link to={`/admin/bookings/${p.booking.id}`} className="font-mono text-xs hover:text-brand-700">{p.booking.code}</Link> : "—") },
    {
      key: "amount", header: "Amount", align: "right", sort: (p) => p.amount,
      cell: (p) => <span className={clsx("font-semibold tabular-nums", p.amount < 0 ? "text-red-700" : "text-slate-900")} title={p.amount < 0 ? "Penalty — deducted from future payouts" : undefined}>{money(p.amount)}</span>,
    },
    { key: "status", header: "Status", sort: (p) => p.status, cell: (p) => <StatusPill status={p.status} /> },
    { key: "scheduled", header: "Scheduled", hideBelow: "lg", sort: (p) => p.scheduledFor ?? "", cell: (p) => (p.scheduledFor ? <span className="whitespace-nowrap text-xs">{fmtDateTime(p.scheduledFor)}</span> : "—") },
    { key: "paid", header: "Paid", hideBelow: "lg", sort: (p) => p.paidAt ?? "", cell: (p) => (p.paidAt ? <span className="whitespace-nowrap text-xs">{fmtDate(p.paidAt)}</span> : "—") },
    { key: "note", header: "Note", hideBelow: "md", cell: (p) => <span className="block max-w-[220px] truncate text-xs text-slate-500" title={[p.note, p.failureReason].filter(Boolean).join(" — ")}>{p.failureReason ? <span className="text-red-700">{p.failureReason}</span> : p.note ?? ""}</span> },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      cell: (p) => (
        <CellActions>
          {(ACTIONS_FOR[p.status] ?? []).map((a) => (
            <AdminOnly key={a} reason="Only administrators can move money">
              <Button variant={ACTION_UI[a].variant === "danger" ? "ghost" : "outline"} size="sm" className={clsx("h-8 px-2", a === "cancel" && "text-red-600")} icon={ACTION_UI[a].icon} onClick={() => (a === "cancel" || a === "hold" ? setConfirm({ payout: p, action: a }) : act.mutate({ id: p.id, action: a }))}>
                {ACTION_UI[a].label}
              </Button>
            </AdminOnly>
          ))}
        </CellActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payouts"
        subtitle="Owner earnings released after rentals complete. Negative amounts are penalties netted against future payouts."
        actions={
          <AdminOnly reason="Only administrators can run payouts">
            <Button size="sm" icon={<PlayCircle className="h-4 w-4" />} onClick={() => setRunOpen(true)}>
              Run payouts now
            </Button>
          </AdminOnly>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {STATUSES.map((s) => {
          const t = totals.find((x) => x.status === s);
          const active = f.status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setF({ status: active ? "" : s })}
              aria-pressed={active}
              className={clsx("card p-3 text-left transition hover:border-brand-300", active && "border-brand-500 ring-2 ring-brand-100")}
            >
              <StatusPill status={s} />
              <p className="mt-1.5 text-base font-bold tabular-nums leading-tight text-slate-900">{money(t?._sum.amount ?? 0)}</p>
              <p className="text-xs text-slate-500">{t?._count ?? 0} payouts</p>
            </button>
          );
        })}
      </div>

      <FilterBar>
        <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ status: v })} options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() }))]} />
      </FilterBar>
      <DataTable
        caption="Payouts"
        columns={columns}
        rows={q.data?.payouts}
        rowKey={(p) => p.id}
        loading={q.isLoading}
        meta={q.data?.meta}
        onPageChange={(p) => setF({ page: String(p) })}
        empty={{ title: "No payouts", icon: <Banknote className="h-5 w-5" /> }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.action === "cancel" ? "Cancel payout" : "Hold payout"}
        description={
          confirm && (
            <>
              {confirm.action === "cancel" ? "Cancel" : "Hold"} the <b>{money(confirm.payout.amount)}</b> payout to <b>{confirm.payout.owner.name}</b>?{" "}
              {confirm.action === "cancel" ? "The owner will not be paid for this item. This can't be undone." : "It won't be sent until released."}
            </>
          )
        }
        confirmLabel={confirm?.action === "cancel" ? "Cancel payout" : "Hold payout"}
        tone={confirm?.action === "cancel" ? "danger" : "primary"}
        loading={act.isPending}
        onConfirm={() => confirm && act.mutate({ id: confirm.payout.id, action: confirm.action })}
      />
      <ConfirmDialog
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="Run payouts now"
        tone="primary"
        confirmLabel="Run payouts"
        loading={runNow.isPending}
        onConfirm={() => runNow.mutate()}
        description="Process all scheduled and failed payouts that are due. Owners without verified payout details are put on hold automatically."
      />
    </div>
  );
}
