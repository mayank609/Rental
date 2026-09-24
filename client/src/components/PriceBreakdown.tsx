import { Info } from "lucide-react";
import { money, pct } from "@/lib/format";

export interface BreakdownLike {
  rentLines: { label: string; amount: number }[];
  rentAmount: number;
  serviceFee: number;
  serviceFeeRate?: number;
  protectionFee: number;
  deliveryFee: number;
  taxAmount: number;
  gstRate?: number;
  depositAmount: number;
  totalAmount: number;
}

/** Transparent checkout breakdown: rent, fees, GST, deposit and total. */
export function PriceBreakdown({ b, compact }: { b: BreakdownLike; compact?: boolean }) {
  const Row = ({ label, value, hint, strong }: { label: React.ReactNode; value: string; hint?: string; strong?: boolean }) => (
    <div className={`flex items-start justify-between gap-4 ${strong ? "text-base font-bold text-slate-900" : "text-sm text-slate-700"}`}>
      <span className="flex items-center gap-1">
        {label}
        {hint && (
          <span title={hint} className="cursor-help text-slate-400">
            <Info className="h-3.5 w-3.5" />
          </span>
        )}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {b.rentLines.length > 1 ? (
        b.rentLines.map((l) => <Row key={l.label} label={`Rent · ${l.label}`} value={money(l.amount)} />)
      ) : (
        <Row label={`Rent${b.rentLines[0] ? ` · ${b.rentLines[0].label}` : ""}`} value={money(b.rentAmount)} />
      )}
      <Row label={`Service fee${b.serviceFeeRate != null ? ` (${pct(b.serviceFeeRate)})` : ""}`} value={money(b.serviceFee)} hint="Helps us run secure payments, 24×7 support and deposit protection." />
      {b.protectionFee > 0 && <Row label="Damage protection" value={money(b.protectionFee)} hint="Covers accidental damage up to the plan limit." />}
      {b.deliveryFee > 0 && <Row label="Delivery" value={money(b.deliveryFee)} />}
      <Row label={`GST${b.gstRate != null ? ` (${pct(b.gstRate)} on platform fees)` : " on platform fees"}`} value={money(b.taxAmount)} />
      <Row label="Refundable security deposit" value={money(b.depositAmount)} hint="Held safely by the platform and refunded after the item is returned and inspected." />
      <div className="border-t border-dashed border-slate-200 pt-2.5">
        <Row label="Total payable" value={money(b.totalAmount)} strong />
        {b.depositAmount > 0 && <p className="mt-1 text-right text-xs text-slate-500">incl. {money(b.depositAmount)} refundable deposit</p>}
      </div>
    </div>
  );
}
