/** How it works — for renters and owners, with live fee transparency and FAQs. */
import { Link } from "react-router-dom";
import { ArrowRight, BadgeIndianRupee, ChevronDown, PackagePlus, Search } from "lucide-react";
import { usePlatformConfig } from "@/hooks/useConfig";
import { money, pct } from "@/lib/format";
import { Seo } from "@/components/Seo";
import { ButtonLink, Skeleton } from "@/components/ui";
import { PageHero } from "@/components/public/common";
import { OWNER_STEPS, RENTER_STEPS, StepsStrip, TrustBadges } from "@/components/public/marketing";

export default function HowItWorksPage() {
  const { data: cfg, isLoading } = usePlatformConfig();
  const name = cfg?.platformName ?? "RentNest";

  const faqs: [string, string][] = [
    ["Who can rent on " + name + "?", "Anyone 18+ with a verified Indian mobile number. For bookings above " + (cfg ? money(cfg.kycRequiredAboveAmount) : "a set amount") + " we also ask for a one-time ID verification (KYC)."],
    ["How is the price calculated?", "You pay the owner's rent (hourly, daily, weekly or monthly — we automatically apply the best rate for your duration), a small service fee, GST on platform fees, optional delivery and protection, plus a refundable security deposit. You see the full breakdown before paying."],
    ["When do I get my deposit back?", `After you return the item, the owner has ${cfg?.booking.inspectionWindowHours ?? 48} hours to inspect it. If they don't raise an issue in that window, your deposit is released automatically to your original payment method.`],
    ["What if the item is damaged?", "The owner can raise a claim with photos. Our team compares the handover and return checklists and decides fairly. Damage protection, if you added it, covers accidental damage up to the plan limit before your deposit is touched."],
    ["What happens if I return late?", cfg ? `There's a ${cfg.fees.lateFee.graceHours}-hour grace period. After that, a late fee of ${cfg.fees.lateFee.multiplier}× the daily rate applies per extra day and may be deducted from your deposit.` : "A late fee applies per extra day after a short grace period."],
    ["Can I cancel?", "Yes. Each listing has a Flexible, Moderate or Strict cancellation policy shown before you book. See our Refund & Cancellation Policy for the exact tiers."],
    ["How do owners get paid?", "Payouts are sent to your bank account or UPI after the rental completes and the inspection window passes. You can track everything in Earnings."],
  ];

  return (
    <>
      <Seo
        title="How it works"
        description={`Renting and earning on ${name} is simple: find items nearby, book with transparent pricing, pay securely and get your deposit back after return.`}
        jsonLd={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }}
      />
      <PageHero eyebrow="How it works" title="Share more. Buy less. Everyone wins." subtitle="Rent what you need from people nearby, or earn from things you already own — with payments, deposits and disputes handled for you.">
        <div className="flex flex-wrap gap-3">
          <a href="#renters" className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-semibold text-brand-700 shadow-lg hover:bg-brand-50"><Search className="h-5 w-5" /> I want to rent</a>
          <a href="#owners" className="inline-flex h-12 items-center gap-2 rounded-xl bg-white/10 px-6 font-semibold text-white ring-1 ring-white/30 hover:bg-white/20"><PackagePlus className="h-5 w-5" /> I want to earn</a>
        </div>
      </PageHero>

      <div className="container-page space-y-20 py-16 pb-24 md:pb-16">
        <section id="renters" className="scroll-mt-24">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">For renters</p>
          <h2 className="mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">Get what you need, for as long as you need it</h2>
          <p className="mt-2 max-w-2xl text-slate-600">No more buying a DSLR for one wedding or a drill for one shelf. Rent by the hour, day, week or month.</p>
          <div className="mt-8"><StepsStrip steps={RENTER_STEPS} /></div>
          <ButtonLink to="/search" className="mt-8" icon={<Search className="h-4 w-4" />}>Start browsing</ButtonLink>
        </section>

        <section id="owners" className="-mx-4 scroll-mt-24 bg-slate-950 px-4 py-14 sm:mx-0 sm:rounded-3xl sm:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">For owners</p>
          <h2 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">Turn idle things into income</h2>
          <p className="mt-2 max-w-2xl text-white/70">You set the prices, rules and availability. We handle verification, payments, deposits and disputes.</p>
          <div className="mt-8"><StepsStrip steps={OWNER_STEPS} dark /></div>
          <ButtonLink to="/dashboard/listings/new" className="mt-8" icon={<PackagePlus className="h-4 w-4" />}>List your first item</ButtonLink>
        </section>

        <section>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Transparent pricing</p>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">No hidden charges. Ever.</h2>
              <p className="mt-3 text-slate-600">Every rupee is shown before you pay — rent, fees, GST and the refundable deposit. Prices are in INR and GST invoices are generated automatically.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {isLoading || !cfg ? (
                Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
              ) : (
                <>
                  <FeeCard label="Renter service fee" value={pct(cfg.fees.renterServiceFeeRate)} note="of rent, covers secure payments & support" />
                  <FeeCard label="Owner commission" value={pct(cfg.fees.ownerCommissionRate)} note={`of rent · just ${pct(cfg.fees.proOwnerCommissionRate)} with Owner Pro`} />
                  <FeeCard label="GST" value={pct(cfg.fees.gstRate)} note="on platform fees only — not on rent" />
                  <FeeCard label="Listing an item" value="Free" note="no sign-up or listing charges" />
                </>
              )}
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-6 text-2xl font-extrabold text-slate-900">Protected at every step</h2>
          <TrustBadges />
          <Link to="/trust-and-safety" className="link mt-4 inline-flex items-center gap-1 text-sm">How we keep you safe <ArrowRight className="h-4 w-4" /></Link>
        </section>

        <section className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-2xl font-extrabold text-slate-900">Frequently asked questions</h2>
          <div className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
            {faqs.map(([q, a]) => (
              <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900">
                  {q}
                  <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function FeeCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card p-5">
      <BadgeIndianRupee className="h-5 w-5 text-brand-600" />
      <p className="mt-3 text-sm font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}
