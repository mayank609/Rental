/**
 * Recharts visualisations for the admin dashboard. This module is loaded
 * with React.lazy so the (large) recharts chunk only downloads for staff.
 *
 * Palette: brand indigo for GMV/primary series, orange for revenue,
 * validated for CVD separation; every multi-series chart has a legend and
 * tooltips so identity never relies on color alone.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { money } from "@/lib/format";
import type { DashboardResponse } from "./types";
import { Panel } from "./AdminUi";

const C = { primary: "#4f46e5", secondary: "#f97316", grid: "#e2e8f0", axis: "#64748b" };

/** Compact ₹ for axes: ₹1.2L, ₹3.4Cr, ₹12k. */
export const shortMoney = (paise: number) => {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(0)}k`;
  return `₹${Math.round(r)}`;
};

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgb(16 24 40 / .08)", fontSize: 12 };

function NoData() {
  return <div className="flex h-full items-center justify-center text-sm text-slate-400">No data for this period</div>;
}

export default function DashboardCharts({ data }: { data: DashboardResponse }) {
  const daily = data.daily.map((d) => ({ ...d, label: format(new Date(d.date), "d MMM") }));
  const cities = data.bookingsPerCity.slice(0, 10);
  const cats = data.topCategories;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="GMV & platform revenue per day" className="xl:col-span-2">
        <div className="h-72" role="img" aria-label="Daily GMV and revenue area chart">
          {daily.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gGmv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.primary} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.secondary} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={C.secondary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={56} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [money(v), name]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="gmv" name="GMV (rent)" stroke={C.primary} strokeWidth={2} fill="url(#gGmv)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="revenue" name="Platform revenue" stroke={C.secondary} strokeWidth={2} fill="url(#gRev)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <Panel title="Conversion funnel">
        <Funnel steps={data.funnel} />
      </Panel>

      <Panel title="Bookings per city" className="xl:col-span-2">
        <div className="h-72" role="img" aria-label="Bookings per city bar chart">
          {cities.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cities} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="city" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} interval={0} angle={cities.length > 6 ? -25 : 0} textAnchor={cities.length > 6 ? "end" : "middle"} height={cities.length > 6 ? 50 : 30} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} formatter={(v: number, name: string) => [name === "GMV" ? money(v) : v, name]} />
                <Bar dataKey="bookings" name="Bookings" fill={C.primary} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <Panel title="Top categories by GMV">
        {cats.length === 0 ? (
          <div className="h-40">
            <NoData />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {cats.map((c) => {
              const max = cats[0].gmv || 1;
              return (
                <li key={c.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-slate-800">{c.category}</span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {money(c.gmv)} <span className="text-xs text-slate-400">· {c.bookings}</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, (c.gmv / max) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Horizontal funnel bars with step-to-step conversion %. */
function Funnel({ steps }: { steps: { stage: string; count: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const conv = prev ? Math.round((s.count / prev) * 1000) / 10 : null;
        return (
          <li key={s.stage}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-800">{s.stage}</span>
              <span className="tabular-nums text-slate-900">
                {s.count.toLocaleString("en-IN")}
                {conv != null &&
                  (conv <= 100 ? (
                    <span className="ml-2 text-xs font-semibold text-slate-500">{conv}%</span>
                  ) : (
                    // e.g. instant bookings skip "Accepted", so Paid can exceed it
                    <span className="ml-2 cursor-help text-xs font-semibold text-slate-400" title="Exceeds the previous step (instant bookings skip acceptance)">n/a</span>
                  ))}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${Math.max(1.5, (s.count / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
      <li className="pt-1 text-xs text-slate-500">% = conversion from the previous step. Views approximate listing page visits.</li>
    </ol>
  );
}
