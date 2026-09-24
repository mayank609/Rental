/**
 * Long-form legal page layout: header, sticky table of contents and
 * readable typography (Tailwind typography plugin isn't installed, so
 * element styles are applied via arbitrary descendant variants).
 */
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import { FileText } from "lucide-react";
import { Seo } from "@/components/Seo";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
  /** Skip prose typography (for sections containing custom components). */
  plain?: boolean;
}

const LEGAL_LINKS = [
  ["/terms", "Terms of Service"],
  ["/privacy", "Privacy Policy"],
  ["/rental-agreement", "Rental Agreement"],
  ["/refund-policy", "Refund & Cancellation"],
] as const;

/** Descendant typography for legal copy. */
export const prose =
  "text-[15px] leading-7 text-slate-700 [&_a]:font-medium [&_a]:text-brand-700 [&_a:hover]:underline [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-slate-900 [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p+p]:mt-3 [&_strong]:font-semibold [&_strong]:text-slate-900 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:marker:text-slate-400 [&_table]:mt-3 [&_table]:w-full [&_table]:text-sm [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border-t [&_td]:border-slate-100 [&_td]:px-3 [&_td]:py-2";

export function LegalLayout({ title, description, updated, intro, sections, children }: { title: string; description: string; updated?: string; intro?: ReactNode; sections: LegalSection[]; children?: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="pb-24 md:pb-12">
      <Seo title={title} description={description} />
      <header className="border-b border-slate-200 bg-white">
        <div className="container-page py-10 sm:py-14">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-brand-600"><FileText className="h-4 w-4" /> Legal</p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-900 sm:text-4xl">{title}</h1>
          {updated && <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>}
          <nav aria-label="Legal documents" className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4">
            {LEGAL_LINKS.map(([to, label]) => (
              <Link key={to} to={to} className={clsx("chip shrink-0", pathname === to && "chip-active")}>{label}</Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="container-page grid gap-10 py-10 lg:grid-cols-[240px_1fr]">
        {sections.length > 2 && (
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-24">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
              <ol className="space-y-1.5 border-l border-slate-200 text-sm">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ml-px block border-l border-transparent pl-3 text-slate-600 hover:border-brand-500 hover:text-slate-900">{s.title}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        )}
        <article className={clsx("min-w-0 max-w-3xl", sections.length <= 2 && "lg:col-span-2 lg:mx-auto")}>
          {intro && <div className={clsx(prose, "mb-8 rounded-2xl bg-brand-50/60 p-5 ring-1 ring-brand-100")}>{intro}</div>}
          {children}
          <div className="space-y-10">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-xl font-bold text-slate-900">
                  <span className="mr-2 text-brand-600">{i + 1}.</span>
                  {s.title}
                </h2>
                <div className={clsx(!s.plain && prose, "mt-3")}>{s.body}</div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
