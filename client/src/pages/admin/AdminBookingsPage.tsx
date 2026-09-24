/** All bookings with multi-status filter and search by code / party name. */
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRange, money, STATUS_LABEL } from "@/lib/format";
import type { BookingStatus } from "@/lib/types";
import { ChipMultiSelect, FilterBar, Mono, PageHeader, SearchInput, StatusPill } from "@/components/admin/AdminUi";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { cleanParams, useUrlFilters } from "@/components/admin/hooks";
import type { AdminBookingRow, PageMeta } from "@/components/admin/types";

const STATUSES: BookingStatus[] = ["REQUESTED", "ACCEPTED", "CONFIRMED", "ACTIVE", "OVERDUE", "RETURNED", "COMPLETED", "DISPUTED", "CANCELLED", "DECLINED", "EXPIRED"];

export default function AdminBookingsPage() {
  const navigate = useNavigate();
  const [f, setF] = useUrlFilters({ q: "", status: "", page: "1" });
  const selected = f.status ? f.status.split(",") : [];
  const q = useQuery({
    queryKey: ["admin", "bookings", f],
    queryFn: async () => (await api.get<{ bookings: AdminBookingRow[]; meta: PageMeta }>("/admin/bookings", { params: cleanParams(f) })).data,
    placeholderData: keepPreviousData,
  });

  const columns: Column<AdminBookingRow>[] = [
    { key: "code", header: "Code", sort: (b) => b.code, cell: (b) => <Mono className="font-semibold text-slate-900">{b.code}</Mono> },
    { key: "listing", header: "Listing", sort: (b) => b.listing.title, cell: (b) => <span className="block max-w-[240px] truncate font-medium text-slate-800">{b.listing.title}</span> },
    { key: "city", header: "City", hideBelow: "md", sort: (b) => b.listing.city.name, cell: (b) => b.listing.city.name },
    { key: "renter", header: "Renter", hideBelow: "sm", sort: (b) => b.renter.name, cell: (b) => b.renter.name },
    { key: "owner", header: "Owner", hideBelow: "sm", sort: (b) => b.owner.name, cell: (b) => b.owner.name },
    { key: "dates", header: "Dates", hideBelow: "lg", sort: (b) => b.startAt, cell: (b) => <span className="whitespace-nowrap text-xs">{fmtRange(b.startAt, b.endAt)}</span> },
    { key: "status", header: "Status", sort: (b) => b.status, cell: (b) => <StatusPill status={b.status} kind="booking" /> },
    { key: "total", header: "Total", align: "right", sort: (b) => b.totalAmount, cell: (b) => <span className="tabular-nums font-medium">{money(b.totalAmount)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Bookings" subtitle={q.data ? `${q.data.meta.total.toLocaleString("en-IN")} bookings` : "Every rental on the platform"} />
      <FilterBar>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Code (RN-…), renter or owner" />
        <div className="w-full">
          <ChipMultiSelect values={selected} onChange={(v) => setF({ status: v.join(",") })} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s }))} />
        </div>
      </FilterBar>
      <DataTable
        caption="Bookings"
        columns={columns}
        rows={q.data?.bookings}
        rowKey={(b) => b.id}
        loading={q.isLoading}
        onRowClick={(b) => navigate(`/admin/bookings/${b.id}`)}
        meta={q.data?.meta}
        onPageChange={(p) => setF({ page: String(p) })}
        empty={{ title: "No bookings found", icon: <CalendarCheck className="h-5 w-5" /> }}
      />
    </div>
  );
}
