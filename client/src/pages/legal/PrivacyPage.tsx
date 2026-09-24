/** Privacy Policy aligned with India's Digital Personal Data Protection Act, 2023. */
import { Link } from "react-router-dom";
import { usePlatformConfig } from "@/hooks/useConfig";
import { LegalLayout, type LegalSection } from "@/components/public/LegalLayout";
import { PLATFORM_NAME } from "@/components/layout/Header";

export default function PrivacyPage() {
  const { data: cfg } = usePlatformConfig();
  const name = cfg?.platformName ?? PLATFORM_NAME;
  const company = cfg?.companyName ?? `${name} Technologies Pvt. Ltd.`;
  const support = cfg?.supportEmail ?? "support@rentnest.in";
  const domain = support.split("@")[1] ?? "rentnest.in";
  const grievance = `grievance@${domain}`;
  const privacy = `privacy@${domain}`;

  const sections: LegalSection[] = [
    {
      id: "who-we-are",
      title: "Who we are",
      body: (
        <>
          <p>
            {name} is operated by <strong>{company}</strong> (“{name}”, “we”, “us”). We are the <strong>Data Fiduciary</strong> for personal data processed through our website and apps under the Digital
            Personal Data Protection Act, 2023 (“DPDP Act”) and the rules made under it. You are the <strong>Data Principal</strong>.
          </p>
          <p>This policy explains what we collect, why, how long we keep it and the rights you have. It applies to renters, owners and visitors.</p>
        </>
      ),
    },
    {
      id: "data-we-collect",
      title: "Personal data we collect",
      body: (
        <>
          <table>
            <thead><tr><th>Category</th><th>Examples</th></tr></thead>
            <tbody>
              <tr><td>Account & identity</td><td>Name, email, mobile number, password (hashed), profile photo, bio, Google account ID if you sign in with Google</td></tr>
              <tr><td>Verification (KYC)</td><td>Government ID images and details you upload for high-value rentals; verification outcome</td></tr>
              <tr><td>Listings & bookings</td><td>Items, photos, prices, pickup address and coordinates, booking dates, delivery addresses, handover/return checklists with timestamped and geotagged photos</td></tr>
              <tr><td>Payments</td><td>Order and payment IDs, amounts, refund and payout records, bank/UPI details for payouts. Card data is handled by Razorpay; we never store full card numbers.</td></tr>
              <tr><td>Communications</td><td>In-app messages (with contact details automatically masked), reviews, reports and support tickets</td></tr>
              <tr><td>Location</td><td>Approximate location from your IP, and precise location only if you allow it in your browser, used to show nearby items</td></tr>
              <tr><td>Device & usage</td><td>IP address, browser, device identifiers, pages viewed, searches, cookies and push-notification tokens</td></tr>
            </tbody>
          </table>
        </>
      ),
    },
    {
      id: "purposes",
      title: "Why we use it (purposes)",
      body: (
        <ul>
          <li>Creating and securing your account, including OTP verification and fraud prevention.</li>
          <li>Showing listings near you and running search, bookings, payments, deposits, refunds and payouts.</li>
          <li>Verifying identity for trust and safety, and complying with KYC/AML and tax (GST) obligations.</li>
          <li>Enabling chat between renters and owners, sending booking notifications by SMS, email, WhatsApp or push.</li>
          <li>Resolving disputes using checklists, messages and payment records.</li>
          <li>Improving the service through aggregated analytics.</li>
          <li>Sending marketing communications — <strong>only if you opt in</strong>; you can opt out anytime.</li>
        </ul>
      ),
    },
    {
      id: "consent",
      title: "Consent and legitimate uses",
      body: (
        <>
          <p>
            We process personal data on the basis of your <strong>free, specific, informed and unambiguous consent</strong>, given when you create an account and accept this policy, or for “legitimate uses”
            permitted by Section 7 of the DPDP Act (for example, where you voluntarily provide data for a booking, or where processing is required by law).
          </p>
          <p>
            You may <strong>withdraw consent</strong> at any time from Settings or by writing to <a href={`mailto:${privacy}`}>{privacy}</a>. Withdrawal does not affect processing already carried out, and we may
            need to close your account if the data is essential to the service. Records we must keep by law (e.g. invoices) will be retained as described below.
          </p>
        </>
      ),
    },
    {
      id: "sharing",
      title: "Who we share it with",
      body: (
        <>
          <ul>
            <li><strong>The other party to your booking</strong> — your public profile always; your exact pickup address and contact number only after a booking is confirmed.</li>
            <li><strong>Data Processors</strong> acting on our instructions: payment gateway (Razorpay), cloud hosting, SMS/email/WhatsApp providers, maps and geocoding, and ID-verification partners — under contracts requiring security and confidentiality.</li>
            <li><strong>Authorities</strong> when required by law, court order or to protect safety and prevent fraud.</li>
          </ul>
          <p>We do not sell your personal data.</p>
        </>
      ),
    },
    {
      id: "rights",
      title: "Your rights as a Data Principal",
      body: (
        <>
          <ul>
            <li><strong>Access</strong> — a summary of the personal data we process and the processing activities. You can download a copy from Settings → Privacy (“Export my data”).</li>
            <li><strong>Correction & completion</strong> — update inaccurate or incomplete data from your profile, or ask us to.</li>
            <li><strong>Erasure</strong> — delete your account from Settings. We erase your data unless retention is required for a pending booking, dispute or by law.</li>
            <li><strong>Grievance redressal</strong> — raise a complaint with our Grievance Officer (below). If unresolved, you may approach the Data Protection Board of India.</li>
            <li><strong>Nominate</strong> — nominate another person to exercise your rights in the event of death or incapacity.</li>
          </ul>
          <p>We respond to rights requests within the timelines prescribed under the DPDP Rules. We may ask you to verify your identity first.</p>
        </>
      ),
    },
    {
      id: "retention",
      title: "How long we keep data",
      body: (
        <ul>
          <li>Account data: while your account is active, and erased within a reasonable period after deletion or prolonged inactivity.</li>
          <li>Booking, payment, invoice and GST records: up to 8 years, as required by tax and accounting laws.</li>
          <li>KYC documents: for as long as required by applicable law, then securely deleted.</li>
          <li>Messages and checklists: for the booking's lifetime plus the dispute window, and longer if a dispute or legal claim is open.</li>
          <li>Logs and security data: typically up to 180 days, or longer if required under CERT-In directions.</li>
        </ul>
      ),
    },
    {
      id: "security",
      title: "Security",
      body: (
        <p>
          We use reasonable security safeguards including encryption in transit (TLS), hashed passwords, access controls, short-lived tokens and audit logs. In the event of a personal data breach, we will
          notify the Data Protection Board and affected users as required by the DPDP Act.
        </p>
      ),
    },
    {
      id: "cross-border",
      title: "Cross-border transfers",
      body: (
        <p>
          Our primary infrastructure is in India. Some service providers may process data outside India. Such transfers are made only to countries not restricted by the Central Government under Section 16
          of the DPDP Act and with appropriate contractual safeguards.
        </p>
      ),
    },
    {
      id: "children",
      title: "Children's data",
      body: (
        <p>
          {name} is intended for users aged <strong>18 and above</strong>. We do not knowingly process personal data of children without verifiable parental consent, and we do not track, behaviourally
          monitor or target advertising at children. If you believe a child has created an account, contact us and we will delete it.
        </p>
      ),
    },
    {
      id: "cookies",
      title: "Cookies",
      body: (
        <p>
          We use essential cookies to keep you signed in (a secure, http-only refresh cookie) and local storage for preferences like your selected city. We do not use third-party advertising cookies.
        </p>
      ),
    },
    {
      id: "grievance",
      title: "Grievance Officer & contact",
      body: (
        <>
          <p>For questions, rights requests or complaints, contact our Grievance Officer:</p>
          <p>
            <strong>Grievance Officer</strong>, {company}<br />
            Email: <a href={`mailto:${grievance}`}>{grievance}</a><br />
            Privacy requests: <a href={`mailto:${privacy}`}>{privacy}</a><br />
            General support: <a href={`mailto:${support}`}>{support}</a>
          </p>
          <p>We acknowledge complaints within 24 hours and aim to resolve them within 15 days, consistent with the IT (Intermediary Guidelines) Rules, 2021 and the DPDP Rules.</p>
        </>
      ),
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: <p>We may update this policy. Material changes will be notified in-app or by email, and where required we will seek fresh consent. See also our <Link to="/terms">Terms of Service</Link>.</p>,
    },
  ];

  return (
    <LegalLayout
      title="Privacy Policy"
      description={`How ${name} collects, uses and protects your personal data under India's Digital Personal Data Protection Act, 2023.`}
      updated="1 September 2026"
      intro={<p><strong>In short:</strong> we collect only what's needed to run safe rentals, we never sell your data, contact details stay hidden until a booking is confirmed, and you can access, correct, export or delete your data anytime.</p>}
      sections={sections}
    />
  );
}
