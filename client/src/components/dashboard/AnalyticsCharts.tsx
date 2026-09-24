/**
 * Recharts visuals for owner analytics. Bookings and earnings use
 * different units, so they're two single-series charts (never one chart
 * with two y-axes). Lazy-loaded to keep recharts out of the main bundle.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { money } from "@/lib/format";

export interface DailyPoint {
  date: string;
  bookings: number;
  earnings: number;
}

const INK = "#64748b";
const GRID = "#e2e8f0";
const BRAND = "#4f46e5";
const EMERALD = "#059669";

const tick = { fill: INK, fontSize: 11 };
const dateTick = (d: string) => format(parseISO(d), "d MMM");

function ChartTooltip({ active, payload, label, fmt, unit }: { active?: boolean; payload?: { value: number }[]; label?: string; fmt: (v: number) => string; unit: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-xs shadow-[var(--shadow-pop)] ring-1 ring-slate-200">
      <p className="font-semibold text-slate-900">{format(parseISO(label), "EEE, d MMM yyyy")}</p>
      <p className="mt-0.5 text-slate-600">
        {unit}: <b className="text-slate-900">{fmt(payload[0].value)}</b>
      </p>
    </div>
  );
}

export default function AnalyticsCharts({ daily }: { daily: DailyPoint[] }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <figure className="card p-5">
        <figcaption className="mb-4">
          <p className="font-semibold text-slate-900">Booking requests per day</p>
          <p className="text-xs text-slate-500">All requests received, including those later declined or cancelled</p>
        </figcaption>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="date" tickFormatter={dateTick} tick={tick} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={40} />
              <Tooltip cursor={{ fill: "rgba(79,70,229,0.06)" }} content={<ChartTooltip fmt={(v) => String(v)} unit="Requests" />} />
              <Bar dataKey="bookings" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <figure className="card p-5">
        <figcaption className="mb-4">
          <p className="font-semibold text-slate-900">Earnings per day</p>
          <p className="text-xs text-slate-500">Your payout from bookings created that day</p>
        </figcaption>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EMERALD} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={EMERALD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="date" tickFormatter={dateTick} tick={tick} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tickFormatter={(v: number) => money(v).replace(/\.00$/, "")} tick={tick} axisLine={false} tickLine={false} width={64} />
              <Tooltip cursor={{ stroke: INK, strokeDasharray: "3 3" }} content={<ChartTooltip fmt={(v) => money(v)} unit="Earnings" />} />
              <Area type="monotone" dataKey="earnings" stroke={EMERALD} strokeWidth={2} fill="url(#earnFill)" activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
