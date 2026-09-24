/**
 * Trust & safety: user reports and automated risk flags. Staff can action
 * or dismiss items and quickly suspend the offending user.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, Flag, PauseCircle, ShieldAlert, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime, fromNow } from "@/lib/format";
import { Badge, Button, Tabs } from "@/components/ui";
import { FilterBar, FilterSelect, Mono, PageHeader, SeverityPill, StatusPill } from "@/components/admin/AdminUi";
import { CellActions, DataTable, type Column } from "@/components/admin/DataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { useAdminMutation, useUrlFilters } from "@/components/admin/hooks";
import type { FlagRow, PageMeta, ReportRow } from "@/components/admin/types";

const STATUS_OPTS = [
  { value: "OPEN", label: "open" },
  { value: "ACTIONED", label: "actioned" },
  { value: "DISMISSED", label: "dismissed" },
];

type Resolve = { id: string; status: "ACTIONED" | "DISMISSED" };

export default function AdminTrustPage() {
  const [f, setF] = useUrlFilters({ tab: "reports", status: "OPEN", page: "1" });
  const [suspend, setSuspend] = useState<{ id: string; name: string } | null>(null);

  const reportsQ = useQuery({
    queryKey: ["admin", "reports", { status: f.status, page: f.page }],
    queryFn: async () => (await api.get<{ reports: ReportRow[]; meta: PageMeta }>("/admin/reports", { params: { status: f.status, page: f.page } })).data,
    enabled: f.tab === "reports",
    placeholderData: keepPreviousData,
  });
  const flagsQ = useQuery({
    queryKey: ["admin", "flags", { status: f.status, page: f.page }],
    queryFn: async () => (await api.get<{ flags: FlagRow[]; meta: PageMeta }>("/admin/flags", { params: { status: f.status, page: f.page } })).data,
    enabled: f.tab === "flags",
    placeholderData: keepPreviousData,
  });

  const resolveReport = useAdminMutation<Resolve>({
    fn: ({ id, status }) => api.post(`/admin/reports/${id}`, { status }),
    invalidate: [["admin", "reports"], ["admin", "dashboard"]],
    success: (_d, v) => (v.status === "ACTIONED" ? "Report marked actioned" : "Report dismissed"),
  });
  const resolveFlag = useAdminMutation<Resolve>({
    fn: ({ id, status }) => api.post(`/admin/flags/${id}`, { status }),
    invalidate: [["admin", "flags"], ["admin", "dashboard"], ["admin", "users"]],
    success: (_d, v) => (v.status === "ACTIONED" ? "Flag marked actioned" : "Flag dismissed"),
  });
  const suspendUser = useAdminMutation<{ id: string; reason: string }>({
    fn: ({ id, reason }) => api.patch(`/admin/users/${id}`, { status: "SUSPENDED", statusReason: reason }),
    invalidate: [["admin", "flags"], ["admin", "users"]],
    success: "User suspended",
    onSuccess: () => setSuspend(null),
  });

  const ResolveButtons = ({ id, onResolve, busy }: { id: string; onResolve: (r: Resolve) => void; busy: boolean }) => (
    <>
      <Button variant="ghost" size="sm" className="h-8 px-2" icon={<X className="h-3.5 w-3.5" />} disabled={busy} onClick={() => onResolve({ id, status: "DISMISSED" })}>
        Dismiss
      </Button>
      <Button variant="secondary" size="sm" className="h-8" icon={<Check className="h-3.5 w-3.5" />} disabled={busy} onClick={() => onResolve({ id, status: "ACTIONED" })}>
        Actioned
      </Button>
    </>
  );

  const reportColumns: Column<ReportRow>[] = [
    { key: "created", header: "Reported", sort: (r) => r.createdAt, cell: (r) => <span className="whitespace-nowrap text-xs" title={fmtDateTime(r.createdAt)}>{fromNow(r.createdAt)}</span> },
    { key: "target", header: "Target", sort: (r) => r.targetType, cell: (r) => <ReportTarget r={r} /> },
    { key: "reason", header: "Reason", sort: (r) => r.reason, cell: (r) => <div className="max-w-[320px]"><p className="font-medium text-slate-800">{r.reason.replace(/_/g, " ").toLowerCase()}</p>{r.details && <p className="line-clamp-2 text-xs text-slate-500">{r.details}</p>}</div> },
    { key: "reporter", header: "Reporter", hideBelow: "md", cell: (r) => <Link to={`/admin/users/${r.reporter.id}`} className="hover:text-brand-700">{r.reporter.name}</Link> },
    { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      cell: (r) => (
        <CellActions>
          {r.targetType === "USER" && r.status === "OPEN" && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-amber-700" icon={<PauseCircle className="h-3.5 w-3.5" />} onClick={() => setSuspend({ id: r.targetId, name: "the reported user" })}>
              Suspend
            </Button>
          )}
          {r.status === "OPEN" && <ResolveButtons id={r.id} onResolve={(v) => resolveReport.mutate(v)} busy={resolveReport.isPending} />}
        </CellActions>
      ),
    },
  ];

  const flagColumns: Column<FlagRow>[] = [
    { key: "severity", header: "Severity", sort: (fl) => fl.severity, cell: (fl) => <SeverityPill severity={fl.severity} /> },
    { key: "type", header: "Type", sort: (fl) => fl.type, cell: (fl) => <span className="font-medium capitalize text-slate-800">{fl.type.replace(/_/g, " ").toLowerCase()}</span> },
    {
      key: "subject", header: "Subject",
      cell: (fl) => (
        <div className="space-y-0.5">
          {fl.user && (
            <Link to={`/admin/users/${fl.user.id}`} className="flex items-center gap-1.5 hover:text-brand-700">
              {fl.user.name} {fl.user.status !== "ACTIVE" && <StatusPill status={fl.user.status} />}
            </Link>
          )}
          {fl.listing && <Link to={`/admin/listings?tab=all&q=${fl.listing.id}`} className="block max-w-[240px] truncate text-xs text-slate-500 hover:text-brand-700">{fl.listing.title}</Link>}
        </div>
      ),
    },
    { key: "created", header: "Raised", hideBelow: "sm", sort: (fl) => fl.createdAt, cell: (fl) => <span className="whitespace-nowrap text-xs" title={fmtDateTime(fl.createdAt)}>{fromNow(fl.createdAt)}</span> },
    { key: "status", header: "Status", cell: (fl) => <StatusPill status={fl.status} /> },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      cell: (fl) => (
        <CellActions>
          {fl.user && fl.user.status === "ACTIVE" && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-amber-700" icon={<PauseCircle className="h-3.5 w-3.5" />} onClick={() => setSuspend({ id: fl.user!.id, name: fl.user!.name })}>
              Suspend
            </Button>
          )}
          {fl.status === "OPEN" && <ResolveButtons id={fl.id} onResolve={(v) => resolveFlag.mutate(v)} busy={resolveFlag.isPending} />}
        </CellActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Reports & flags" subtitle="User reports and automated risk signals (cancellations, off-platform attempts, prohibited items…)." />
      <Tabs
        className="mb-4"
        value={f.tab}
        onChange={(v) => setF({ tab: v, status: "OPEN" })}
        tabs={[
          { value: "reports", label: <span className="inline-flex items-center gap-1.5"><Flag className="h-4 w-4" /> Reports</span>, count: f.tab === "reports" && f.status === "OPEN" ? reportsQ.data?.meta.total : undefined },
          { value: "flags", label: <span className="inline-flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" /> Flags</span>, count: f.tab === "flags" && f.status === "OPEN" ? flagsQ.data?.meta.total : undefined },
        ]}
      />
      <FilterBar>
        <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ status: v })} options={STATUS_OPTS} />
        {f.tab === "flags" && <span className="text-xs text-slate-500">Sorted by severity, newest first</span>}
      </FilterBar>

      {f.tab === "reports" ? (
        <DataTable
          caption="User reports"
          columns={reportColumns}
          rows={reportsQ.data?.reports}
          rowKey={(r) => r.id}
          loading={reportsQ.isLoading}
          meta={reportsQ.data?.meta}
          onPageChange={(p) => setF({ page: String(p) })}
          empty={{ title: f.status === "OPEN" ? "No open reports" : "No reports", icon: <Flag className="h-5 w-5" /> }}
        />
      ) : (
        <DataTable
          caption="Risk flags"
          columns={flagColumns}
          rows={flagsQ.data?.flags}
          rowKey={(fl) => fl.id}
          loading={flagsQ.isLoading}
          expand={(fl) => <JsonViewer label="Details" value={fl.details} />}
          canExpand={(fl) => Boolean(fl.details && Object.keys(fl.details).length)}
          rowClassName={(fl) => (fl.severity >= 3 && fl.status === "OPEN" ? "bg-red-50/40" : undefined)}
          meta={flagsQ.data?.meta}
          onPageChange={(p) => setF({ page: String(p) })}
          empty={{ title: f.status === "OPEN" ? "No open flags" : "No flags", icon: <ShieldAlert className="h-5 w-5" /> }}
        />
      )}

      <ConfirmDialog
        open={Boolean(suspend)}
        onClose={() => setSuspend(null)}
        title="Suspend user"
        description={<>Suspend <b>{suspend?.name}</b>? They'll be signed out and their active listings paused until reactivated from their profile.</>}
        confirmLabel="Suspend"
        reason
        reasonRequired
        reasonPlaceholder="e.g. Multiple reports of off-platform payment requests"
        loading={suspendUser.isPending}
        onConfirm={(reason) => suspend && suspendUser.mutate({ id: suspend.id, reason })}
      />
    </div>
  );
}

function ReportTarget({ r }: { r: ReportRow }) {
  const badge = <Badge tone={r.targetType === "LISTING" ? "brand" : r.targetType === "USER" ? "amber" : "gray"}>{r.targetType.toLowerCase()}</Badge>;
  const link =
    r.targetType === "LISTING" ? `/admin/listings?tab=all&q=${r.targetId}` : r.targetType === "USER" ? `/admin/users/${r.targetId}` : null;
  return (
    <span className="flex items-center gap-2">
      {badge}
      {link ? (
        <Link to={link} className="link text-xs">
          Open {r.targetType.toLowerCase()}
        </Link>
      ) : (
        <Mono>{r.targetId.slice(0, 12)}…</Mono>
      )}
    </span>
  );
}
