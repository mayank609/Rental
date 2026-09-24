/** Read-only pretty JSON block (audit log before/after, flag details, event data). */
import clsx from "clsx";

export function JsonViewer({ value, label, className }: { value: unknown; label?: string; className?: string }) {
  const empty = value == null || (typeof value === "object" && Object.keys(value as object).length === 0);
  return (
    <div className={clsx("min-w-0", className)}>
      {label && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>}
      {empty ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-400">—</p>
      ) : (
        <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-100">{JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  );
}
