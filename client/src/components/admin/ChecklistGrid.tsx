/** Handover/return checklists from both parties shown side by side (booking + dispute views). */
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import type { Checklist } from "@/lib/types";
import { Badge } from "@/components/ui";
import { Thumb } from "./AdminUi";

/** Handover/return checklists from both parties, side by side. */
export function ChecklistGrid({ checklists }: { checklists: Checklist[] }) {
  const order = ["HANDOVER", "RETURN"] as const;
  return (
    <div className="space-y-5">
      {order.map((type) => {
        const items = checklists.filter((c) => c.type === type);
        if (!items.length) return null;
        return (
          <div key={type}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{type === "HANDOVER" ? "Handover" : "Return"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["OWNER", "RENTER"] as const).map((role) => {
                const c = items.find((x) => x.role === role);
                return (
                  <div key={role} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge tone={role === "OWNER" ? "brand" : "blue"}>{role === "OWNER" ? "Owner" : "Renter"}</Badge>
                      {c && <span className="text-xs text-slate-500">{fmtDateTime(c.createdAt)}</span>}
                    </div>
                    {!c ? (
                      <p className="text-sm text-slate-400">Not submitted</p>
                    ) : (
                      <>
                        {c.condition && <p className="text-sm text-slate-700">Condition: <b>{c.condition.replace("_", " ").toLowerCase()}</b></p>}
                        {c.items.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 text-xs">
                            {c.items.map((it, i) => (
                              <li key={i} className="flex items-center gap-1.5 text-slate-600">
                                {it.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : it.ok === false ? <XCircle className="h-3.5 w-3.5 text-red-600" /> : <Circle className="h-3.5 w-3.5" />}
                                {it.label}
                              </li>
                            ))}
                          </ul>
                        )}
                        {c.notes && <p className="mt-1.5 text-xs italic text-slate-600">“{c.notes}”</p>}
                        {c.photos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {c.photos.map((ph, i) => (
                              <Thumb key={i} src={ph.url} alt={`${role.toLowerCase()} ${type.toLowerCase()} photo ${i + 1}`} className="h-16 w-16" caption={ph.takenAt ? `Taken ${fmtDateTime(ph.takenAt)}${ph.lat != null ? ` · ${ph.lat.toFixed(4)}, ${ph.lng?.toFixed(4)}` : ""}` : undefined} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
