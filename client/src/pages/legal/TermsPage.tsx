/** Terms of Service. */
import { Link } from "react-router-dom";
import { usePlatformConfig } from "@/hooks/useConfig";
import { money, pct } from "@/lib/format";
import { LegalLayout, type LegalSection } from "@/components/public/LegalLayout";
import { PLATFORM_NAME } from "@/components/layout/Header";

export default function TermsPage() {
  const { data: cfg } = usePlatformConfig();
  const name = cfg?.platformName ?? PLATFORM_NAME;
  const company = cfg?.companyName ?? `${name} Technologies Pvt. Ltd.`;
  const support = cfg?.supportEmail ?? "support@rentnest.in";

  const sections: LegalSection[] = [
    {
      id: "about",
      title: "About these terms",
      body: (
        <>
          <p>
            These Terms of Service (“Terms”) govern your use of {name}, operated by {company}. By creating an account or using the platform you agree to these Terms, our{" "}
            <Link to="/privacy">Privacy Policy</Link>, the <Link to="/rental-agreement">Rental Agreement</Link> and the <Link to="/refund-policy">Refund & Cancellation Policy</Link>.
          </p>
          <p>
            {name} is an online marketplace and an <strong>intermediary</strong> under the Information Technology Act, 2000. We connect owners and renters; we do not own, inspect or rent the items
            listed, and we are not a party to the rental contract between users except as a payment and deposit facilitator.
          </p>
        </>
      ),
    },
    {
      id: "eligibility",
      title: "Eligibility & accounts",
      body: (
        <ul>
          <li>You must be at least 18 years old and able to form a binding contract under Indian law.</li>
          <li>You must verify a mobile number before booking or listing. Bookings above {cfg ? money(cfg.kycRequiredAboveAmount) : "a threshold set by us"} require government ID verification.</li>
          <li>Keep your login secure. You are responsible for activity on your account. One person, one account.</li>
          <li>Information you provide must be accurate and kept up to date.</li>
        </ul>
      ),
    },
    {
      id: "owners",
      title: "Listing items (owners)",
      body: (
        <ul>
          <li>You must own the item or be authorised to rent it, and it must be safe, legal, clean and as described.</li>
          <li>Prohibited items (weapons, drugs, alcohol, counterfeit goods, wildlife products, stolen property and others listed on our <Link to="/trust-and-safety">Trust & Safety</Link> page) are not allowed.</li>
          <li>Prices, deposit, availability, cancellation policy and rules you set form part of the rental contract.</li>
          <li>You must honour confirmed bookings. Cancelling a paid booking may incur a penalty and affect your listing's visibility.</li>
          <li>You are responsible for your own income-tax and, where applicable, GST obligations on rental income.</li>
        </ul>
      ),
    },
    {
      id: "renters",
      title: "Renting items (renters)",
      body: (
        <ul>
          <li>Use items carefully, lawfully, only for their intended purpose and in line with the owner's rules. No sub-renting.</li>
          <li>Return items on time, clean and in the same condition, apart from normal wear and tear.</li>
          <li>You are liable for damage, loss or theft during the rental period as set out in the Rental Agreement.</li>
          <li>Complete the in-app handover and return checklists with photos — they protect you.</li>
        </ul>
      ),
    },
    {
      id: "fees",
      title: "Fees, payments & deposits",
      body: (
        <>
          <ul>
            <li>Renters pay rent plus a service fee{cfg ? ` (currently ${pct(cfg.fees.renterServiceFeeRate)} of rent)` : ""}, GST on platform fees, optional delivery and protection fees, and a refundable security deposit.</li>
            <li>Owners pay a commission{cfg ? ` (currently ${pct(cfg.fees.ownerCommissionRate)} of rent, ${pct(cfg.fees.proOwnerCommissionRate)} for Owner Pro)` : ""} plus GST, deducted from the payout.</li>
            <li>All payments are processed by our payment partner, Razorpay. Deposits are held by {name} until the rental is completed and inspected.</li>
            <li>Late returns incur a late fee{cfg ? ` of ${cfg.fees.lateFee.multiplier}× the daily rate per day after a ${cfg.fees.lateFee.graceHours}-hour grace period` : ""}.</li>
            <li>All amounts are in Indian Rupees (INR). Tax invoices are issued electronically.</li>
          </ul>
          <p><strong>Never pay outside the platform.</strong> Off-platform payments are not protected and may lead to suspension.</p>
        </>
      ),
    },
    {
      id: "cancellations",
      title: "Cancellations, refunds & disputes",
      body: (
        <p>
          Cancellations and refunds follow the listing's policy and our <Link to="/refund-policy">Refund & Cancellation Policy</Link>. Either party may raise a dispute within the stated windows; our decision on
          funds held by {name} (deposit deductions and refunds) is final for the purpose of those funds, without prejudice to your statutory rights.
        </p>
      ),
    },
    {
      id: "conduct",
      title: "Acceptable use",
      body: (
        <ul>
          <li>No fraud, harassment, discrimination, spam or misleading content.</li>
          <li>No sharing contact details to take transactions off-platform before a booking is confirmed.</li>
          <li>No scraping, reverse engineering or interfering with the platform's security.</li>
          <li>Content you post must not infringe others' rights or violate Rule 3 of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.</li>
        </ul>
      ),
    },
    {
      id: "content",
      title: "Your content",
      body: <p>You keep ownership of photos, listings and reviews you post, and grant {name} a non-exclusive, royalty-free licence to host, display and promote them on and off the platform while they're live.</p>,
    },
    {
      id: "suspension",
      title: "Suspension & termination",
      body: <p>We may remove content, restrict features or suspend accounts that breach these Terms, create risk for others or where required by law. You may delete your account at any time from Settings, subject to completion of active bookings and disputes.</p>,
    },
    {
      id: "liability",
      title: "Disclaimers & limitation of liability",
      body: (
        <>
          <p>The platform is provided “as is”. We do not guarantee the quality, safety or legality of items, or the conduct of users, though we take reasonable steps to verify users and screen listings.</p>
          <p>To the maximum extent permitted by law, {name}'s total liability arising from any booking is limited to the platform fees we received for that booking. Nothing in these Terms excludes liability that cannot be excluded under Indian law, including under the Consumer Protection Act, 2019.</p>
        </>
      ),
    },
    {
      id: "law",
      title: "Governing law & grievances",
      body: (
        <>
          <p>These Terms are governed by the laws of India. Subject to applicable consumer-protection laws, courts at the city of our registered office have exclusive jurisdiction.</p>
          <p>Complaints about content or users can be raised with our Grievance Officer (details in the <Link to="/privacy#grievance">Privacy Policy</Link>) or at <a href={`mailto:${support}`}>{support}</a>.</p>
        </>
      ),
    },
    {
      id: "changes",
      title: "Changes",
      body: <p>We may update these Terms from time to time. We'll notify you of material changes; continued use after changes take effect means you accept them.</p>,
    },
  ];

  return (
    <LegalLayout
      title="Terms of Service"
      description={`The terms that govern renting and listing items on ${name}.`}
      updated="1 September 2026"
      intro={<p>These Terms are written to be readable. The key idea: owners list safe, legal items honestly; renters look after them and return them on time; and {name} holds payments and deposits so both sides are protected.</p>}
      sections={sections}
    />
  );
}
