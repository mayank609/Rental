/**
 * Featured-listing plan picker → Razorpay checkout. Boosted listings get a
 * "Featured" badge and priority placement in search and on the home page.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import { Rocket, Sparkles, TrendingUp } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtDate, money } from "@/lib/format";
import { startCheckout } from "@/lib/payments";
import type { CheckoutPayload } from "@/lib/types";
import { Alert, Button, Modal, Skeleton } from "@/components/ui";
import type { PlansResponse } from "./types";

export function usePlans() {
  return useQuery({ queryKey: ["monetization", "plans"], queryFn: async () => (await api.get<PlansResponse>("/monetization/plans")).data, staleTime: 10 * 60_000 });
}

export function BoostModal({ listing, onClose }: { listing: { id: string; title: string; featuredUntil?: string | null } | null; onClose: () => void }) {
  const plans = usePlans();
  const qc = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const selected = code ?? plans.data?.featuredPlans[0]?.code ?? null;
  const featuredActive = listing?.featuredUntil && new Date(listing.featuredUntil) > new Date();

  const boost = useMutation({
    mutationFn: async () => {
      const r = await api.post<{ checkout: CheckoutPayload }>("/monetization/promotions", { listingId: listing!.id, planCode: selected });
      const plan = plans.data?.featuredPlans.find((p) => p.code === selected);
      return startCheckout(r.data.checkout, `${plan?.name ?? "Boost"} · ${listing!.title}`);
    },
    onSuccess: (res) => {
      if (res.status === "success") {
        toast.success(res.message ?? "Boost activated! Your listing is now featured.");
        qc.invalidateQueries({ queryKey: ["listings", "mine"] });
        // Activation happens on payment capture — refresh again shortly.
        setTimeout(() => qc.invalidateQueries({ queryKey: ["listings", "mine"] }), 3000);
        onClose();
      } else if (res.status === "cancelled") toast("Payment cancelled");
      else toast.error(res.message ?? "Payment failed");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open={Boolean(listing)}
      onClose={onClose}
      title="Boost your listing"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Not now</Button>
          <Button loading={boost.isPending} disabled={!selected} onClick={() => boost.mutate()} icon={<Rocket className="h-4 w-4" />}>
            Pay & boost
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Get <b>{listing?.title}</b> in front of more renters with a <b>Featured</b> badge, top placement in search results and a spot on the home page carousel in your city.
      </p>
      {featuredActive && (
        <Alert tone="green" className="mt-3" icon={<Sparkles className="h-4 w-4" />}>
          Already featured until {fmtDate(listing!.featuredUntil!)}. A new boost extends it from that date.
        </Alert>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Boost plan">
        {plans.isLoading
          ? [0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : plans.data?.featuredPlans.map((p) => (
              <button
                key={p.code}
                type="button"
                role="radio"
                aria-checked={selected === p.code}
                onClick={() => setCode(p.code)}
                className={clsx("rounded-2xl border p-4 text-left transition", selected === p.code ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:bg-slate-50")}
              >
                <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                  <TrendingUp className="h-4 w-4 text-brand-600" /> {p.name}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{money(p.price)}</p>
                <p className="text-xs text-slate-500">
                  {p.days} days · {money(Math.round(p.price / p.days))}/day
                </p>
              </button>
            ))}
      </div>
      {plans.isError && <Alert tone="red" className="mt-3">{apiError(plans.error)}</Alert>}
    </Modal>
  );
}
