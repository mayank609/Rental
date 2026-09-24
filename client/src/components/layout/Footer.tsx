import { Link } from "react-router-dom";
import { Logo, PLATFORM_NAME } from "./Header";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white pb-20 md:pb-0">
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-slate-600">Rent anything from people near you. Save money, earn from idle stuff and help the planet by sharing more and buying less.</p>
          <p className="mt-4 text-xs text-slate-500">Secure payments by Razorpay · Deposits held in escrow · Verified community</p>
        </div>
        <FooterCol title="Explore" links={[["Browse cities", "/cities"], ["How it works", "/how-it-works"], ["Trust & safety", "/trust-and-safety"], ["Owner Pro", "/dashboard/pro"]]} />
        <FooterCol title="Earn" links={[["List an item", "/dashboard/listings/new"], ["Earnings", "/dashboard/earnings"], ["Boost a listing", "/dashboard/listings"]]} />
        <FooterCol title="Legal" links={[["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"], ["Rental Agreement", "/rental-agreement"], ["Refund & Cancellation", "/refund-policy"]]} />
      </div>
      <div className="border-t border-slate-100 py-5 text-center text-xs text-slate-500">© {new Date().getFullYear()} {PLATFORM_NAME}. Made in India 🇮🇳 · Prices in INR incl. applicable GST on platform fees.</div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map(([label, to]) => (
          <li key={to}>
            <Link to={to} className="text-sm text-slate-600 hover:text-brand-700">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
