/**
 * Presentational building blocks for the admin "ops console":
 * page headers, KPI cards, status pills, filter bars, panels and
 * role-aware wrappers.
 */
import { cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Lock, Search, X } from "lucide-react";
import { Badge, Modal, type Tone } from "@/components/ui";
import { useAuth } from "@/stores/auth";
import { useDebounce } from "@/hooks/useDebounce";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/format";

// ------------------------------------------------------------------ header
export function PageHeader({ title, subtitle, actions, back, badge }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; badge?: ReactNode }) {
  return (
    <header className="mb-5">
      {back && (
        <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-slate-900">
            {title}
            {badge}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ panels
export function Panel({ title, action, children, className, padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={clsx("card overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      <div className={clsx(padded && "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}

/** Definition list used on detail pages. */
export function KeyValue({ items, cols = 2 }: { items: { label: ReactNode; value: ReactNode; hidden?: boolean }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={clsx("grid gap-x-6 gap-y-3 text-sm", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
      {items
        .filter((i) => !i.hidden)
        .map((i, idx) => (
          <div key={idx} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{i.label}</dt>
            <dd className="mt-0.5 break-words text-slate-900">{i.value ?? "—"}</dd>
          </div>
        ))}
    </dl>
  );
}

// -------------------------------------------------------------------- KPIs
export function DeltaBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-xs text-slate-400">no prior data</span>;
  const up = value >= 0;
  return (
    <span className={clsx("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold", up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value)}%<span className="sr-only">{up ? " increase" : " decrease"} vs previous period</span>
    </span>
  );
}

export function KpiCard({ label, value, delta, sub, icon, loading }: { label: string; value: ReactNode; delta?: number | null; sub?: ReactNode; icon?: ReactNode; loading?: boolean }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-24" />
      ) : (
        <p className="mt-1.5 truncate text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      )}
      <div className="mt-1 flex min-h-5 items-center gap-2 text-xs text-slate-500">
        {delta !== undefined && !loading && <DeltaBadge value={delta} />}
        {sub}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ status pill
const TONES: Record<string, Tone> = {
  // generic lifecycle
  ACTIVE: "green", PENDING: "amber", PENDING_REVIEW: "amber", VERIFIED: "green", REJECTED: "red", NONE: "gray",
  SUSPENDED: "amber", BANNED: "red", DELETED: "gray", DRAFT: "gray", PAUSED: "gray", ARCHIVED: "gray",
  // disputes & moderation
  OPEN: "red", UNDER_REVIEW: "blue", RESOLVED: "green", ACTIONED: "green", DISMISSED: "gray",
  // payments / payouts / refunds / webhooks
  CREATED: "gray", AUTHORIZED: "blue", CAPTURED: "green", FAILED: "red", REFUNDED: "violet", PARTIALLY_REFUNDED: "violet",
  PROCESSED: "green", ON_HOLD: "amber", SCHEDULED: "blue", PROCESSING: "blue", PAID: "green", CANCELLED: "gray", RECEIVED: "amber",
  // roles
  ADMIN: "violet", SUPPORT: "brand", USER: "gray",
};

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Status badge for any admin entity. Booking statuses reuse the shared labels. */
export function StatusPill({ status, kind }: { status: string | null | undefined; kind?: "booking" }) {
  if (!status) return <span className="text-slate-400">—</span>;
  if (kind === "booking") return <Badge tone={STATUS_TONE[status] ?? "gray"}>{STATUS_LABEL[status] ?? pretty(status)}</Badge>;
  return <Badge tone={TONES[status] ?? "gray"}>{pretty(status)}</Badge>;
}

export function SeverityPill({ severity }: { severity: number }) {
  const map: Record<number, [Tone, string]> = { 1: ["gray", "Low"], 2: ["amber", "Medium"], 3: ["red", "High"] };
  const [tone, label] = map[severity] ?? map[1];
  return <Badge tone={tone}>{label}</Badge>;
}

// ------------------------------------------------------------ role-aware
/**
 * Wraps an action that only ADMIN may perform. For SUPPORT the child is
 * rendered disabled with an explanatory tooltip (or hidden with `hide`).
 */
export function AdminOnly({ children, hide, reason = "Only administrators can perform this action" }: { children: ReactElement<{ disabled?: boolean }>; hide?: boolean; reason?: string }) {
  const { isAdmin } = useAuth();
  if (isAdmin) return children;
  if (hide) return null;
  return (
    <span title={reason} className="inline-flex cursor-not-allowed" aria-label={reason}>
      {isValidElement(children) ? cloneElement(children, { disabled: true }) : children}
    </span>
  );
}

export function ReadOnlyNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
      <Lock className="h-4 w-4 shrink-0" />
      {children ?? "Read-only: your Support role can view this page but only administrators can make changes."}
    </div>
  );
}

// ------------------------------------------------------------ filter bar
export function FilterBar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
      {children}
      {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** Debounced search box (300ms) that syncs with an external value. */
export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value);
  const debounced = useDebounce(text, 300);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return (
    <div className={clsx("relative min-w-[200px] flex-1 sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input type="search" aria-label={placeholder} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="input h-9 py-1.5 pl-9 pr-8" />
      {text && (
        <button type="button" onClick={() => setText("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Clear search">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Compact labelled select for filter bars. */
export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className="hidden sm:inline">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Segmented control (e.g. 7/30/90/365 days). */
export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-200/70 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx("rounded-md px-2.5 py-1 text-xs font-semibold transition", value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Multi-select chip group (e.g. booking statuses). */
export function ChipMultiSelect({ values, onChange, options }: { values: string[]; onChange: (v: string[]) => void; options: { value: string; label: string }[] }) {
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={values.includes(o.value)} onClick={() => toggle(o.value)} className={clsx("chip px-2.5 py-1 text-xs", values.includes(o.value) && "chip-active")}>
          {o.label}
        </button>
      ))}
      {values.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="px-2 text-xs font-medium text-slate-500 hover:text-slate-800">
          Clear
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------ misc
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  // Only apply default size/colour when the caller doesn't override them (avoids Tailwind class conflicts)
  const has = (re: RegExp) => Boolean(className && re.test(className));
  return <span className={clsx("font-mono", !has(/(^|\s)text-(xs|sm|base|lg|xl|\dxl)/) && "text-xs", !has(/(^|\s)text-(slate|red|emerald|brand|amber|violet|sky)-/) && "text-slate-600", className)}>{children}</span>;
}

/** Click-to-enlarge image thumbnail. */
export function Thumb({ src, alt, caption, className }: { src: string; alt: string; caption?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={clsx("group relative block overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200", className ?? "h-24 w-24")} aria-label={`Enlarge ${alt}`}>
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={alt} size="xl">
        <img src={src} alt={alt} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
        {caption && <div className="mt-3 text-center text-sm text-slate-600">{caption}</div>}
      </Modal>
    </>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center text-sm text-slate-600">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="chip">
          Retry
        </button>
      )}
    </div>
  );
}
