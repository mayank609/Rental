/** Audit log explorer with expandable before/after JSON. */
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { FilterBar, FilterSelect, Mono, PageHeader, SearchInput } from "@/components/admin/AdminUi";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { cleanParams, useUrlFilters } from "@/components/admin/hooks";
import type { AuditLogRow, PageMeta } from "@/components/admin/types";

const ENTITY_TYPES = ["User", "Listing", "Booking", "Payment", "Payout", "Dispute", "KycDocument", "Report", "Flag", "Review", "Category", "PlatformSetting", "Export", "System"];

/** Deep link to the admin page for an audited entity, when one exists. */
function entityLink(type: string, id: string) {
  switch (type) {
    case "User": return `/admin/users/${id}`;
    case "Booking": return `/admin/bookings/${id}`;
    case "Dispute": return `/admin/disputes/${id}`;
    case "Listing": return `/admin/listings?tab=all&q=${id}`;
    case "Payment": return `/admin/payments?q=${id}`;
    default: return null;
  }
}

export default function AdminAuditPage() {
  const [f, setF] = useUrlFilters({ q: "", entityType: "", entityId: "", page: "1" });
  const q = useQuery({
    queryKey: ["admin", "audit", f],
    queryFn: async () => (await api.get<{ logs: AuditLogRow[]; meta: PageMeta }>("/admin/audit-logs", { params: cleanParams({ ...f, limit: 50 }) })).data,
    placeholderData: keepPreviousData,
  });

  const columns: Column<AuditLogRow>[] = [
    { key: "time", header: "Time", sort: (a) => a.createdAt, cell: (a) => <span className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</span> },
    { key: "actor", header: "Actor", sort: (a) => a.actor?.name ?? "", cell: (a) => (a.actor ? <Link to={`/admin/users/${a.actor.id}`} className="hover:text-brand-700" onClick={(e) => e.stopPropagation()}>{a.actor.name}</Link> : <span className="text-slate-400">System</span>) },
    { key: "action", header: "Action", sort: (a) => a.action, cell: (a) => <Mono className="font-semibold text-slate-800">{a.action}</Mono> },
    {
      key: "entity", header: "Entity",
      cell: (a) => {
        const link = entityLink(a.entityType, a.entityId);
        return (
          <span className="flex items-center gap-1.5 text-xs">
            <button type="button" className="font-medium text-slate-700 hover:text-brand-700" onClick={(e) => { e.stopPropagation(); setF({ entityType: a.entityType }); }} title="Filter by type">
              {a.entityType}
            </button>
            {link ? (
              <Link to={link} className="font-mono text-slate-500 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>{a.entityId.slice(0, 14)}</Link>
            ) : (
              <Mono className="text-slate-400">{a.entityId.slice(0, 14)}</Mono>
            )}
          </span>
        );
      },
    },
    { key: "ip", header: "IP", hideBelow: "lg", cell: (a) => <Mono>{a.ip ?? "—"}</Mono> },
  ];

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every staff action and sensitive access, newest first. Expand a row for before/after values." />
      <FilterBar>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Action contains… (e.g. refund)" />
        <FilterSelect label="Entity" value={f.entityType} onChange={(v) => setF({ entityType: v })} options={[{ value: "", label: "All entities" }, ...ENTITY_TYPES.map((t) => ({ value: t, label: t }))]} />
        <SearchInput value={f.entityId} onChange={(v) => setF({ entityId: v })} placeholder="Entity ID" className="sm:max-w-[220px]" />
      </FilterBar>
      <DataTable
        caption="Audit log"
        columns={columns}
        rows={q.data?.logs}
        rowKey={(a) => a.id}
        loading={q.isLoading}
        expand={(a) => (
          <div className="grid gap-3 md:grid-cols-2">
            <JsonViewer label="Before" value={a.before} />
            <JsonViewer label="After" value={a.after} />
          </div>
        )}
        canExpand={(a) => a.before != null || a.after != null}
        meta={q.data?.meta}
        onPageChange={(p) => setF({ page: String(p) })}
        empty={{ title: "No audit entries", icon: <ScrollText className="h-5 w-5" /> }}
      />
    </div>
  );
}
