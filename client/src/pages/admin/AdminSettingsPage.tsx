/**
 * Platform settings (fees, cancellation policies, booking rules, trust,
 * featured plans, Owner Pro, legal versions). ADMIN edits; SUPPORT sees a
 * read-only view. Each group is saved independently via PUT /admin/settings/:key.
 *
 * UI conventions: rates are shown as percentages but sent as fractions;
 * money is shown in ₹ but sent in paise — matching the server zod schemas.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { money } from "@/lib/format";
import { Button, PageLoader, Tabs, Toggle } from "@/components/ui";
import { ErrorPanel, PageHeader, Panel, ReadOnlyNotice, Segmented } from "@/components/admin/AdminUi";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import type { PlatformSettings, PolicyName, SettingsKey } from "@/components/admin/types";

type SettingsResponse = { settings: PlatformSettings; defaults: PlatformSettings };

const GROUPS: { key: SettingsKey; label: string; description: string }[] = [
  { key: "fees", label: "Fees", description: "Commission, service fee, GST, protection plan, late fees and penalties." },
  { key: "cancellationPolicies", label: "Cancellation", description: "Refund tiers per policy, by hours of notice before the rental starts." },
  { key: "booking", label: "Booking rules", description: "Timeouts, windows and limits for the booking lifecycle." },
  { key: "trust", label: "Trust & safety", description: "KYC thresholds, moderation and automated flagging." },
  { key: "featuredPlans", label: "Featured plans", description: "Paid boosts owners can buy for a listing." },
  { key: "pro", label: "Owner Pro", description: "Subscription price and listing limits." },
  { key: "legal", label: "Legal", description: "Current document versions users must accept." },
];

export default function AdminSettingsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<SettingsKey>("fees");
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: async () => (await api.get<SettingsResponse>("/admin/settings")).data });

  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorPanel message={apiError(q.error, "Couldn't load settings")} onRetry={() => q.refetch()} />;
  const group = GROUPS.find((g) => g.key === tab)!;

  return (
    <div>
      <PageHeader title="Fees & policies" subtitle="Changes apply to new quotes and bookings immediately. Existing bookings keep the terms they were created with." />
      {!isAdmin && <ReadOnlyNotice />}
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={GROUPS.map((g) => ({ value: g.key, label: g.label }))} />
      {/* key forces a fresh draft when switching groups */}
      <GroupEditor key={tab} settingKey={tab} title={group.label} description={group.description} value={q.data.settings[tab]} defaults={q.data.defaults[tab]} readOnly={!isAdmin} />
    </div>
  );
}

// ======================================================================
// Group editor: draft state, dirty tracking, save + reset-to-defaults
// ======================================================================

