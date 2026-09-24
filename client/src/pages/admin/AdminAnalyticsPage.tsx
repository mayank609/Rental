/**
 * City analytics: supply vs demand per city (sortable table + CSV export)
 * and a lazy-loaded supply/demand heatmap per city.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { MapPin } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { money } from "@/lib/format";
import { Badge, Skeleton } from "@/components/ui";
import { ErrorPanel, FilterSelect, PageHeader, Panel, Segmented } from "@/components/admin/AdminUi";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { CsvExportButton } from "@/components/admin/CsvExportButton";
import { useUrlFilters } from "@/components/admin/hooks";
import type { AdminCity, CityAnalyticsRow, HeatmapResponse } from "@/components/admin/types";

const HeatmapMap = lazy(() => import("@/components/admin/HeatmapMap"));

const RANGES = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

/** Demand/supply thresholds — demand = searches + 5 × booking requests. */
const UNDER = 15;
const TIGHT = 5;

function RatioCell({ r }: { r: CityAnalyticsRow }) {
  const ratio = r.demandSupplyRatio;
  const under = ratio == null || ratio >= UNDER;
  const tone = under ? "bg-red-500" : ratio >= TIGHT ? "bg-amber-500" : "bg-emerald-500";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={clsx("h-2.5 w-2.5 rounded-full", tone)} aria-hidden />
      <span className="tabular-nums">{ratio == null ? "∞" : ratio}</span>
      {under && <Badge tone="red">Undersupplied</Badge>}
    </span>
  );
}

