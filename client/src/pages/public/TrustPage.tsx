/** Trust & safety: how verification, escrow, evidence, disputes and privacy work. */
import { Link } from "react-router-dom";
import {
  Ban, BadgeCheck, Camera, EyeOff, Fingerprint, Flag, Gavel, Lock, MessageSquareLock, Phone, ShieldCheck, Siren, Wallet,
} from "lucide-react";
import type { ComponentType } from "react";
import { usePlatformConfig } from "@/hooks/useConfig";
import { money } from "@/lib/format";
import { Seo } from "@/components/Seo";
import { Skeleton } from "@/components/ui";
import { PageHero } from "@/components/public/common";

type IconT = ComponentType<{ className?: string }>;

function Feature({ icon: Icon, title, children, tone = "brand" }: { icon: IconT; title: string; children: React.ReactNode; tone?: "brand" | "green" | "amber" | "rose" }) {
  const tones = { brand: "bg-brand-50 text-brand-600", green: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", rose: "bg-rose-50 text-rose-600" };
  return (
    <div className="card p-6">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone]}`}><Icon className="h-6 w-6" /></span>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

export default function TrustPage() {
  const { data: cfg, isLoading } = usePlatformConfig();
  const name = cfg?.platformName ?? "RentNest";

  return (
    <>
      <Seo title="Trust & safety" description={`How ${name} protects renters and owners: verified users, escrow deposits, photo evidence at handover, fair disputes and private chat.`} />
      <PageHero tone="dark" eyebrow="Trust & safety" title="Built so you can rent from a stranger with confidence" subtitle="Verification, escrow, evidence and a real human team — working together on every single rental." />

      <div className="container-page space-y-20 py-16 pb-24 md:pb-16">
        {/* Pillars */}
        <section>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Feature icon={BadgeCheck} title="Verified identities" tone="green">
              <p><Phone className="mr-1 inline h-4 w-4" /> Every user verifies a mobile number by OTP before booking or listing.</p>
              <p><Fingerprint className="mr-1 inline h-4 w-4" /> Bookings above {cfg ? money(cfg.kycRequiredAboveAmount) : "a threshold"} require government ID verification (KYC), reviewed by our team.</p>
              <p>Verified members carry a green badge on their profile and listings.</p>
            </Feature>
            <Feature icon={Wallet} title="Deposits held in escrow">
              <p>The refundable security deposit is collected with the booking and held by {name} — never by the owner.</p>
              <p>It's released automatically after the item is returned and the {cfg?.booking.inspectionWindowHours ?? 48}-hour inspection window passes without a claim.</p>
            </Feature>
            <Feature icon={Camera} title="Photo evidence at handover" tone="amber">
              <p>At pickup and return, both people complete an in-app checklist with timestamped, location-tagged photos.</p>
              <p>These records are the primary evidence if anything is disputed — so there's no "he said, she said".</p>
            </Feature>
            <Feature icon={Gavel} title="Fair dispute resolution" tone="rose">
              <p>Damage, late returns or items not as described? Raise a dispute from the booking with photos and a claim amount.</p>
              <p>Our team reviews both checklists, the chat history and evidence, then decides deposit deductions and refunds.</p>
              <p><Link to="/refund-policy" className="link">See timelines →</Link></p>
            </Feature>
            <Feature icon={MessageSquareLock} title="Private, masked chat">
              <p>Chat with owners inside the app. Phone numbers, emails and payment handles are automatically masked until a booking is confirmed.</p>
              <p>This keeps everyone on-platform, where payments and deposits are protected.</p>
            </Feature>
            <Feature icon={ShieldCheck} title="Damage protection" tone="green">
              <p>Renters can add a protection plan at checkout{cfg ? ` covering accidental damage up to ${money(cfg.fees.protectionPlan.coverageCap)}` : ""}.</p>
              <p>Owners get peace of mind, renters avoid losing their deposit over an honest accident.</p>
            </Feature>
          </div>
        </section>

        {/* Payments */}
        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Secure payments</p>
            <h2 className="mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">Pay on {name}. Always.</h2>
            <p className="mt-3 text-slate-600">
              Payments are processed by Razorpay (PCI-DSS compliant) via UPI, cards, netbanking and wallets. We never see or store your card details. Owners are paid only after the rental is complete.
            </p>
            <div className="mt-5 rounded-2xl bg-rose-50 p-5 ring-1 ring-rose-100">
              <p className="flex items-center gap-2 font-semibold text-rose-800"><Siren className="h-5 w-5" /> Never pay outside the app</p>
              <p className="mt-1 text-sm text-rose-700">If someone asks you to pay by direct UPI, cash or bank transfer, it's a red flag. Off-platform payments aren't protected and can lead to account suspension. Please report it.</p>
            </div>
          </div>
          <ol className="relative space-y-6 border-l-2 border-dashed border-brand-200 pl-8">
            {[
              [Lock, "You pay securely", "Rent, fees, GST and the deposit are collected through Razorpay."],
              [ShieldCheck, `${name} holds the funds`, "Nothing reaches the owner until the rental has happened."],
              [Camera, "Handover & return checklists", "Both sides document condition with photos."],
              [Wallet, "Money is released", "Owner gets paid; your deposit comes back after inspection."],
            ].map(([Icon, t, d], i) => {
              const I = Icon as IconT;
              return (
                <li key={i} className="relative">
                  <span className="absolute -left-[3.05rem] flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white ring-4 ring-slate-50"><I className="h-4 w-4" /></span>
                  <p className="font-semibold text-slate-900">{t as string}</p>
                  <p className="text-sm text-slate-600">{d as string}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Prohibited items */}
        <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 sm:p-10">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Ban className="h-6 w-6" /></span>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Prohibited items</h2>
              <p className="mt-1 text-slate-600">Listings are automatically screened. Anything illegal, dangerous or regulated is not allowed, including items related to:</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {isLoading ? (
              Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-7 w-20 rounded-full" />)
            ) : (
              cfg?.prohibitedKeywords.map((k) => (
                <span key={k} className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium capitalize text-red-700 ring-1 ring-red-100">{k}</span>
              ))
            )}
          </div>
          <p className="mt-5 text-sm text-slate-500">Also prohibited: stolen goods, items you don't own, recalled products and anything that violates Indian law. Listings that break these rules are removed and accounts may be banned.</p>
        </section>

        {/* Tips + report */}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="card p-6 sm:p-8">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><EyeOff className="h-5 w-5 text-brand-600" /> Safety tips</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700 marker:text-brand-500">
              <li>Meet in a well-lit public place or a society gate for pickups when possible.</li>
              <li>Check the item works before you complete the handover checklist.</li>
              <li>Take clear photos of every side, serial numbers and accessories.</li>
              <li>Keep all communication in the app chat.</li>
              <li>Read reviews and look for the Verified badge.</li>
              <li>Return on time — set a reminder for the return slot.</li>
            </ul>
          </div>
          <div className="card flex flex-col p-6 sm:p-8">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Flag className="h-5 w-5 text-rose-600" /> See something? Report it.</h2>
            <p className="mt-3 text-sm text-slate-700">Use the “Report” link on any listing, profile or message. Reports are confidential and reviewed by our trust team, and listings with multiple reports are paused automatically while we investigate.</p>
            <p className="mt-3 text-sm text-slate-700">You can also block a user from their profile to stop all contact.</p>
            <p className="mt-auto pt-5 text-sm text-slate-600">
              Urgent concern? Write to <a className="link" href={`mailto:${cfg?.supportEmail ?? "support@rentnest.in"}`}>{cfg?.supportEmail ?? "support@rentnest.in"}</a>. In an emergency, call 112.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
