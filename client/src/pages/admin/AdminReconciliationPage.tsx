/**
 * Finance reconciliation (ADMIN): gateway captures vs ledger, mismatches,
 * pending refunds, failed webhooks, grouped totals, a manual reconcile run
 * and CSV exports for accounting.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { AlertTriangle, CheckCircle2, Lock, PlayCircle } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { fmtDate, money } from "@/lib/format";
import { Button, Skeleton } from "@/components/ui";
import { ErrorPanel, KpiCard, Mono, PageHeader, Panel, StatusPill } from "@/components/admin/AdminUi";
import { ServerExportButton } from "@/components/admin/CsvExportButton";
import { useAdminMutation, useUrlFilters } from "@/components/admin/hooks";
import type { ReconcileRunResult, ReconciliationReport } from "@/components/admin/types";

const EXPORTS = ["bookings", "payments", "payouts", "users", "listings", "ledger"] as const;
const today = () => format(new Date(), "yyyy-MM-dd");

/** yyyy-MM-dd (local) → ISO range bounds; `to` is inclusive of the whole day. */
const toIsoRange = (from: string, to: string) => ({
  from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
  to: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString() : undefined,
});

export default function AdminReconciliationPage() {
  const { isAdmin } = useAuth();
  const [f, setF] = useUrlFilters({ from: format(subDays(new Date(), 30), "yyyy-MM-dd"), to: today() });
  const [run, setRun] = useState<ReconcileRunResult | null>(null);
  const range = toIsoRange(f.from, f.to);

  const q = useQuery({
    queryKey: ["admin", "reconciliation", range],
    queryFn: async () => (await api.get<ReconciliationReport>("/admin/reconciliation", { params: range })).data,
    enabled: isAdmin,
  });
  const reconcile = useAdminMutation<void, ReconcileRunResult>({
    fn: async () => (await api.post("/admin/reconciliation/run")).data,
    invalidate: [["admin", "reconciliation"], ["admin", "payments"], ["admin", "webhooks"]],
    success: "Reconciliation run complete",
    onSuccess: setRun,
  });

  if (!isAdmin)
    return (
      <div>
        <PageHeader title="Reconciliation" />
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-sm text-slate-600">
          <Lock className="h-6 w-6 text-slate-400" />
          Financial reconciliation and exports are restricted to administrators.
        </div>
      </div>
    );

  const r = q.data;
  const c = r?.checks;
  const diff = c ? c.capturedTotal - c.ledgerReceived : 0;

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        subtitle="Match gateway payments with the internal ledger, refunds and payouts."
        actions={
          <Button size="sm" icon={<PlayCircle className="h-4 w-4" />} loading={reconcile.isPending} onClick={() => reconcile.mutate()}>
            Run reconciliation now
          </Button>
        }
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="text-xs font-medium text-slate-600">
          From
          <input type="date" className="input mt-1 h-9 py-1.5" value={f.from} max={f.to} onChange={(e) => setF({ from: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          To
          <input type="date" className="input mt-1 h-9 py-1.5" value={f.to} min={f.from} max={today()} onChange={(e) => setF({ to: e.target.value })} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" className="chip px-2.5 py-1 text-xs" onClick={() => setF({ from: format(subDays(new Date(), d), "yyyy-MM-dd"), to: today() })}>
              Last {d}d
            </button>
          ))}
        </div>
      </div>

      {run && (
        <div className="mb-4 rounded-xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-inset ring-sky-200">
          <p className="font-semibold">Last run result</p>
          <p className="mt-1">
            Checked <b>{run.checked}</b> stale payment(s), recovered <b>{run.recovered}</b>, retried <b>{run.webhooksRetried}</b> webhook(s) and <b>{run.refundsRetried}</b> refund(s).
          </p>
        </div>
      )}

      {q.isError ? (
        <ErrorPanel message={apiError(q.error)} onRetry={() => q.refetch()} />
      ) : !r || !c ? (
        <div className="space-y-4">
          <Skeleton className="h-20" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {c.balanced ? (
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <div>
                <p className="font-semibold">Books are balanced</p>
                <p className="text-sm">Every captured payment between {fmtDate(r.period.from)} and {fmtDate(r.period.to)} has a matching ledger entry.</p>
              </div>
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-red-900 ring-1 ring-inset ring-red-200">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <div>
                <p className="font-semibold">Unbalanced — {money(Math.abs(diff))} {diff > 0 ? "captured but not in ledger" : "in ledger but not captured"}</p>
                <p className="text-sm">{c.mismatchedPayments.length} payment(s) are missing ledger entries. Run reconciliation or investigate below.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Captured (gateway)" value={money(c.capturedTotal)} />
            <KpiCard label="Received (ledger)" value={money(c.ledgerReceived)} sub={diff !== 0 ? <span className="font-semibold text-red-700">Δ {money(diff)}</span> : "matches"} />
            <KpiCard label="Pending / failed refunds" value={c.pendingRefunds} sub={c.pendingRefunds ? <Link to="/admin/payments" className="link">Review payments</Link> : "all processed"} />
            <KpiCard label="Failed webhooks" value={c.failedWebhooks} sub={c.failedWebhooks ? <Link to="/admin/payments?tab=webhooks&status=FAILED" className="link">Review webhooks</Link> : "none"} />
          </div>

          {c.mismatchedPayments.length > 0 && (
            <Panel title={`Mismatched payments (${c.mismatchedPayments.length})`} className="mt-4" padded={false}>
              <ul className="divide-y divide-slate-100">
                {c.mismatchedPayments.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <Link to={`/admin/payments?q=${m.id}`} className="link font-mono text-xs">{m.id}</Link>
                    <Mono className="hidden sm:inline">{m.providerOrderId}</Mono>
                    <span className="ml-auto font-semibold tabular-nums">{money(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <GroupTable
              title="Payments"
              head={["Status", "Purpose", "Count", "Amount", "Refunded"]}
              rows={r.payments.map((p) => [<StatusPill key="s" status={p.status} />, <span key="p" className="capitalize">{p.purpose.toLowerCase().replace("_", " ")}</span>, p._count, money(p._sum.amount ?? 0), money(p._sum.refundedAmount ?? 0)])}
              total={["Total", "", r.payments.reduce((s, p) => s + p._count, 0), money(r.payments.reduce((s, p) => s + (p._sum.amount ?? 0), 0)), money(r.payments.reduce((s, p) => s + (p._sum.refundedAmount ?? 0), 0))]}
            />
            <GroupTable
              title="Ledger by account"
              head={["Account", "Net amount"]}
              rows={r.ledger.map((l) => [<Mono key="a" className="text-slate-800">{l.account}</Mono>, <span key="v" className={(l._sum.amount ?? 0) < 0 ? "text-red-700" : ""}>{money(l._sum.amount ?? 0)}</span>])}
            />
            <GroupTable
              title="Refunds"
              head={["Status", "Count", "Amount"]}
              rows={r.refunds.map((x) => [<StatusPill key="s" status={x.status} />, x._count, money(x._sum.amount ?? 0)])}
              total={["Total", r.refunds.reduce((s, x) => s + x._count, 0), money(r.refunds.reduce((s, x) => s + (x._sum.amount ?? 0), 0))]}
            />
            <GroupTable
              title="Payouts"
              head={["Status", "Count", "Amount"]}
              rows={r.payouts.map((x) => [<StatusPill key="s" status={x.status} />, x._count, money(x._sum.amount ?? 0)])}
              total={["Total", r.payouts.reduce((s, x) => s + x._count, 0), money(r.payouts.reduce((s, x) => s + (x._sum.amount ?? 0), 0))]}
            />
          </div>
        </>
      )}

      <Panel title="CSV exports" className="mt-4">
        <p className="mb-3 text-sm text-slate-600">Downloads records created in the selected date range (amounts in ₹). Exports are audited.</p>
        <div className="flex flex-wrap gap-2">
          {EXPORTS.map((e) => (
            <ServerExportButton key={e} entity={e} from={range.from} to={range.to} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function GroupTable({ title, head, rows, total }: { title: string; head: string[]; rows: React.ReactNode[][]; total?: React.ReactNode[] }) {
  return (
    <Panel title={title} padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              {head.map((h, i) => (
                <th key={h} className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={head.length} className="px-4 py-6 text-center text-slate-400">No records in this period</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {r.map((cell, j) => (
                  <td key={j} className={`px-4 py-2 tabular-nums ${j === 0 ? "text-left" : "text-right"}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && rows.length > 1 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60 font-semibold">
                {total.map((cell, j) => (
                  <td key={j} className={`px-4 py-2 tabular-nums ${j === 0 ? "text-left" : "text-right"}`}>{cell}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Panel>
  );
}
