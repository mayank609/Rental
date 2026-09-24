/** Dispute queue with age / SLA indicator (48h response promise). */
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Gavel } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { Tabs } from "@/components/ui";
import { Mono, PageHeader, StatusPill } from "@/components/admin/AdminUi";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { useUrlFilters } from "@/components/admin/hooks";
import { DISPUTE_SLA_HOURS, SlaIndicator } from "@/components/admin/SlaIndicator";
import type { AdminDisputeRow, PageMeta } from "@/components/admin/types";

const TABS = [
  { value: "OPEN,UNDER_REVIEW", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "REJECTED", label: "Rejected" },
] as const;

export default function AdminDisputesPage() {
  const navigate = useNavigate();
  const [f, setF] = useUrlFilters({ status: "OPEN,UNDER_REVIEW", page: "1" });
  const isOpenTab = f.status === "OPEN,UNDER_REVIEW";
  const q = useQuery({
    queryKey: ["admin", "disputes", f],
    queryFn: async () => (await api.get<{ disputes: AdminDisputeRow[]; meta: PageMeta }>("/admin/disputes", { params: f })).data,
    placeholderData: keepPreviousData,
  });

  const columns: Column<AdminDisputeRow>[] = [
    { key: "age", header: isOpenTab ? "Age / SLA" : "Opened", sort: (d) => d.createdAt, cell: (d) => <SlaIndicator createdAt={d.createdAt} open={d.status === "OPEN" || d.status === "UNDER_REVIEW"} /> },
    { key: "booking", header: "Booking", sort: (d) => d.booking.code, cell: (d) => <div><Mono className="font-semibold text-slate-900">{d.booking.code}</Mono><p className="max-w-[220px] truncate text-xs text-slate-500">{d.booking.listing.title}</p></div> },
    { key: "type", header: "Type", sort: (d) => d.type, cell: (d) => <span className="capitalize">{d.type.replace(/_/g, " ").toLowerCase()}</span> },
    { key: "parties", header: "Raised by → against", hideBelow: "md", cell: (d) => <span className="text-xs">{d.raisedBy.name} → {d.against.name}</span> },
    { key: "claim", header: "Claim", align: "right", sort: (d) => d.claimAmount, cell: (d) => <span className="tabular-nums">{d.claimAmount ? money(d.claimAmount) : "—"}</span> },
    { key: "deposit", header: "Deposit", align: "right", hideBelow: "lg", sort: (d) => d.booking.depositAmount, cell: (d) => <span className="tabular-nums text-slate-500">{money(d.booking.depositAmount)}</span> },
    { key: "evidence", header: "Evidence", align: "center", hideBelow: "sm", sort: (d) => d._count.evidence, cell: (d) => d._count.evidence },
    { key: "status", header: "Status", sort: (d) => d.status, cell: (d) => <StatusPill status={d.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Disputes" subtitle={`Oldest first. We promise users a response within ${DISPUTE_SLA_HOURS} hours.`} />
      <Tabs className="mb-4" value={f.status} onChange={(v) => setF({ status: v })} tabs={TABS.map((t) => ({ ...t, count: t.value === f.status && isOpenTab ? q.data?.meta.total : undefined }))} />
      <DataTable
        caption="Disputes"
        columns={columns}
        rows={q.data?.disputes}
        rowKey={(d) => d.id}
        loading={q.isLoading}
        onRowClick={(d) => navigate(`/admin/disputes/${d.id}`)}
        rowClassName={(d) => (d.status === "OPEN" && Date.now() - new Date(d.createdAt).getTime() > DISPUTE_SLA_HOURS * 3_600_000 ? "bg-red-50/40" : undefined)}
        meta={q.data?.meta}
        onPageChange={(p) => setF({ page: String(p) })}
        empty={{ title: isOpenTab ? "No open disputes" : "Nothing here", description: isOpenTab ? "All caught up." : undefined, icon: <Gavel className="h-5 w-5" /> }}
      />
    </div>
  );
}
