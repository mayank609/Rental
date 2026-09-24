/** Disputes raised by or against the user. */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Gavel, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, money } from "@/lib/format";
import { useAuth } from "@/stores/auth";
import { Seo } from "@/components/Seo";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/dashboard/common";
import { DISPUTE_TYPE_LABEL } from "@/components/dashboard/BookingActionModals";
import type { DisputeSummary } from "@/components/dashboard/types";
import { DISPUTE_STATUS } from "@/components/dashboard/constants";


export default function DisputesPage() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["disputes"], queryFn: async () => (await api.get<{ disputes: DisputeSummary[] }>("/disputes")).data.disputes });
  const open = (q.data ?? []).filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");
  const closed = (q.data ?? []).filter((d) => d.status !== "OPEN" && d.status !== "UNDER_REVIEW");

  const Row = ({ d }: { d: DisputeSummary }) => {
    const mine = d.raisedById === user?.id;
    const s = DISPUTE_STATUS[d.status];
    return (
      <li>
        <Link to={`/dashboard/disputes/${d.id}`} className="flex items-center gap-4 p-4 transition hover:bg-slate-50">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <Gavel className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{DISPUTE_TYPE_LABEL[d.type] ?? d.type}</p>
              <Badge tone={s.tone}>{s.label}</Badge>
              <span className="text-xs text-slate-500">{mine ? "Raised by you" : "Raised against you"}</span>
            </div>
            <p className="truncate text-sm text-slate-600">{d.booking.listing.title} · #{d.booking.code}</p>
            <p className="text-xs text-slate-500">
              Opened {fmtDate(d.createdAt)}
              {d.claimAmount > 0 && ` · Claim ${money(d.claimAmount)}`}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        </Link>
      </li>
    );
  };

  return (
    <div>
      <Seo title="Disputes" noindex />
      <PageHeader title="Disputes" subtitle="Our team reviews checklist photos, messages and evidence from both sides to reach a fair outcome." />
      {q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No disputes" description="If something goes wrong with a rental, you can report it from the booking page. Most issues are resolved by messaging the other party first." />
      ) : (
        <div className="space-y-6">
          {open.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Active</h2>
              <Card padded={false}>
                <ul className="divide-y divide-slate-100">{open.map((d) => <Row key={d.id} d={d} />)}</ul>
              </Card>
            </section>
          )}
          {closed.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Closed</h2>
              <Card padded={false}>
                <ul className="divide-y divide-slate-100">{closed.map((d) => <Row key={d.id} d={d} />)}</ul>
              </Card>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
