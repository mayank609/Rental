/**
 * Marketing sections reused on the home, how-it-works and trust pages.
 */
import { BadgeCheck, CalendarCheck, Camera, Handshake, Lock, MessageSquareLock, Search, ShieldCheck, Undo2, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import type { CancellationPolicy, PlatformConfig } from "@/lib/types";

type IconT = ComponentType<{ className?: string }>;

export const RENTER_STEPS: { icon: IconT; title: string; text: string }[] = [
  { icon: Search, title: "Find it nearby", text: "Search thousands of items from verified people in your neighbourhood — sorted by distance." },
  { icon: CalendarCheck, title: "Book & pay securely", text: "Pick dates, see a transparent price with GST, and pay via UPI, cards or netbanking through Razorpay." },
  { icon: Handshake, title: "Pick up or get it delivered", text: "Meet the owner or opt for delivery. Both of you record a photo checklist at handover." },
  { icon: Undo2, title: "Return & get your deposit", text: "Return on time, the owner inspects it, and your refundable deposit is released automatically." },
];

export const OWNER_STEPS: { icon: IconT; title: string; text: string }[] = [
  { icon: Camera, title: "List in minutes", text: "Add photos, set hourly or daily prices, a deposit and your house rules. Listing is free." },
  { icon: BadgeCheck, title: "Approve verified renters", text: "Every renter verifies their phone; high-value bookings require ID (KYC). Or turn on instant booking." },
  { icon: ShieldCheck, title: "Hand over with protection", text: "Deposits are held in escrow and handover photos are timestamped — your evidence if anything goes wrong." },
  { icon: Wallet, title: "Get paid to your bank", text: "Payouts land in your bank/UPI after the rental completes and the item is inspected." },
];

/** Numbered 4-step strip. */
export function StepsStrip({ steps, dark }: { steps: typeof RENTER_STEPS; dark?: boolean }) {
  return (
    <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(({ icon: Icon, title, text }, i) => (
        <li key={title} className={dark ? "rounded-2xl bg-white/5 p-5 ring-1 ring-white/10" : "card p-5"}>
          <div className="flex items-center gap-3">
            <span className={dark ? "flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white" : "flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"}>
              <Icon className="h-5 w-5" />
            </span>
            <span className={dark ? "text-xs font-bold uppercase tracking-wider text-white/50" : "text-xs font-bold uppercase tracking-wider text-slate-400"}>Step {i + 1}</span>
          </div>
          <h3 className={dark ? "mt-4 font-semibold text-white" : "mt-4 font-semibold text-slate-900"}>{title}</h3>
          <p className={dark ? "mt-1.5 text-sm text-white/70" : "mt-1.5 text-sm text-slate-600"}>{text}</p>
        </li>
      ))}
    </ol>
  );
}

export const TRUST_BADGES: { icon: IconT; title: string; text: string }[] = [
  { icon: BadgeCheck, title: "Verified people", text: "Phone OTP for everyone, ID verification for high-value rentals" },
  { icon: Lock, title: "Secure payments", text: "Razorpay-powered UPI, cards & netbanking — never pay off-platform" },
  { icon: ShieldCheck, title: "Deposit held in escrow", text: "Released only after the item is returned and inspected" },
  { icon: MessageSquareLock, title: "Private chat", text: "Phone numbers & emails are masked until a booking is confirmed" },
];

export function TrustBadges({ compact }: { compact?: boolean }) {
  return (
    <ul className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"}>
      {TRUST_BADGES.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Icon className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">{title}</span>
            <span className="mt-0.5 block text-xs text-slate-600">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------ cancellation tiers */

export const POLICY_LABEL: Record<CancellationPolicy, string> = { FLEXIBLE: "Flexible", MODERATE: "Moderate", STRICT: "Strict" };

const hoursLabel = (h: number) => (h === 0 ? "start" : h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`);

/**
 * Human-readable tiers, e.g. "Cancel 72h+ before start → 100% refund of rent".
 * Tiers come from admin config so copy always matches what the server enforces.
 */
export function describeTiers(tiers: { hoursBefore: number; refundPercent: number }[]) {
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  return sorted.map((t, i) => {
    const upper = i > 0 ? sorted[i - 1].hoursBefore : null;
    const when =
      t.hoursBefore === 0
        ? upper != null
          ? `Less than ${hoursLabel(upper)} before start`
          : "Any time before start"
        : `${hoursLabel(t.hoursBefore)} or more before start`;
    return { when, refundPercent: t.refundPercent };
  });
}

export function CancellationTiers({ policy, config, className }: { policy: CancellationPolicy; config?: PlatformConfig; className?: string }) {
  const tiers = config?.cancellationPolicies?.[policy];
  if (!tiers) return null;
  return (
    <div className={className}>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200">
        {describeTiers(tiers).map((t) => (
          <li key={t.when} className="flex items-center justify-between gap-3 bg-white px-4 py-2.5 text-sm">
            <span className="text-slate-700">{t.when}</span>
            <span className={t.refundPercent === 100 ? "font-semibold text-emerald-700" : t.refundPercent === 0 ? "font-semibold text-red-600" : "font-semibold text-amber-700"}>
              {t.refundPercent}% refund
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Percentages apply to rent. Deposit, delivery and protection fees are always refunded; the service fee (and its GST) is refunded on a 100% refund. If the owner cancels, you get everything back.</p>
    </div>
  );
}
