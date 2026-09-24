/**
 * Owner analytics (Owner Pro). Non-Pro users get an upsell card when the
 * API answers 403 PRO_REQUIRED.
 */
import { Suspense, lazy, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays, format, subDays } from "date-fns";
import { BarChart3, CalendarCheck, Check, Crown, Eye, Heart, TrendingUp, Wallet } from "lucide-react";
import { api, apiErrorCode } from "@/lib/api";
import { money } from "@/lib/format";
import { Seo } from "@/components/Seo";
import { ButtonLink, Card, EmptyState, Skeleton, Stat } from "@/components/ui";
import { ErrorState, PageHeader } from "@/components/dashboard/common";
import type { AnalyticsResponse } from "@/components/dashboard/types";
import type { DailyPoint } from "@/components/dashboard/AnalyticsCharts";

const AnalyticsCharts = lazy(() => import("@/components/dashboard/AnalyticsCharts"));
const RANGES = [7, 30, 90, 365] as const;

/** The API only returns days with activity; fill the gaps with zeros. */
function fillDays(daily: DailyPoint[], days: number): DailyPoint[] {
  const map = new Map(daily.map((d) => [d.date, d]));
  const start = subDays(new Date(), days - 1);
  return Array.from({ length: days }, (_, i) => {
    const key = format(addDays(start, i), "yyyy-MM-dd");
    return map.get(key) ?? { date: key, bookings: 0, earnings: 0 };
  });
}

export default function AnalyticsPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const q = useQuery({
    queryKey: ["analytics", days],
    queryFn: async () => (await api.get<AnalyticsResponse>("/users/me/analytics", { params: { days } })).data,
    placeholderData: keepPreviousData,
  });

  const totals = useMemo(() => {
    const p = q.data?.perListing ?? [];
    const sum = (k: "viewCount" | "wishlists" | "requests" | "paidBookings" | "earnings") => p.reduce((a, l) => a + l[k], 0);
    const views = sum("viewCount");
    return { views, wishlists: sum("wishlists"), requests: sum("requests"), paid: sum("paidBookings"), earnings: sum("earnings"), conversion: views ? Math.round((sum("paidBookings") / views) * 1000) / 10 : 0 };
  }, [q.data]);
  const daily = useMemo(() => fillDays(q.data?.daily ?? [], q.data?.days ?? days), [q.data, days]);

  if (q.isError && apiErrorCode(q.error) === "PRO_REQUIRED") return <ProUpsell />;

  return (
    <div>
      <Seo title="Analytics" noindex />
      <PageHeader
        title="Analytics"
        subtitle="See how renters discover and book your items."
        action={
          <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setDays(r)} aria-pressed={days === r} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${days === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                {r === 365 ? "1y" : `${r}d`}
              </button>
            ))}
          </div>
        }
      />

      {q.isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <div className={`space-y-6 transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <Stat label="Listing views" value={totals.views.toLocaleString("en-IN")} sub="All time" icon={<Eye className="h-5 w-5" />} tone="brand" />
            <Stat label={`Requests (${days}d)`} value={totals.requests} sub={`${totals.wishlists} wishlist saves`} icon={<CalendarCheck className="h-5 w-5" />} tone="blue" />
            <Stat label={`Paid bookings (${days}d)`} value={totals.paid} sub={`${totals.conversion}% view → booking`} icon={<TrendingUp className="h-5 w-5" />} tone="violet" />
            <Stat label={`Earnings (${days}d)`} value={money(totals.earnings)} sub="Your payout" icon={<Wallet className="h-5 w-5" />} tone="green" />
          </div>

          <Suspense fallback={<div className="grid gap-6 xl:grid-cols-2"><Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>}>
            <AnalyticsCharts daily={daily} />
          </Suspense>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Per listing</h2>
            {!q.data.perListing.length ? (
              <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No listings yet" description="Create a listing to start tracking performance." action={<ButtonLink to="/dashboard/listings/new">Create a listing</ButtonLink>} />
            ) : (
              <Card padded={false} className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Listing</th>
                      <th className="px-3 py-3 text-right">Views</th>
                      <th className="px-3 py-3 text-right"><Heart className="inline h-3.5 w-3.5" /> Saves</th>
                      <th className="px-3 py-3 text-right">Requests</th>
                      <th className="px-3 py-3 text-right">Paid</th>
                      <th className="px-3 py-3 text-right">Conversion</th>
                      <th className="px-4 py-3 text-right">Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...q.data.perListing].sort((a, b) => b.earnings - a.earnings || b.viewCount - a.viewCount).map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/60">
                        <td className="max-w-[260px] px-4 py-3">
                          <Link to={`/dashboard/listings/${l.id}/edit`} className="block truncate font-medium text-slate-900 hover:text-brand-700">{l.title}</Link>
                          <span className="text-xs text-slate-500">{l.status.replace("_", " ").toLowerCase()}{l.ratingAvg ? ` · ★ ${l.ratingAvg.toFixed(1)}` : ""}</span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{l.viewCount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{l.wishlists}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{l.requests}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{l.paidBookings}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{l.conversionRate}%</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(l.earnings)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
            <p className="mt-2 text-xs text-slate-500">Views are all-time unique views; requests, paid bookings and earnings cover the selected period. Conversion = paid bookings ÷ views.</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ProUpsell() {
  const perks = ["Daily booking & earnings trends", "Views, saves and conversion per listing", "Spot your best performers and fix the rest"];
  return (
    <div>
      <Seo title="Analytics" noindex />
      <PageHeader title="Analytics" subtitle="Understand what makes your listings book." />
      <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-brand-900 text-white">
        <div className="relative z-10 max-w-lg">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-amber-950">
            <Crown className="h-3.5 w-3.5" /> Owner Pro
          </span>
          <h2 className="mt-3 text-2xl font-bold">Analytics is an Owner Pro feature</h2>
          <ul className="mt-4 space-y-2 text-sm text-white/85">
            {perks.map((p) => (
              <li key={p} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {p}</li>
            ))}
          </ul>
          <ButtonLink to="/dashboard/pro" variant="secondary" className="mt-6" icon={<Crown className="h-4 w-4" />}>Upgrade to Pro</ButtonLink>
        </div>
        <BarChart3 className="absolute -bottom-6 -right-6 h-48 w-48 text-white/5" aria-hidden />
      </Card>
    </div>
  );
}
