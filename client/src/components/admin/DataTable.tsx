/**
 * Generic, dense data table for the admin console.
 * - Client-side sorting on columns with a `sort` accessor
 * - Skeleton rows while loading, empty state when there is no data
 * - Optional row click (keyboard accessible) and expandable detail rows
 * - Horizontal scroll on small screens; server pagination via `meta`
 */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Inbox } from "lucide-react";
import type { PageMeta } from "@/lib/types";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Return a comparable value to enable sorting on this column. */
  sort?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  /** Hide below the given breakpoint to keep mobile tables readable. */
  hideBelow?: "sm" | "md" | "lg";
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  empty?: { title: string; description?: ReactNode; icon?: ReactNode };
  onRowClick?: (row: T) => void;
  /** Render an expanded row below the row (toggle via chevron column). */
  expand?: (row: T) => ReactNode;
  canExpand?: (row: T) => boolean;
  rowClassName?: (row: T) => string | undefined;
  meta?: PageMeta;
  onPageChange?: (page: number) => void;
  initialSort?: { key: string; dir: "asc" | "desc" };
  caption?: string;
  className?: string;
}

const hideCls = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;
const alignCls = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function DataTable<T>({
  columns, rows, rowKey, loading, skeletonRows = 8, empty, onRowClick, expand, canExpand, rowClassName, meta, onPageChange, initialSort, caption, className,
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows ?? [];
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const acc = col.sort;
    return [...rows].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "en", { numeric: true });
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null));
  const toggleOpen = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const colCount = columns.length + (expand ? 1 : 0);
  const showEmpty = !loading && sorted.length === 0;

  return (
    <div className={clsx("card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-slate-50/80">
            <tr className="border-b border-slate-200">
              {expand && <th className="w-8" aria-label="Expand" />}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={clsx("whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500", alignCls[c.align ?? "left"], c.hideBelow && hideCls[c.hideBelow], c.className)}
                  >
                    {c.sort ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className={clsx("inline-flex items-center gap-1 uppercase hover:text-slate-900", active && "text-slate-900")}>
                        {c.header}
                        {active ? sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-slate-100">
                  {Array.from({ length: colCount }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="skeleton h-4" style={{ width: `${50 + ((i * 7 + j * 13) % 45)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              sorted.map((row) => {
                const k = rowKey(row);
                const expandable = expand && (canExpand ? canExpand(row) : true);
                const isOpen = open.has(k);
                return (
                  <Fragment key={k}>
                    <tr
                      className={clsx("border-b border-slate-100 transition", onRowClick && "cursor-pointer hover:bg-brand-50/40 focus-within:bg-brand-50/40", rowClassName?.(row))}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={onRowClick ? (e) => e.key === "Enter" && e.target === e.currentTarget && onRowClick(row) : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                    >
                      {expand && (
                        <td className="w-8 pl-2" onClick={(e) => e.stopPropagation()}>
                          {expandable && (
                            <button type="button" onClick={() => toggleOpen(k)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-expanded={isOpen} aria-label={isOpen ? "Collapse row" : "Expand row"}>
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} className={clsx("px-3 py-2.5 align-middle text-slate-700", alignCls[c.align ?? "left"], c.hideBelow && hideCls[c.hideBelow], c.className)}>
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                    {expandable && isOpen && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={colCount} className="px-4 py-3">
                          {expand!(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            {showEmpty && (
              <tr>
                <td colSpan={colCount} className="px-6 py-14 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">{empty?.icon ?? <Inbox className="h-5 w-5" />}</div>
                    <p className="font-semibold text-slate-900">{empty?.title ?? "Nothing here"}</p>
                    {empty?.description && <p className="mt-1 text-sm text-slate-500">{empty.description}</p>}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {meta && onPageChange && <TableFooter meta={meta} onPageChange={onPageChange} />}
    </div>
  );
}

/** "Showing 1–25 of 240" + prev/next controls. */
export function TableFooter({ meta, onPageChange }: { meta: PageMeta; onPageChange: (p: number) => void }) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
      <span>
        Showing <b className="text-slate-700">{from.toLocaleString("en-IN")}</b>–<b className="text-slate-700">{to.toLocaleString("en-IN")}</b> of{" "}
        <b className="text-slate-700">{meta.total.toLocaleString("en-IN")}</b>
      </span>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button type="button" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
          Previous
        </button>
        <span className="px-2">
          Page {meta.page} / {Math.max(1, meta.totalPages)}
        </span>
        <button type="button" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
          Next
        </button>
      </nav>
    </div>
  );
}

/** Stop row-click propagation for inline action cells. */
export function CellActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
