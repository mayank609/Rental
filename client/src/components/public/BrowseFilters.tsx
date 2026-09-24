/**
 * Filter panel for the browse page. Rendered in a sidebar on desktop and
 * inside a bottom-sheet Modal on mobile. Fully controlled: every change is
 * written straight to the URL by the parent.
 */
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Star } from "lucide-react";
import type { Category } from "@/lib/types";
import { Checkbox } from "@/components/ui";
import { CategoryIcon } from "./common";

export interface BrowseFilterValues {
  radius: number | null;
  min: string;
  max: string;
  start: string;
  end: string;
  rating: number | null;
  delivery: boolean;
  instant: boolean;
  verified: boolean;
}

export const RADIUS_OPTIONS: (number | null)[] = [null, 1, 5, 10, 25];

export function countActiveFilters(v: BrowseFilterValues, category?: string | null) {
  return [v.radius, v.min, v.max, v.start || v.end, v.rating, v.delivery, v.instant, v.verified, category].filter(Boolean).length;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `f-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div role="group" aria-labelledby={id} className="border-b border-slate-100 py-5 first:pt-0 last:border-0">
      <h3 id={id} className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

export function BrowseFilters({
  values, onChange, categories, category, onCategory, radiusEnabled, todayIso,
}: {
  values: BrowseFilterValues;
  onChange: (patch: Partial<BrowseFilterValues>) => void;
  categories?: Category[];
  category: string | null;
  onCategory: (slug: string | null) => void;
  /** Radius needs an origin (user location or a city). */
  radiusEnabled: boolean;
  todayIso: string;
}) {
  // Price inputs are committed on blur / Enter so typing doesn't spam requests.
  const [min, setMin] = useState(values.min);
  const [max, setMax] = useState(values.max);
  useEffect(() => setMin(values.min), [values.min]);
  useEffect(() => setMax(values.max), [values.max]);
  const commitPrice = () => {
    if (min !== values.min || max !== values.max) onChange({ min, max });
  };

  const activeParent = categories?.find((c) => c.slug === category || c.children?.some((ch) => ch.slug === category));

  return (
    <div>
      <Section title="Distance">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Search radius">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r ?? "any"}
              type="button"
              role="radio"
              aria-checked={values.radius === r}
              disabled={!radiusEnabled && r != null}
              onClick={() => onChange({ radius: r })}
              className={clsx("chip disabled:opacity-40", values.radius === r && "chip-active")}
            >
              {r == null ? "Any" : `${r} km`}
            </button>
          ))}
        </div>
        {values.radius != null && <p className="mt-2 text-xs text-slate-500">Showing items within {values.radius} km — including across city limits.</p>}
        {!radiusEnabled && <p className="mt-2 text-xs text-slate-500">Choose a location to filter by distance.</p>}
      </Section>

      <Section title="Category">
        <ul className="space-y-0.5">
          <li>
            <button type="button" onClick={() => onCategory(null)} className={clsx("w-full rounded-lg px-2.5 py-2 text-left text-sm", !category ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-50")}>
              All categories
            </button>
          </li>
          {categories?.map((c) => {
            const open = activeParent?.id === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => onCategory(c.slug)}
                  className={clsx("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm", category === c.slug ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-50")}
                >
                  <CategoryIcon icon={c.icon} className="h-4 w-4 shrink-0 text-slate-400" />
                  {c.name}
                </button>
                {open && c.children && c.children.length > 0 && (
                  <ul className="mb-1 ml-6 border-l border-slate-200 pl-2">
                    {c.children.map((ch) => (
                      <li key={ch.id}>
                        <button
                          type="button"
                          onClick={() => onCategory(ch.slug)}
                          className={clsx("w-full rounded-lg px-2.5 py-1.5 text-left text-sm", category === ch.slug ? "font-semibold text-brand-700" : "text-slate-600 hover:text-slate-900")}
                        >
                          {ch.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Price per day">
        <div className="flex items-center gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Minimum price per day in rupees</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">₹</span>
            <input className="input pl-7" inputMode="numeric" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} onBlur={commitPrice} onKeyDown={(e) => e.key === "Enter" && commitPrice()} />
          </label>
          <span className="text-slate-400">–</span>
          <label className="relative flex-1">
            <span className="sr-only">Maximum price per day in rupees</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">₹</span>
            <input className="input pl-7" inputMode="numeric" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} onBlur={commitPrice} onKeyDown={(e) => e.key === "Enter" && commitPrice()} />
          </label>
        </div>
      </Section>

      <Section title="Available on">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-slate-600">
            From
            <input type="date" className="input mt-1" min={todayIso} value={values.start} onChange={(e) => onChange({ start: e.target.value, end: values.end && values.end < e.target.value ? e.target.value : values.end })} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input type="date" className="input mt-1" min={values.start || todayIso} value={values.end} onChange={(e) => onChange({ end: e.target.value })} />
          </label>
        </div>
        {(values.start || values.end) && (
          <button type="button" className="link mt-2 text-xs" onClick={() => onChange({ start: "", end: "" })}>Clear dates</button>
        )}
      </Section>

      <Section title="Rating">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Minimum rating">
          {[null, 3, 4, 4.5].map((r) => (
            <button key={r ?? "any"} type="button" role="radio" aria-checked={values.rating === r} onClick={() => onChange({ rating: r })} className={clsx("chip", values.rating === r && "chip-active")}>
              {r == null ? "Any" : <><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {r}+</>}
            </button>
          ))}
        </div>
      </Section>

      <Section title="More">
        <div className="space-y-3">
          <Checkbox checked={values.instant} onChange={(v) => onChange({ instant: v })} label="Instant booking" />
          <Checkbox checked={values.delivery} onChange={(v) => onChange({ delivery: v })} label="Delivery available" />
          <Checkbox checked={values.verified} onChange={(v) => onChange({ verified: v })} label="Verified owners & items only" />
        </div>
      </Section>
    </div>
  );
}
