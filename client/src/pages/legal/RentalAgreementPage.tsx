/** Current versioned rental agreement, rendered from GET /legal/rental-agreement. */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui";
import { ErrorState } from "@/components/public/common";
import { LegalLayout, prose } from "@/components/public/LegalLayout";

interface Clause {
  n: string;
  heading: string;
  text: string;
}

/** Splits the plain-text agreement into preamble, numbered clauses and closing paragraph. */
function parseAgreement(text: string) {
  const paras = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const clauses: Clause[] = [];
  const before: string[] = [];
  const after: string[] = [];
  for (const p of paras.slice(1)) {
    const m = p.match(/^(\d+)\.\s+([A-Z][A-Z &,'-]+)\.\s+(.*)$/);
    if (m) clauses.push({ n: m[1], heading: m[2], text: m[3] });
    else (clauses.length ? after : before).push(p);
  }
  return { title: paras[0] ?? "", before, clauses, after };
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s&,-])(\w)/g, (_m, a: string, b: string) => a + b.toUpperCase());

export default function RentalAgreementPage() {
  const q = useQuery({
    queryKey: ["rental-agreement"],
    queryFn: async () => (await api.get<{ version: string; text: string }>("/legal/rental-agreement")).data,
    staleTime: 30 * 60_000,
  });
  const parsed = q.data ? parseAgreement(q.data.text) : null;

  return (
    <LegalLayout
      title="Rental Agreement"
      description="The agreement accepted by owners and renters for every booking."
      updated={q.data ? `Version ${q.data.version}` : undefined}
      intro={<p>This agreement is accepted electronically by both owner and renter for every booking. The version in force at the time of booking is recorded with the booking.</p>}
      sections={[]}
    >
      {q.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
      ) : q.isError || !parsed ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="card p-6 sm:p-10">
          <p className="text-center text-sm font-bold uppercase tracking-[0.15em] text-slate-900">{parsed.title}</p>
          <div className={`${prose} mt-6`}>
            {parsed.before.map((p) => <p key={p}>{p}</p>)}
          </div>
          <ol className="mt-6 space-y-5">
            {parsed.clauses.map((c) => (
              <li key={c.n} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{c.n}</span>
                <div>
                  <h2 className="font-semibold text-slate-900">{titleCase(c.heading)}</h2>
                  <p className="mt-1 text-[15px] leading-7 text-slate-700">{c.text}</p>
                </div>
              </li>
            ))}
          </ol>
          {parsed.after.length > 0 && (
            <div className="mt-8 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 ring-1 ring-slate-200">
              {parsed.after.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </div>
      )}
    </LegalLayout>
  );
}
