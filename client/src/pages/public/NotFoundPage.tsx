/** 404 page with helpful next steps. */
import { Link } from "react-router-dom";
import { Compass, Home, Search } from "lucide-react";
import { Seo } from "@/components/Seo";
import { ButtonLink } from "@/components/ui";

export default function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
      <Seo title="Page not found" noindex />
      <div className="relative">
        <p aria-hidden className="select-none bg-gradient-to-br from-brand-200 to-violet-200 bg-clip-text text-[8rem] font-black leading-none text-transparent sm:text-[11rem]">404</p>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-lg ring-1 ring-slate-200">
            <Compass className="h-8 w-8" />
          </span>
        </span>
      </div>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900 sm:text-3xl">This page went on a rental and never came back</h1>
      <p className="mt-2 max-w-md text-slate-600">The link may be broken or the page may have moved. Let's get you somewhere useful.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink to="/" icon={<Home className="h-4 w-4" />}>Go home</ButtonLink>
        <ButtonLink to="/search" variant="outline" icon={<Search className="h-4 w-4" />}>Browse items</ButtonLink>
      </div>
      <p className="mt-8 text-sm text-slate-500">
        Popular: <Link to="/cities" className="link">Cities</Link> · <Link to="/how-it-works" className="link">How it works</Link> · <Link to="/trust-and-safety" className="link">Trust & safety</Link>
      </p>
    </div>
  );
}