function GroupEditor<K extends SettingsKey>({ settingKey, title, description, value, defaults, readOnly }: { settingKey: K; title: string; description: string; value: PlatformSettings[K]; defaults: PlatformSettings[K]; readOnly: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PlatformSettings[K]>(value);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => setDraft(value), [value]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const isDefault = JSON.stringify(value) === JSON.stringify(defaults);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/settings/${settingKey}`, draft);
      toast.success(`${title} settings saved`);
      await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["config"] });
    } catch (e) {
      toast.error(apiError(e, "Couldn't save settings"));
    } finally {
      setSaving(false);
    }
  };

  const editor = (() => {
    const set = setDraft as (v: unknown) => void;
    switch (settingKey) {
      case "fees": return <FeesEditor v={draft as PlatformSettings["fees"]} set={set} />;
      case "cancellationPolicies": return <CancellationEditor v={draft as PlatformSettings["cancellationPolicies"]} set={set} readOnly={readOnly} />;
      case "booking": return <BookingEditor v={draft as PlatformSettings["booking"]} set={set} />;
      case "trust": return <TrustEditor v={draft as PlatformSettings["trust"]} set={set} readOnly={readOnly} />;
      case "featuredPlans": return <FeaturedEditor v={draft as PlatformSettings["featuredPlans"]} set={set} readOnly={readOnly} />;
      case "pro": return <ProEditor v={draft as PlatformSettings["pro"]} set={set} />;
      case "legal": return <LegalEditor v={draft as PlatformSettings["legal"]} set={set} />;
      default: return null;
    }
  })();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{description}</p>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {isDefault && !dirty && <span className="text-xs text-slate-500">Using defaults</span>}
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} disabled={saving || JSON.stringify(draft) === JSON.stringify(defaults)} onClick={() => setResetOpen(true)}>
              Reset to defaults
            </Button>
          </div>
        )}
      </div>
      {settingKey === "fees" ? (
        // The live example stays interactive for read-only users, so it sits outside the disabled fieldset.
        <div className="grid gap-4 xl:grid-cols-3">
          <fieldset disabled={readOnly} className="min-w-0 xl:col-span-2">
            {editor}
          </fieldset>
          <div>
            <div className="xl:sticky xl:top-20">
              <FeeExample fees={draft as PlatformSettings["fees"]} />
            </div>
          </div>
        </div>
      ) : (
        <fieldset disabled={readOnly} className="min-w-0">
          {editor}
        </fieldset>
      )}

      {!readOnly && (
        <div className={clsx("sticky bottom-3 z-10 mt-5 flex items-center justify-end gap-2 rounded-2xl border bg-white/95 p-3 shadow-[var(--shadow-pop)] backdrop-blur transition", dirty ? "border-brand-200 opacity-100" : "pointer-events-none border-transparent opacity-0")} aria-hidden={!dirty}>
          <span className="mr-auto pl-2 text-sm font-medium text-slate-700">Unsaved changes</span>
          <Button variant="ghost" size="sm" onClick={() => setDraft(value)} disabled={saving} icon={<X className="h-4 w-4" />}>
            Discard
          </Button>
          <Button size="sm" onClick={save} loading={saving} icon={<Save className="h-4 w-4" />}>
            Save {title.toLowerCase()}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        tone="primary"
        title={`Reset ${title.toLowerCase()} to defaults?`}
        description="The form will be filled with the platform defaults. Review, then click Save to apply."
        confirmLabel="Load defaults"
        onConfirm={() => {
          setDraft(defaults);
          setResetOpen(false);
        }}
      />
    </div>
  );
}

// ======================================================================
// Inputs
// ======================================================================

/**
 * Numeric input that keeps its own text state (so partial input like "12."
 * works) and converts between a display unit and the stored unit.
 */
function NumInput({
  label, value, onChange, toDisplay = (v) => v, fromDisplay = (v) => v, suffix, prefix, hint, step = "any", min = 0, max, integer, className,
}: {
  label: ReactNode; value: number; onChange: (v: number) => void; toDisplay?: (v: number) => number; fromDisplay?: (v: number) => number;
  suffix?: string; prefix?: string; hint?: ReactNode; step?: string; min?: number; max?: number; integer?: boolean; className?: string;
}) {
  const fmt = (v: number) => String(Math.round(toDisplay(v) * 10000) / 10000);
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    // Sync when changed externally (reset/discard) but not while typing an equivalent value
    if (Number(text) !== Math.round(toDisplay(value) * 10000) / 10000) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const n = Number(text);
  const invalid = text.trim() === "" || !Number.isFinite(n) || n < min || (max != null && n > max);
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      <span className="relative block">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(v)) {
              const stored = fromDisplay(v);
              onChange(integer ? Math.round(stored) : Math.round(stored * 1e6) / 1e6);
            }
          }}
          className={clsx("input tabular-nums", prefix && "pl-8", suffix && "pr-14", invalid && "border-red-400")}
          aria-invalid={invalid}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">{suffix}</span>}
      </span>
      {invalid ? <span className="mt-1 block text-xs text-red-600">Enter a value{max != null ? ` between ${min} and ${max}` : ` ≥ ${min}`}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

/** Fraction (0.15) shown as percent (15%). */
const Pct = (p: Omit<Parameters<typeof NumInput>[0], "toDisplay" | "fromDisplay" | "suffix"> & { maxPct?: number }) => (
  <NumInput {...p} suffix="%" max={p.maxPct ?? 100} toDisplay={(v) => v * 100} fromDisplay={(v) => v / 100} />
);
/** Paise shown as rupees. */
const Rupees = (p: Omit<Parameters<typeof NumInput>[0], "toDisplay" | "fromDisplay" | "prefix" | "integer">) => (
  <NumInput {...p} prefix="₹" integer toDisplay={(v) => v / 100} fromDisplay={(v) => v * 100} />
);

function TextInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const Grid = ({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) => (
  <div className={clsx("grid gap-4", cols === 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>{children}</div>
);

// ======================================================================
// Fees
// ======================================================================

type Fees = PlatformSettings["fees"];

function FeesEditor({ v, set }: { v: Fees; set: (v: Fees) => void }) {
  const up = <K extends keyof Fees>(k: K, val: Fees[K]) => set({ ...v, [k]: val });
  const pp = v.protectionPlan;
  const lf = v.lateFee;
  return (
    <div className="space-y-4">
        <Panel title="Commission & service fee">
          <Grid>
            <Pct label="Owner commission" value={v.ownerCommissionRate} onChange={(x) => up("ownerCommissionRate", x)} maxPct={50} hint="Deducted from owner payout" />
            <Pct label="Pro owner commission" value={v.proOwnerCommissionRate} onChange={(x) => up("proOwnerCommissionRate", x)} maxPct={50} hint="For Owner Pro subscribers" />
            <Pct label="Renter service fee" value={v.renterServiceFeeRate} onChange={(x) => up("renterServiceFeeRate", x)} maxPct={30} hint="Added to renter total" />
            <Pct label="GST on platform fees" value={v.gstRate} onChange={(x) => up("gstRate", x)} maxPct={30} hint="Service fee, commission, protection" />
          </Grid>
        </Panel>

        <Panel title="Damage protection plan">
          <Toggle label="Offer damage protection at checkout" description="Optional add-on for renters that covers accidental damage." checked={pp.enabled} onChange={(x) => up("protectionPlan", { ...pp, enabled: x })} />
          <div className={clsx("mt-4 space-y-4", !pp.enabled && "opacity-50")}>
            <Segmented label="Pricing type" value={pp.type} onChange={(t) => up("protectionPlan", { ...pp, type: t, value: t === pp.type ? pp.value : t === "PERCENT" ? 0.08 : 9900 })} options={[{ value: "PERCENT", label: "% of rent" }, { value: "FLAT", label: "Flat fee" }]} />
            <Grid>
              {pp.type === "PERCENT" ? (
                <Pct label="Plan price" value={pp.value} onChange={(x) => up("protectionPlan", { ...pp, value: x })} hint="Percentage of rent" />
              ) : (
                <Rupees label="Plan price" value={pp.value} onChange={(x) => up("protectionPlan", { ...pp, value: x })} hint="Flat per booking" />
              )}
              <Rupees label="Minimum fee" value={pp.minFee} onChange={(x) => up("protectionPlan", { ...pp, minFee: x })} hint="Applies to % pricing" />
              <Rupees label="Coverage cap" value={pp.coverageCap} onChange={(x) => up("protectionPlan", { ...pp, coverageCap: x })} hint="Max damage covered" />
            </Grid>
          </div>
        </Panel>

        <Panel title="Delivery">
          <Grid>
            <Pct label="Platform delivery margin" value={v.deliveryMarginRate} onChange={(x) => up("deliveryMarginRate", x)} hint="Kept on platform-operated delivery" />
            <Rupees label="Delivery base fee" value={v.platformDeliveryBaseFee} onChange={(x) => up("platformDeliveryBaseFee", x)} />
            <Rupees label="Delivery per km" value={v.platformDeliveryPerKm} onChange={(x) => up("platformDeliveryPerKm", x)} />
          </Grid>
        </Panel>

        <Panel title="Late returns & owner cancellations">
          <Grid>
            <NumInput label="Late fee multiplier" value={lf.multiplier} onChange={(x) => up("lateFee", { ...lf, multiplier: x })} max={10} suffix="× day" hint="Per late day × daily price" />
            <Pct label="Platform share of late fee" value={lf.platformShare} onChange={(x) => up("lateFee", { ...lf, platformShare: x })} hint="Rest goes to owner" />
            <NumInput label="Grace period" value={lf.graceHours} onChange={(x) => up("lateFee", { ...lf, graceHours: x })} max={48} suffix="hours" />
            <Pct label="Owner cancellation penalty" value={v.ownerCancellationPenaltyRate} onChange={(x) => up("ownerCancellationPenaltyRate", x)} hint="Of rent, on paid bookings" />
            <Rupees label="Minimum penalty" value={v.ownerCancellationPenaltyMin} onChange={(x) => up("ownerCancellationPenaltyMin", x)} />
          </Grid>
        </Panel>
    </div>
  );
}

/** Live example mirroring server pricing.calculateBreakdown(). */
function FeeExample({ fees }: { fees: Fees }) {
  const [rentRs, setRentRs] = useState(1000);
  const [protection, setProtection] = useState(false);
  const [pro, setPro] = useState(false);
  const r = useMemo(() => {
    const rent = Math.round(rentRs * 100);
    const commissionRate = pro ? fees.proOwnerCommissionRate : fees.ownerCommissionRate;
    const serviceFee = Math.round(rent * fees.renterServiceFeeRate);
    const pp = fees.protectionPlan;
    const protectionFee = protection && pp.enabled ? (pp.type === "FLAT" ? Math.round(pp.value) : Math.max(pp.minFee, Math.round(rent * pp.value))) : 0;
    const renterGst = Math.round((serviceFee + protectionFee) * fees.gstRate);
    const commission = Math.round(rent * commissionRate);
    const commissionGst = Math.round(commission * fees.gstRate);
    const renterPays = rent + serviceFee + protectionFee + renterGst;
    const ownerGets = rent - commission - commissionGst;
    const platform = serviceFee + commission + protectionFee;
    return { rent, serviceFee, protectionFee, renterGst, commission, commissionGst, renterPays, ownerGets, platform, gst: renterGst + commissionGst, takeRate: rent ? platform / rent : 0 };
  }, [rentRs, protection, pro, fees]);

  const Row = ({ l, v, strong, muted }: { l: string; v: number; strong?: boolean; muted?: boolean }) => (
    <div className={clsx("flex justify-between gap-2", strong ? "font-semibold text-slate-900" : muted ? "text-slate-500" : "text-slate-700")}>
      <span>{l}</span>
      <span className="tabular-nums">{money(v)}</span>
    </div>
  );

  return (
    <Panel title="Live example">
      <div className="space-y-3">
        <label className="block">
          <span className="label">Rent</span>
          <span className="relative block">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">₹</span>
            <input type="number" min={0} className="input pl-8" value={rentRs} onChange={(e) => setRentRs(Math.max(0, Number(e.target.value) || 0))} />
          </span>
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={protection} onChange={(e) => setProtection(e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Protection</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={pro} onChange={(e) => setPro(e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Pro owner</label>
        </div>
      </div>
      <div className="mt-4 space-y-1 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Renter</p>
        <Row l="Rent" v={r.rent} />
        <Row l="Service fee" v={r.serviceFee} />
        {r.protectionFee > 0 && <Row l="Protection" v={r.protectionFee} />}
        <Row l="GST" v={r.renterGst} />
        <Row l="Renter pays (excl. deposit)" v={r.renterPays} strong />
        <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</p>
        <Row l="Commission" v={-r.commission} muted />
        <Row l="GST on commission" v={-r.commissionGst} muted />
        <Row l="Owner receives" v={r.ownerGets} strong />
        <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Platform</p>
        <Row l="Platform earns (ex-GST)" v={r.platform} strong />
        <Row l="GST collected" v={r.gst} muted />
      </div>
      <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
        Effective take rate: <b>{(r.takeRate * 100).toFixed(1)}%</b> of rent
      </p>
    </Panel>
  );
}

// ======================================================================
// Cancellation policies
// ======================================================================

function CancellationEditor({ v, set, readOnly }: { v: PlatformSettings["cancellationPolicies"]; set: (v: PlatformSettings["cancellationPolicies"]) => void; readOnly: boolean }) {
  const policies: PolicyName[] = ["FLEXIBLE", "MODERATE", "STRICT"];
  const update = (p: PolicyName, tiers: PlatformSettings["cancellationPolicies"][PolicyName]) => set({ ...v, [p]: tiers });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {policies.map((p) => {
        const tiers = v[p] ?? [];
        return (
          <Panel key={p} title={<span className="capitalize">{p.toLowerCase()}</span>}>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-slate-500">
                <span>Hours before start ≥</span>
                <span>Rent refund</span>
                <span className="w-8" />
              </div>
              {tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                  <NumInput label={<span className="sr-only">Hours before</span>} value={t.hoursBefore} onChange={(x) => update(p, tiers.map((tt, j) => (j === i ? { ...tt, hoursBefore: x } : tt)))} suffix="h" />
                  <NumInput label={<span className="sr-only">Refund percent</span>} value={t.refundPercent} max={100} onChange={(x) => update(p, tiers.map((tt, j) => (j === i ? { ...tt, refundPercent: x } : tt)))} suffix="%" />
                  <button type="button" onClick={() => update(p, tiers.filter((_, j) => j !== i))} disabled={tiers.length <= 1 || readOnly} className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="Remove tier">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {!readOnly && (
                <Button type="button" variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => update(p, [...tiers, { hoursBefore: 0, refundPercent: 0 }])}>
                  Add tier
                </Button>
              )}
              <TierSummary tiers={tiers} />
            </div>
          </Panel>
        );
      })}
      <p className="text-xs text-slate-500 lg:col-span-3">
        The first tier whose hour threshold is met (checked from the longest notice down) sets the rent refund. Service fees are refunded only on a 100% refund; deposit, delivery and protection are always refunded. Owner/admin cancellations always refund in full.
      </p>
    </div>
  );
}

function TierSummary({ tiers }: { tiers: { hoursBefore: number; refundPercent: number }[] }) {
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  return (
    <ul className="mt-2 space-y-0.5 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
      {sorted.map((t, i) => (
        <li key={i}>
          {t.hoursBefore > 0 ? `≥ ${t.hoursBefore}h before` : "Any time before start"} → <b>{t.refundPercent}%</b> rent back
        </li>
      ))}
      {!sorted.some((t) => t.hoursBefore === 0) && <li className="text-amber-700">Later cancellations → 0% (no 0h tier)</li>}
    </ul>
  );
}

// ======================================================================
// Booking rules
// ======================================================================

function BookingEditor({ v, set }: { v: PlatformSettings["booking"]; set: (v: PlatformSettings["booking"]) => void }) {
  const up = (k: keyof typeof v) => (x: number) => set({ ...v, [k]: x });
  return (
    <Panel>
      <Grid cols={4}>
        <NumInput label="Request expiry" value={v.requestExpiryHours} onChange={up("requestExpiryHours")} min={1} max={168} suffix="hours" hint="Owner must respond within" />
        <NumInput label="Payment window" value={v.paymentWindowHours} onChange={up("paymentWindowHours")} min={1} max={72} suffix="hours" hint="Renter pays after acceptance" />
        <NumInput label="Instant-book payment window" value={v.instantPaymentWindowMinutes} onChange={up("instantPaymentWindowMinutes")} min={5} max={240} suffix="min" />
        <NumInput label="Inspection window" value={v.inspectionWindowHours} onChange={up("inspectionWindowHours")} min={1} max={168} suffix="hours" hint="Owner checks item after return" />
        <NumInput label="Payout delay" value={v.payoutDelayHours} onChange={up("payoutDelayHours")} max={720} suffix="hours" hint="After completion" />
        <NumInput label="Overdue → auto dispute" value={v.overdueAutoDisputeDays} onChange={up("overdueAutoDisputeDays")} min={1} max={30} suffix="days" />
        <NumInput label="Max advance booking" value={v.maxAdvanceDays} onChange={up("maxAdvanceDays")} min={1} max={730} suffix="days" />
        <NumInput label="Min lead time" value={v.minLeadTimeHours} onChange={up("minLeadTimeHours")} max={72} suffix="hours" />
      </Grid>
    </Panel>
  );
}

// ======================================================================
// Trust
// ======================================================================

function TrustEditor({ v, set, readOnly }: { v: PlatformSettings["trust"]; set: (v: PlatformSettings["trust"]) => void; readOnly: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Verification & moderation">
        <div className="space-y-4">
          <Rupees label="Require renter KYC above" value={v.kycRequiredAboveAmount} onChange={(x) => set({ ...v, kycRequiredAboveAmount: x })} hint="Booking total that triggers mandatory ID verification" />
          <Toggle label="Listing moderation" description="New and edited listings wait in the review queue before going live." checked={v.listingModeration} onChange={(x) => set({ ...v, listingModeration: x })} disabled={readOnly} />
          <Toggle label="Instant booking requires KYC" description="Owners must be ID-verified to enable instant booking." checked={v.instantBookingRequiresKyc} onChange={(x) => set({ ...v, instantBookingRequiresKyc: x })} disabled={readOnly} />
        </div>
      </Panel>
      <Panel title="Automated flags">
        <Grid cols={2}>
          <NumInput label="Cancellation flag threshold" value={v.cancellationFlagThreshold} min={1} integer step="1" onChange={(x) => set({ ...v, cancellationFlagThreshold: x })} suffix="cancels" hint="Flag users after this many cancellations" />
          <NumInput label="Off-platform flag threshold" value={v.offPlatformFlagThreshold} min={1} integer step="1" onChange={(x) => set({ ...v, offPlatformFlagThreshold: x })} suffix="attempts" hint="Contact-sharing attempts in chat" />
        </Grid>
      </Panel>
      <Panel title={`Prohibited keywords (${v.prohibitedKeywords.length})`} className="lg:col-span-2">
        <TagEditor tags={v.prohibitedKeywords} onChange={(t) => set({ ...v, prohibitedKeywords: t })} readOnly={readOnly} />
        <p className="mt-2 text-xs text-slate-500">Listings containing these words are blocked and the attempt is flagged. 2–60 characters each; phrases allowed.</p>
      </Panel>
    </div>
  );
}

function TagEditor({ tags, onChange, readOnly }: { tags: string[]; onChange: (t: string[]) => void; readOnly: boolean }) {
  const [text, setText] = useState("");
  const add = () => {
    const items = text.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2 && s.length <= 60 && !tags.includes(s));
    if (items.length) onChange([...tags, ...Array.from(new Set(items))]);
    setText("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
            {t}
            {!readOnly && (
              <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label={`Remove ${t}`}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-3 flex gap-2">
          <input
            className="input h-9 max-w-sm py-1.5"
            placeholder="Add keyword(s), comma separated"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            aria-label="New prohibited keyword"
          />
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={!text.trim()}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// Featured plans, Pro, Legal
// ======================================================================

function FeaturedEditor({ v, set, readOnly }: { v: PlatformSettings["featuredPlans"]; set: (v: PlatformSettings["featuredPlans"]) => void; readOnly: boolean }) {
  const up = (i: number, patch: Partial<PlatformSettings["featuredPlans"][number]>) => set(v.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <Panel>
      <div className="space-y-3">
        {v.length === 0 && <p className="text-sm text-slate-500">No featured plans — owners won't be able to boost listings.</p>}
        {v.map((p, i) => {
          const codeInvalid = !/^[A-Z0-9_]+$/.test(p.code);
          return (
            <div key={i} className="grid items-start gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1.4fr_0.8fr_1fr_auto]">
              <label className="block">
                <span className="label">Code</span>
                <input className={clsx("input font-mono uppercase", codeInvalid && "border-red-400")} value={p.code} onChange={(e) => up(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} />
              </label>
              <TextInput label="Name" value={p.name} onChange={(x) => up(i, { name: x })} />
              <NumInput label="Days" value={p.days} min={1} max={365} integer step="1" onChange={(x) => up(i, { days: x })} />
              <Rupees label="Price" value={p.price} onChange={(x) => up(i, { price: x })} hint={p.days ? `${money(Math.round(p.price / p.days))}/day` : undefined} />
              {!readOnly && (
                <button type="button" onClick={() => set(v.filter((_, j) => j !== i))} className="mt-7 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove plan">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
        {!readOnly && v.length < 10 && (
          <Button type="button" variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => set([...v, { code: `BOOST_${v.length + 1}`, name: "New boost", days: 7, price: 19900 }])}>
            Add plan
          </Button>
        )}
      </div>
    </Panel>
  );
}

function ProEditor({ v, set }: { v: PlatformSettings["pro"]; set: (v: PlatformSettings["pro"]) => void }) {
  return (
    <Panel>
      <Grid cols={4}>
        <Rupees label="Price" value={v.price} onChange={(x) => set({ ...v, price: x })} hint={`per ${v.periodDays} days`} />
        <NumInput label="Billing period" value={v.periodDays} min={1} integer step="1" onChange={(x) => set({ ...v, periodDays: x })} suffix="days" />
        <NumInput label="Max listings (free)" value={v.maxListingsFree} min={1} integer step="1" onChange={(x) => set({ ...v, maxListingsFree: x })} />
        <NumInput label="Max listings (Pro)" value={v.maxListingsPro} min={1} integer step="1" onChange={(x) => set({ ...v, maxListingsPro: x })} />
      </Grid>
    </Panel>
  );
}

function LegalEditor({ v, set }: { v: PlatformSettings["legal"]; set: (v: PlatformSettings["legal"]) => void }) {
  return (
    <Panel>
      <Grid>
        <TextInput label="Rental agreement version" value={v.rentalAgreementVersion} onChange={(x) => set({ ...v, rentalAgreementVersion: x })} hint="Stamped on every new booking" />
        <TextInput label="Terms of service version" value={v.termsVersion} onChange={(x) => set({ ...v, termsVersion: x })} />
        <TextInput label="Privacy policy version" value={v.privacyVersion} onChange={(x) => set({ ...v, privacyVersion: x })} />
      </Grid>
      <p className="mt-3 text-xs text-slate-500">Bump a version after publishing updated legal text so acceptance records stay accurate.</p>
    </Panel>
  );
}