export default function AdminAnalyticsPage() {
  const [f, setF] = useUrlFilters({ days: "30", city: "" });
  const [layers, setLayers] = useState({ supply: true, demand: true });

  const citiesQ = useQuery({
    queryKey: ["admin", "analytics", "cities", f.days],
    queryFn: async () => (await api.get<{ cities: CityAnalyticsRow[] }>("/admin/analytics/cities", { params: { days: f.days } })).data.cities,
    retry: 1,
  });
  // City list for the selector comes from /admin/cities so the map works independently of the table.
  const cityListQ = useQuery({ queryKey: ["admin", "cities"], queryFn: async () => (await api.get<{ cities: AdminCity[] }>("/admin/cities")).data.cities });
  const citySlug = f.city || cityListQ.data?.[0]?.slug || "";

  const heatQ = useQuery({
    queryKey: ["admin", "analytics", "heatmap", citySlug, f.days],
    queryFn: async () => (await api.get<HeatmapResponse>("/admin/analytics/heatmap", { params: { city: citySlug || undefined, days: f.days } })).data,
    enabled: Boolean(citySlug) || cityListQ.isSuccess,
  });

  const columns: Column<CityAnalyticsRow>[] = [
    { key: "name", header: "City", cell: (r) => <button type="button" className="font-medium text-slate-900 hover:text-brand-700" onClick={() => setF({ city: r.slug })}>{r.name}</button>, sort: (r) => r.name },
    { key: "supply", header: "Supply", align: "right", cell: (r) => <span className="tabular-nums">{r.supply}</span>, sort: (r) => r.supply },
    { key: "searches", header: "Searches", align: "right", cell: (r) => <span className="tabular-nums">{r.searches}</span>, sort: (r) => r.searches },
    {
      key: "zero", header: "Zero-result", align: "right", sort: (r) => r.zeroResultSearches,
      cell: (r) => (
        <span className="tabular-nums">
          {r.zeroResultSearches}
          {r.searches > 0 && <span className="ml-1 text-xs text-slate-400">({Math.round((r.zeroResultSearches / r.searches) * 100)}%)</span>}
        </span>
      ),
    },
    { key: "requests", header: "Requests", align: "right", cell: (r) => <span className="tabular-nums">{r.requests}</span>, sort: (r) => r.requests },
    { key: "gmv", header: "GMV", align: "right", cell: (r) => <span className="tabular-nums">{money(r.gmv)}</span>, sort: (r) => r.gmv },
    { key: "ratio", header: "Demand / supply", cell: (r) => <RatioCell r={r} />, sort: (r) => r.demandSupplyRatio ?? Number.POSITIVE_INFINITY },
  ];

  const csvRows = useMemo(
    () =>
      (citiesQ.data ?? []).map((r) => ({
        city: r.name, slug: r.slug, supply: r.supply, searches: r.searches, zeroResultSearches: r.zeroResultSearches, requests: r.requests, gmvRupees: r.gmv / 100, demandSupplyRatio: r.demandSupplyRatio ?? "inf",
      })),
    [citiesQ.data],
  );

  const selectedCity = cityListQ.data?.find((c) => c.slug === citySlug);
  const center: [number, number] = heatQ.data?.city ? [heatQ.data.city.lat, heatQ.data.city.lng] : selectedCity ? [selectedCity.lat, selectedCity.lng] : [20.59, 78.96];

  return (
    <div>
      <PageHeader
        title="City analytics"
        subtitle="Where supply meets demand. Use this to plan owner acquisition by city."
        actions={
          <>
            <Segmented label="Period" value={f.days} onChange={(v) => setF({ days: v })} options={RANGES} />
            <CsvExportButton rows={csvRows} filename={`city-analytics-${f.days}d.csv`} />
          </>
        }
      />

      {citiesQ.isError ? (
        <ErrorPanel message={`Couldn't load city analytics: ${apiError(citiesQ.error)}`} onRetry={() => citiesQ.refetch()} />
      ) : (
        <DataTable
          caption="Supply and demand by city"
          columns={columns}
          rows={citiesQ.data}
          rowKey={(r) => r.id}
          loading={citiesQ.isLoading}
          initialSort={{ key: "supply", dir: "desc" }}
          rowClassName={(r) => (r.slug === citySlug ? "bg-brand-50/50" : undefined)}
          empty={{ title: "No cities yet", description: "Cities are created automatically when listings are published." }}
        />
      )}
      <p className="mt-2 text-xs text-slate-500">
        Demand = searches + 5 × booking requests. Ratio ≥ {UNDER} (or demand with no supply) is flagged as undersupplied; {TIGHT}–{UNDER} is tight.
      </p>

      <Panel
        className="mt-5"
        padded={false}
        title={
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-slate-400" /> Heatmap {heatQ.data?.city ? `· ${heatQ.data.city.name}` : ""}
          </span>
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect label="City" value={citySlug} onChange={(v) => setF({ city: v })} options={(cityListQ.data ?? []).map((c) => ({ value: c.slug, label: c.name }))} />
            <LayerToggle color="bg-blue-600" label={`Supply (${heatQ.data?.supply.length ?? 0})`} checked={layers.supply} onChange={(v) => setLayers((l) => ({ ...l, supply: v }))} />
            <LayerToggle color="bg-orange-500" label={`Demand (${heatQ.data?.demand.length ?? 0})`} checked={layers.demand} onChange={(v) => setLayers((l) => ({ ...l, demand: v }))} />
          </div>
        }
      >
        <div className="relative h-[460px]">
          {heatQ.isError ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">{apiError(heatQ.error)}</div>
          ) : !heatQ.data ? (
            <Skeleton className="h-full rounded-none" />
          ) : (
            <Suspense fallback={<Skeleton className="h-full rounded-none" />}>
              <HeatmapMap supply={heatQ.data.supply} demand={heatQ.data.demand} show={layers} center={center} zoom={11} />
            </Suspense>
          )}
        </div>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          Supply = active listings (approximate location). Demand = searches with a location in the selected period. Circle size scales with volume.
        </p>
      </Panel>
    </div>
  );
}

function LayerToggle({ color, label, checked, onChange }: { color: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
      <span className={clsx("h-2.5 w-2.5 rounded-full", color)} aria-hidden />
      {label}
    </label>
  );
}
