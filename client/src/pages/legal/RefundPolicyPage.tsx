/**
 * Refund & cancellation policy. Cancellation tiers, inspection window and
 * late-fee terms are rendered from live admin config (/legal/config) so the
 * page always matches what the server enforces.
 */
import { Link } from "react-router-dom";
import { usePlatformConfig } from "@/hooks/useConfig";
import type { CancellationPolicy } from "@/lib/types";
import { money } from "@/lib/format";
import { Skeleton } from "@/components/ui";
import { ErrorState } from "@/components/public/common";
import { CancellationTiers, POLICY_LABEL } from "@/components/public/marketing";
import { LegalLayout, type LegalSection } from "@/components/public/LegalLayout";
import { PLATFORM_NAME } from "@/components/layout/Header";

const POLICY_BLURB: Record<CancellationPolicy, string> = {
  FLEXIBLE: "Best for everyday items. Cancel close to the start date with minimal loss.",
  MODERATE: "A balance for owners and renters — plan a few days ahead for a full refund.",
  STRICT: "For high-demand or high-value items. Refunds only well in advance.",
};

export default function RefundPolicyPage() {
  const config = usePlatformConfig();
  const cfg = config.data;
  const name = cfg?.platformName ?? PLATFORM_NAME;
  const inspect = cfg?.booking.inspectionWindowHours ?? 48;
  const expiry = cfg?.booking.requestExpiryHours ?? 24;

  const sections: LegalSection[] = [
    {
      id: "policies",
      title: "Cancellation policies",
      plain: true,
      body: (
        <>
          <p className="text-[15px] leading-7 text-slate-700">Every listing uses one of three policies, chosen by the owner and shown on the listing and at checkout. The refund percentage applies to the <strong>rent</strong> and depends on how long before the rental start you cancel.</p>
          {config.isLoading ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
          ) : config.isError ? (
            <ErrorState className="mt-4" error={config.error} onRetry={() => config.refetch()} />
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              {(["FLEXIBLE", "MODERATE", "STRICT"] as CancellationPolicy[]).map((p) => (
                <div key={p} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <p className="text-base font-bold text-slate-900">{POLICY_LABEL[p]}</p>
                  <p className="mb-3 text-xs leading-5 text-slate-500">{POLICY_BLURB[p]}</p>
                  <CancellationTiers policy={p} config={cfg} className="[&>p]:hidden" />
                </div>
              ))}
            </div>
          )}
        </>
      ),
    },
    {
      id: "renter-cancellation",
      title: "When the renter cancels",
      body: (
        <ul>
          <li><strong>Before payment</strong> (request not yet accepted or not yet paid): no charge.</li>
          <li><strong>After payment</strong>: you receive the rent refund per the listing's policy above, plus your <strong>full security deposit</strong>, any <strong>delivery fee</strong> and any <strong>protection fee</strong>.</li>
          <li>The <strong>service fee and its GST</strong> are refunded only when you qualify for a 100% rent refund.</li>
          <li>The owner receives the retained portion of rent, less commission.</li>
        </ul>
      ),
    },
    {
      id: "owner-cancellation",
      title: "When the owner cancels",
      body: (
        <>
          <ul>
            <li>The renter receives a <strong>100% refund</strong> of everything paid, including all fees.</li>
            <li>The owner is charged a <strong>cancellation penalty</strong> (a percentage of the rent, subject to a minimum{cfg ? <> — currently {Math.round(cfg.fees.ownerCancellationPenaltyRate * 100)}% of rent, minimum {money(cfg.fees.ownerCancellationPenaltyMin)}</> : null}), deducted from future payouts.</li>
            <li>Repeated cancellations can lower search ranking or lead to suspension.</li>
          </ul>
          <p>If a booking request isn't accepted within {expiry} hours it expires automatically and nothing is charged.</p>
        </>
      ),
    },
    {
      id: "deposit",
      title: "Security deposit release",
      body: (
        <ol>
          <li>The deposit is collected at payment and held by {name} — never by the owner.</li>
          <li>After the renter returns the item, both parties complete the return checklist with photos.</li>
          <li>The owner has <strong>{inspect} hours</strong> to inspect the item and either confirm it's fine or raise a claim.</li>
          <li>If the owner confirms, or doesn't respond within {inspect} hours, the deposit is <strong>released automatically</strong> in full.</li>
          <li>If a claim is raised, only the disputed amount is held; the rest is released.</li>
        </ol>
      ),
    },
    {
      id: "late",
      title: "Late returns",
      body: (
        <p>
          {cfg
            ? <>Returns more than <strong>{cfg.fees.lateFee.graceHours} hours</strong> after the scheduled end incur a late fee of <strong>{cfg.fees.lateFee.multiplier}× the daily rate</strong> for each extra day (or part of a day). </>
            : <>Returns after a short grace period incur a late fee per extra day. </>}
          Late fees may be deducted from the security deposit.
        </p>
      ),
    },
    {
      id: "disputes",
      title: "Disputes: timeline",
      body: (
        <>
          <table>
            <thead><tr><th>Step</th><th>Timeframe</th></tr></thead>
            <tbody>
              <tr><td>Owner raises damage / missing-parts claim</td><td>Within {inspect} hours of return</td></tr>
              <tr><td>Renter raises “not as described” issue</td><td>During the rental, as soon as it's noticed</td></tr>
              <tr><td>Any other dispute (either party)</td><td>Up to 7 days after the rental completes</td></tr>
              <tr><td>Other party adds evidence (photos, notes)</td><td>While the dispute is open — ideally within 48 hours</td></tr>
              <tr><td>{name} reviews checklists, chat and evidence</td><td>Typically 3–5 business days</td></tr>
              <tr><td>Decision applied to held funds</td><td>Immediately after resolution</td></tr>
            </tbody>
          </table>
          <p>Protection plan coverage (if purchased{cfg ? `, up to ${money(cfg.fees.protectionPlan.coverageCap)}` : ""}) is applied to accidental damage before the deposit. See the <Link to="/rental-agreement">Rental Agreement</Link> for liability terms.</p>
        </>
      ),
    },
    {
      id: "timelines",
      title: "Refund timelines",
      body: (
        <ul>
          <li>Refunds are initiated immediately after cancellation or resolution and go back to the <strong>original payment method</strong>.</li>
          <li>UPI and wallets: usually within 1–3 business days. Cards and netbanking: 5–7 business days, depending on your bank.</li>
          <li>You'll get a notification and email with the refund reference.</li>
        </ul>
      ),
    },
    {
      id: "help",
      title: "Need help?",
      body: <p>Contact us from the booking page or at <a href={`mailto:${cfg?.supportEmail ?? "support@rentnest.in"}`}>{cfg?.supportEmail ?? "support@rentnest.in"}</a>. This policy forms part of our <Link to="/terms">Terms of Service</Link>.</p>,
    },
  ];

  return (
    <LegalLayout
      title="Refund & Cancellation Policy"
      description={`How cancellations, refunds, deposits and disputes work on ${name}.`}
      updated="1 September 2026"
      intro={<p><strong>The short version:</strong> your deposit is always protected, owner cancellations are always fully refunded, and rent refunds depend on the listing's policy and how early you cancel.</p>}
      sections={sections}
    />
  );
}
