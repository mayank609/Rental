/**
 * Admin dashboard: KPIs vs previous period, work queues, revenue mix and
 * (lazy-loaded) charts for GMV, city bookings, categories and funnel.
 */
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Flag, Gavel, IndianRupee, Package, ShieldCheck, ShoppingBag, TrendingUp, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { Skeleton } from "@/components/ui";
import { ErrorPanel, KpiCard, PageHeader, Panel, Segmented } from "@/components/admin/AdminUi";
import { useUrlFilters } from "@/components/admin/hooks";
import type { DashboardResponse } from "@/components/admin/types";

const DashboardCharts = lazy(() => import("@/components/admin/DashboardCharts"));

const RANGES = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "365", label: "1y" },
];

export default function AdminDashboardPage() {
  const [f, setF] = useUrlFilters({ days: "30" });
  const q = useQuery({
    queryKey: ["admin", "dashboard", f.days],
    queryFn: async () => (await api.get<DashboardResponse>("/admin/dashboard", { params: { days: f.days } })).data,
    placeholderData: (prev) => prev,
  });
  const d = q.data;
  const k = d?.kpis;
  const loading = q.isLoading;

  const queues = [
    { label: "Listings pending review", count: d?.queues.pendingListings, to: "/admin/listings?tab=queue", icon: Package },
    { label: "Open disputes", count: d?.queues.openDisputes, to: "/admin/disputes", icon: Gavel },
    { label: "Pending KYC", count: d?.queues.pendingKyc, to: "/admin/kyc", icon: ShieldCheck },
    { label: "Open trust flags", count: d?.queues.openFlags, to: "/admin/trust?tab=flags", icon: AlertTriangle },
    { label: "Open user reports", count: d?.queues.openReports, to: "/admin/trust", icon: Flag },
  ];

  const rb = d?.revenueBreakdown;
  const rbTotal = rb ? rb.bookingFees + rb.promotionsAndSubscriptions + rb.lateFees : 0;
  const rbRows = rb
    ? [
        { label: "Booking fees & commission", value: rb.bookingFees, cls: "bg-brand-600" },
        { label: "Promotions & subscriptions", value: rb.promotionsAndSubscriptions, cls: "bg-orange-500" },
        { label: "Late fee share", value: rb.lateFees, cls: "bg-sky-500" },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={d ? `Marketplace performance for the last ${d.period.days} days vs the previous ${d.period.days}` : "Marketplace performance"}
        actions={<Segmented label="Date range" value={f.days} onChange={(v) => setF({ days: v })} options={RANGES} />}
      />

      {q.isError && !d ? (
        <ErrorPanel message="Couldn't load dashboard metrics." onRetry={() => q.refetch()} />
      ) : (
        <div className={q.isFetching && !loading ? "opacity-70 transition" : "transition"}>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="GMV" icon={<IndianRupee className="h-4 w-4" />} loading={loading} value={money(k?.gmv)} delta={k?.gmvChange} />
            <KpiCard label="Platform revenue" icon={<TrendingUp className="h-4 w-4" />} loading={loading} value={money(k?.revenue)} delta={k?.revenueChange} />
            <KpiCard label="Paid bookings" icon={<ShoppingBag className="h-4 w-4" />} loading={loading} value={k?.bookings.toLocaleString("en-IN")} delta={k?.bookingsChange} />
            <KpiCard label="Avg booking value" icon={<IndianRupee className="h-4 w-4" />} loading={loading} value={money(k?.avgBookingValue)} sub="rent per paid booking" />
            <KpiCard label="Active users" icon={<Users className="h-4 w-4" />} loading={loading} value={k?.activeUsers.toLocaleString("en-IN")} sub="logged in this period" />
            <KpiCard label="New users" icon={<UserPlus className="h-4 w-4" />} loading={loading} value={k?.newUsers.toLocaleString("en-IN")} sub="signed up this period" />
            <KpiCard label="Total users" icon={<Users className="h-4 w-4" />} loading={loading} value={k?.totalUsers.toLocaleString("en-IN")} />
            <KpiCard label="Active listings" icon={<Package className="h-4 w-4" />} loading={loading} value={k?.activeListings.toLocaleString("en-IN")} />
          </div>

          {/* Work queues + revenue mix */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel title="Work queues" className="lg:col-span-2" padded={false}>
              <ul className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
                {queues.map(({ label, count, to, icon: Icon }) => (
                  <li key={label} className="sm:border-b sm:border-slate-100 sm:odd:border-r">
                    <Link to={to} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${count ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-400"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm font-medium text-slate-700">{label}</span>
                      {loading ? <Skeleton className="h-5 w-8" /> : <span className={`text-lg font-bold tabular-nums ${count ? "text-slate-900" : "text-slate-300"}`}>{count ?? 0}</span>}
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Revenue breakdown">
              {loading ? (
                <Skeleton className="h-32" />
              ) : (
                <>
                  <p className="text-2xl font-bold tabular-nums text-slate-900">{money(rbTotal)}</p>
                  <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    {rbRows.map((r) => r.value > 0 && <div key={r.label} className={r.cls} style={{ width: `${(r.value / Math.max(1, rbTotal)) * 100}%` }} />)}
                  </div>
                  <ul className="mt-4 space-y-2 text-sm">
                    {rbRows.map((r) => (
                      <li key={r.label} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-slate-600">
                          <span className={`h-2.5 w-2.5 rounded-full ${r.cls}`} />
                          {r.label}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-900">{money(r.value)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </div>

          {/* Charts (lazy) */}
          <div className="mt-4">
            {d ? (
              <Suspense fallback={<ChartsSkeleton />}>
                <DashboardCharts data={d} />
              </Suspense>
            ) : (
              <ChartsSkeleton />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Skeleton className="h-80 xl:col-span-2" />
      <Skeleton className="h-80" />
      <Skeleton className="h-80 xl:col-span-2" />
      <Skeleton className="h-80" />
    </div>
  );
}
