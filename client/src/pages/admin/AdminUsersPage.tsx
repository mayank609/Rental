/** User directory with search + filters; rows open the user detail page. */
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Users } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fromNow } from "@/lib/format";
import { Avatar, Badge } from "@/components/ui";
import { FilterBar, FilterSelect, PageHeader, SearchInput, StatusPill } from "@/components/admin/AdminUi";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { cleanParams, useUrlFilters } from "@/components/admin/hooks";
import type { AdminUserRow, PageMeta } from "@/components/admin/types";

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [f, setF] = useUrlFilters({ q: "", status: "", role: "", kyc: "", flagged: "", page: "1" });
  const q = useQuery({
    queryKey: ["admin", "users", f],
    queryFn: async () => (await api.get<{ users: AdminUserRow[]; meta: PageMeta }>("/admin/users", { params: cleanParams({ ...f, flagged: f.flagged === "1" ? "true" : "" }) })).data,
    placeholderData: keepPreviousData,
  });

  const columns: Column<AdminUserRow>[] = [
    {
      key: "name", header: "User", sort: (u) => u.name,
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={u.name} src={u.avatarUrl} size={32} />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{u.name}</p>
            <p className="truncate text-xs text-slate-500">{[u.email, u.phone].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (u) => <StatusPill status={u.role} />, sort: (u) => u.role },
    { key: "status", header: "Status", cell: (u) => <StatusPill status={u.status} />, sort: (u) => u.status },
    { key: "kyc", header: "KYC", cell: (u) => <StatusPill status={u.kycStatus} />, sort: (u) => u.kycStatus, hideBelow: "sm" },
    {
      key: "counts", header: "Listings / rentals", align: "right", hideBelow: "md", sort: (u) => u.counts.listings + u.counts.rentals,
      cell: (u) => <span className="tabular-nums">{u.counts.listings} / {u.counts.rentals}</span>,
    },
    {
      key: "flags", header: "Flags", align: "center", sort: (u) => u.counts.flags,
      cell: (u) =>
        u.counts.flags ? (
          <Badge tone="red" icon={<AlertTriangle className="h-3 w-3" />}>{u.counts.flags}</Badge>
        ) : u.cancellationCount || u.offPlatformAttempts ? (
          <span className="text-xs text-slate-500" title="Cancellations / off-platform attempts">{u.cancellationCount}c · {u.offPlatformAttempts}o</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "login", header: "Last login", hideBelow: "lg", sort: (u) => u.lastLoginAt ?? "",
      cell: (u) => (u.lastLoginAt ? <span title={fmtDate(u.lastLoginAt)}>{fromNow(u.lastLoginAt)}</span> : <span className="text-slate-400">Never</span>),
    },
    { key: "joined", header: "Joined", hideBelow: "lg", sort: (u) => u.createdAt, cell: (u) => fmtDate(u.createdAt) },
  ];

  return (
    <div>
      <PageHeader title="Users" subtitle={q.data ? `${q.data.meta.total.toLocaleString("en-IN")} users match` : "Search and manage accounts"} />
      <FilterBar>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Name, email, phone or ID" />
        <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ status: v })} options={[{ value: "", label: "Any status" }, ...["ACTIVE", "SUSPENDED", "BANNED", "DELETED"].map((s) => ({ value: s, label: s.toLowerCase() }))]} />
        <FilterSelect label="Role" value={f.role} onChange={(v) => setF({ role: v })} options={[{ value: "", label: "Any role" }, ...["USER", "SUPPORT", "ADMIN"].map((s) => ({ value: s, label: s.toLowerCase() }))]} />
        <FilterSelect label="KYC" value={f.kyc} onChange={(v) => setF({ kyc: v })} options={[{ value: "", label: "Any KYC" }, ...["NONE", "PENDING", "VERIFIED", "REJECTED"].map((s) => ({ value: s, label: s.toLowerCase() }))]} />
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" checked={f.flagged === "1"} onChange={(e) => setF({ flagged: e.target.checked ? "1" : "" })} className="h-4 w-4 rounded border-slate-300" />
          Flagged only
        </label>
      </FilterBar>
      <DataTable
        caption="Users"
        columns={columns}
        rows={q.data?.users}
        rowKey={(u) => u.id}
        loading={q.isLoading}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
        meta={q.data?.meta}
        onPageChange={(p) => setF({ page: String(p) })}
        empty={{ title: "No users found", description: "Try a different search or clear the filters.", icon: <Users className="h-5 w-5" /> }}
      />
    </div>
  );
}
