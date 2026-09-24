/**
 * Cities are created automatically from listing addresses. Admins can
 * rename them (e.g. fix "Bengaluru Urban") or hide them from public pages.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, Pencil, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { fmtDate } from "@/lib/format";
import { Button, Toggle } from "@/components/ui";
import { AdminOnly, FilterBar, Mono, PageHeader, ReadOnlyNotice, SearchInput, StatusPill } from "@/components/admin/AdminUi";
import { CellActions, DataTable, type Column } from "@/components/admin/DataTable";
import { CsvExportButton } from "@/components/admin/CsvExportButton";
import { useAdminMutation } from "@/components/admin/hooks";
import type { AdminCity } from "@/components/admin/types";

export default function AdminCitiesPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const q = useQuery({ queryKey: ["admin", "cities"], queryFn: async () => (await api.get<{ cities: AdminCity[] }>("/admin/cities")).data.cities });

  const update = useAdminMutation<{ id: string; body: { isActive?: boolean; name?: string } }>({
    fn: ({ id, body }) => api.patch(`/admin/cities/${id}`, body),
    invalidate: [["admin", "cities"]],
    success: (_d, v) => (v.body.name ? "City renamed" : v.body.isActive ? "City activated" : "City hidden"),
    onSuccess: () => setRenaming(null),
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((c) => !s || c.name.toLowerCase().includes(s) || c.slug.includes(s) || (c.state ?? "").toLowerCase().includes(s));
  }, [q.data, search]);

  const columns: Column<AdminCity>[] = [
    {
      key: "name", header: "City", sort: (c) => c.name,
      cell: (c) =>
        renaming?.id === c.id ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming.name.trim().length >= 2) update.mutate({ id: c.id, body: { name: renaming.name.trim() } });
            }}
          >
            <input className="input h-8 max-w-[200px] py-1" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} autoFocus aria-label="City name" />
            <Button type="submit" variant="ghost" size="sm" className="h-8 px-2 text-emerald-700" loading={update.isPending} aria-label="Save name"><Check className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => setRenaming(null)} aria-label="Cancel rename"><X className="h-4 w-4" /></Button>
          </form>
        ) : (
          <div>
            <p className="font-medium text-slate-900">{c.name}</p>
            <Mono className="text-slate-400">/{c.slug}</Mono>
          </div>
        ),
    },
    { key: "state", header: "State", hideBelow: "sm", sort: (c) => c.state ?? "", cell: (c) => c.state ?? "—" },
    { key: "listings", header: "Listings", align: "right", sort: (c) => c.listingCount, cell: (c) => <span className="tabular-nums">{c.listingCount}</span> },
    { key: "localities", header: "Localities", align: "right", sort: (c) => c._count.localities, cell: (c) => <span className="tabular-nums">{c._count.localities}</span> },
    { key: "coords", header: "Centre", hideBelow: "lg", cell: (c) => <Mono>{c.lat.toFixed(3)}, {c.lng.toFixed(3)}</Mono> },
    { key: "created", header: "Created", hideBelow: "md", sort: (c) => c.createdAt, cell: (c) => fmtDate(c.createdAt) },
    { key: "status", header: "Status", sort: (c) => (c.isActive ? 1 : 0), cell: (c) => <StatusPill status={c.isActive ? "ACTIVE" : "PAUSED"} /> },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      cell: (c) => (
        <CellActions>
          <AdminOnly hide>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setRenaming({ id: c.id, name: c.name })} aria-label={`Rename ${c.name}`}>
              <Pencil className="h-4 w-4" />
            </Button>
          </AdminOnly>
          <AdminOnly hide>
            <Toggle label={<span className="sr-only">Active</span>} checked={c.isActive} onChange={(v) => update.mutate({ id: c.id, body: { isActive: v } })} />
          </AdminOnly>
        </CellActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cities"
        subtitle="Created automatically when owners list in a new city. Hidden cities disappear from city pages and the sitemap."
        actions={<CsvExportButton rows={rows.map((c) => ({ name: c.name, slug: c.slug, state: c.state, listings: c.listingCount, localities: c._count.localities, active: c.isActive, lat: c.lat, lng: c.lng }))} filename="cities.csv" />}
      />
      {!isAdmin && <ReadOnlyNotice />}
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Filter cities" />
        <span className="text-xs text-slate-500">{rows.length} cities</span>
      </FilterBar>
      <DataTable caption="Cities" columns={columns} rows={rows} rowKey={(c) => c.id} loading={q.isLoading} initialSort={{ key: "listings", dir: "desc" }} empty={{ title: "No cities", icon: <Building2 className="h-5 w-5" /> }} />
    </div>
  );
}
