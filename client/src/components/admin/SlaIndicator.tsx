/** Age + SLA countdown for open disputes. */
import clsx from "clsx";
import { fmtDate, fromNow } from "@/lib/format";

/** Response SLA promised to users when a dispute is opened. */
export const DISPUTE_SLA_HOURS = 48;

export function SlaIndicator({ createdAt, open }: { createdAt: string; open: boolean }) {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  if (!open) return <span className="text-xs text-slate-500">{fmtDate(createdAt)}</span>;
  const tone = hours >= DISPUTE_SLA_HOURS ? "red" : hours >= DISPUTE_SLA_HOURS / 2 ? "amber" : "green";
  const left = Math.round(DISPUTE_SLA_HOURS - hours);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
      <span className={clsx("h-2 w-2 rounded-full", { red: "bg-red-500", amber: "bg-amber-500", green: "bg-emerald-500" }[tone])} aria-hidden />
      <span className="text-slate-700">{fromNow(createdAt).replace(" ago", "")}</span>
      <span className={clsx("font-semibold", tone === "red" ? "text-red-700" : "text-slate-500")}>{tone === "red" ? "SLA breached" : `${left}h left`}</span>
    </span>
  );
}
