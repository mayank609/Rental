/**
 * Owner Pro: plan comparison, subscribe / renew via Razorpay, cancel
 * renewal, and an explainer for featured-listing boosts.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import { BadgeCheck, BarChart3, Check, Crown, Minus, Package, Percent, Rocket, Sparkles, TrendingUp } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtDate, money, pct } from "@/lib/format";
import { startCheckout } from "@/lib/payments";
import type { CheckoutPayload } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Seo } from "@/components/Seo";
import { Alert, Button, ButtonLink, Card, Modal, Skeleton } from "@/components/ui";
import { ErrorState, PageHeader } from "@/components/dashboard/common";
import { usePlans } from "@/components/dashboard/BoostModal";
import type { SubscriptionResponse } from "@/components/dashboard/types";

export default function ProPage() {
  const { refreshUser } = useAuth();
  const qc = useQueryClient();
  const plans = usePlans();
  const sub = useQuery({ queryKey: ["monetization", "subscription"], queryFn: async () => (await api.get<SubscriptionResponse>("/monetization/subscription")).data });
  const [confirmCancel, setConfirmCancel] = useState(false);

  const subscribe = useMutation({
    mutationFn: async () => {
      const r = await api.post<{ checkout: CheckoutPayload }>("/monetization/subscription/pro");
      return startCheckout(r.data.checkout, `Owner Pro — ${plans.data?.pro.periodDays ?? 30} days`);
    },
    onSuccess: async (res) => {
      if (res.status === "success") {
        toast.success(res.message ?? "Welcome to Owner Pro! ⭐");
        await Promise.all([refreshUser().catch(() => undefined), sub.refetch()]);
        // Activation happens when the payment is captured; refresh once more.
        setTimeout(() => {
          sub.refetch();
          refreshUser().catch(() => undefined);
        }, 3000);
        qc.invalidateQueries({ queryKey: ["analytics"] });
      } else if (res.status === "cancelled") toast("Payment cancelled");
      else toast.error(res.message ?? "Payment failed");
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api.post("/monetization/subscription/cancel"),
    onSuccess: () => {
      sub.refetch();
      refreshUser().catch(() => undefined);
      setConfirmCancel(false);
      toast.success("Renewal cancelled. Pro stays active until the end of your period.");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const p = plans.data?.pro;
  const s = sub.data?.subscription;
  const active = sub.data?.active ?? false;
  const cancelled = s?.status === "CANCELLED";
  const daysLeft = s?.currentPeriodEnd ? Math.max(0, Math.ceil((new Date(s.currentPeriodEnd).getTime() - Date.now()) / 86_400_000)) : 0;

  const rows: { label: string; icon: React.ReactNode; free: React.ReactNode; pro: React.ReactNode }[] = p
    ? [
        { label: "Platform commission", icon: <Percent className="h-4 w-4" />, free: pct(p.standardCommissionRate), pro: <b className="text-emerald-700">{pct(p.commissionRate)}</b> },
        { label: "Active listings", icon: <Package className="h-4 w-4" />, free: `Up to ${p.maxListingsFree}`, pro: <b>Up to {p.maxListingsPro}</b> },
        { label: "Owner analytics", icon: <BarChart3 className="h-4 w-4" />, free: <Minus className="mx-auto h-4 w-4 text-slate-300" />, pro: <Check className="mx-auto h-4 w-4 text-emerald-600" /> },
        { label: "Pro badge on profile & listings", icon: <BadgeCheck className="h-4 w-4" />, free: <Minus className="mx-auto h-4 w-4 text-slate-300" />, pro: <Check className="mx-auto h-4 w-4 text-emerald-600" /> },
        { label: "Priority placement in search", icon: <TrendingUp className="h-4 w-4" />, free: <Minus className="mx-auto h-4 w-4 text-slate-300" />, pro: <Check className="mx-auto h-4 w-4 text-emerald-600" /> },
      ]
    : [];

  // Illustrative savings: on ₹20,000/month of rentals.
  const savings = p ? Math.round(2_000_000 * (p.standardCommissionRate - p.commissionRate)) : 0;

  return (
    <div>
      <Seo title="Owner Pro" noindex />
      <PageHeader title="Owner Pro" subtitle="For owners who rent regularly — keep more of every rental." />

      {plans.isLoading || sub.isLoading ? (
        <Skeleton className="h-72 rounded-3xl" />
      ) : plans.isError || sub.isError ? (
        <ErrorState error={plans.error ?? sub.error} onRetry={() => { plans.refetch(); sub.refetch(); }} />
      ) : p ? (
        <>
          {/* Hero / status */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 text-white">
            <Crown className="absolute -right-8 -top-8 h-48 w-48 text-white/5" aria-hidden />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-amber-950">
                  <Crown className="h-3.5 w-3.5" /> Owner Pro
                </span>
                {active ? (
                  <>
                    <h2 className="mt-3 text-2xl font-bold">You're a Pro owner ⭐</h2>
                    <p className="mt-1 text-white/80">
                      {cancelled ? "Renewal cancelled — " : ""}Active until <b>{fmtDate(s!.currentPeriodEnd!)}</b> ({daysLeft} day{daysLeft === 1 ? "" : "s"} left).
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Pay {pct(p.commissionRate)} commission instead of {pct(p.standardCommissionRate)}</h2>
                    <p className="mt-1 text-white/80">Plus more listings, analytics and a Pro badge that builds trust with renters.</p>
                    {savings > p.price && <p className="mt-2 text-sm text-emerald-300">Earning ₹20,000/month? You'd save about {money(savings)} in commission — more than the plan costs.</p>}
                  </>
                )}
              </div>
              <div className="shrink-0 rounded-2xl bg-white/10 p-5 text-center ring-1 ring-white/15 backdrop-blur">
                <p className="text-3xl font-bold">{money(p.price)}</p>
                <p className="text-sm text-white/70">per {p.periodDays} days</p>
                <Button className="mt-4 w-full" variant="secondary" loading={subscribe.isPending} onClick={() => subscribe.mutate()} icon={<Crown className="h-4 w-4" />}>
                  {active ? `Extend ${p.periodDays} days` : s?.status === "EXPIRED" ? "Renew Pro" : "Upgrade to Pro"}
                </Button>
                <p className="mt-2 text-[11px] text-white/60">Prepaid · no auto-debit · invoice included</p>
              </div>
            </div>
          </Card>

          {active && !cancelled && (
            <div className="mt-3 text-right">
              <button onClick={() => setConfirmCancel(true)} className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-red-600 hover:underline">
                Cancel renewal
              </button>
            </div>
          )}
          {s?.status === "PENDING_PAYMENT" && !active && (
            <Alert tone="amber" className="mt-4">Your last payment didn't complete. Tap “Upgrade to Pro” to try again.</Alert>
          )}

          {/* Comparison */}
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Compare plans</h2>
            <Card padded={false} className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-4 text-left font-medium text-slate-500">Feature</th>
                    <th className="w-32 px-4 py-4 text-center">
                      <span className="block font-bold text-slate-900">Free</span>
                      <span className="text-xs font-normal text-slate-500">₹0</span>
                    </th>
                    <th className="w-32 bg-amber-50/60 px-4 py-4 text-center">
                      <span className="flex items-center justify-center gap-1 font-bold text-slate-900"><Crown className="h-4 w-4 text-amber-600" /> Pro</span>
                      <span className="text-xs font-normal text-slate-500">{money(p.price)}/{p.periodDays}d</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td className="px-4 py-3.5 text-slate-700">
                        <span className="flex items-center gap-2"><span className="text-slate-400">{r.icon}</span>{r.label}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-slate-600">{r.free}</td>
                      <td className="bg-amber-50/60 px-4 py-3.5 text-center text-slate-900">{r.pro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          {/* Boosts */}
          <section className="mt-8">
            <h2 className="mb-1 text-lg font-bold text-slate-900">Boost individual listings</h2>
            <p className="mb-4 text-sm text-slate-600">Available on any plan. Featured listings get a badge, top placement in search and a spot on the home page in your city.</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.data!.featuredPlans.map((fp) => (
                <Card key={fp.code} className="flex flex-col">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Rocket className="h-5 w-5" />
                  </div>
                  <p className="mt-3 font-semibold text-slate-900">{fp.name}</p>
                  <p className="text-2xl font-bold text-slate-900">{money(fp.price)}</p>
                  <p className="text-xs text-slate-500">{fp.days} days featured · {money(Math.round(fp.price / fp.days))}/day</p>
                </Card>
              ))}
              <Card className={clsx("flex flex-col justify-between bg-gradient-to-br from-brand-50 to-white")}>
                <div>
                  <Sparkles className="h-5 w-5 text-brand-600" />
                  <p className="mt-2 text-sm text-slate-700">Pick a listing and choose a boost from <b>My listings</b>.</p>
                </div>
                <ButtonLink to="/dashboard/listings?status=ACTIVE" variant="secondary" className="mt-4">Go to My listings</ButtonLink>
              </Card>
            </div>
          </section>

          <p className="mt-8 text-xs text-slate-500">
            The price shown is the amount charged at checkout. Pro is prepaid for {p.periodDays} days and doesn't auto-renew; extending adds {p.periodDays} days to your current period.
          </p>
        </>
      ) : null}

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel Pro renewal?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep Pro</Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel renewal</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You'll keep Pro benefits until {s?.currentPeriodEnd ? fmtDate(s.currentPeriodEnd) : "the end of your period"}. After that, the standard commission and listing limit apply. No refunds for the remaining days.
        </p>
      </Modal>
    </div>
  );
}
