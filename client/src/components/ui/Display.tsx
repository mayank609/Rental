import type { ReactNode } from "react";
import clsx from "clsx";
import { Star, BadgeCheck, Crown } from "lucide-react";
import { initials } from "@/lib/format";

export type Tone = "gray" | "blue" | "green" | "amber" | "red" | "violet" | "brand";
const tones: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
};

export function Badge({ tone = "gray", children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>{icon}{children}</span>;
}

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={clsx("card", padded && "p-5 sm:p-6", className)}>{children}</div>;
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  return src ? (
    <img src={src} alt={name} width={size} height={size} loading="lazy" className={clsx("rounded-full object-cover ring-2 ring-white", className)} style={{ width: size, height: size }} />
  ) : (
    <span className={clsx("inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 font-semibold text-white ring-2 ring-white", className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name) || "?"}
    </span>
  );
}

export function Rating({ avg, count, size = "sm", className }: { avg: number; count: number; size?: "sm" | "md"; className?: string }) {
  if (!count) return <span className={clsx("text-xs font-medium text-slate-500", className)}>New</span>;
  return (
    <span className={clsx("inline-flex items-center gap-1 font-semibold text-slate-800", size === "sm" ? "text-xs" : "text-sm", className)}>
      <Star className={clsx("fill-amber-400 text-amber-400", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
      {avg.toFixed(1)}
      <span className="font-normal text-slate-500">({count})</span>
    </span>
  );
}

export function Stars({ value, onChange, size = 28 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="flex gap-1" role={onChange ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} className="disabled:cursor-default">
          <Star style={{ width: size, height: size }} className={clsx(n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
        </button>
      ))}
    </div>
  );
}

export function VerifiedBadge({ user, className }: { user: { isVerified?: boolean; isPro?: boolean }; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1", className)}>
      {user.isVerified && (
        <span title="ID & phone verified" className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700">
          <BadgeCheck className="h-4 w-4 fill-emerald-500 text-white" /> Verified
        </span>
      )}
      {user.isPro && (
        <span title="Owner Pro" className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold uppercase text-amber-800">
          <Crown className="h-3 w-3" /> Pro
        </span>
      )}
    </span>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>}
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} />;
}

export function Stat({ label, value, sub, icon, tone = "brand" }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <Card className="flex items-start gap-4">
      {icon && <div className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 truncate text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </Card>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({ tone = "blue", title, children, icon, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex gap-3 rounded-xl p-4 text-sm ring-1 ring-inset", tones[tone], className)}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && "mt-1", "opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}
