/**
 * Dashboard overview: key stats for both roles, items needing attention,
 * upcoming bookings and account-setup nudges (phone, KYC, payouts).
 */
import { useCallback, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, CalendarCheck, CalendarDays, ChevronRight, Clock, Landmark, Package, Phone, Plus, Search, ShieldCheck, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRange, money } from "@/lib/format";
import type { BookingSummary, PageMeta } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Seo } from "@/components/Seo";
import { StatusBadge } from "@/components/StatusBadge";
import { Alert, Badge, ButtonLink, Card, EmptyState, Skeleton, Stat } from "@/components/ui";
import { BookingListCard, ErrorState, PageHeader, moneyShort, useNotificationEvent } from "@/components/dashboard/common";
import type { DashboardSummary, PayoutAccount } from "@/components/dashboard/types";

export default function OverviewPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const dash = useQuery({ queryKey: ["dashboard"], queryFn: async () => (await api.get<DashboardSummary>("/users/me/dashboard")).data });
  const ownerAction = useQuery({
    queryKey: ["bookings", "owner", "action", "overview"],
    queryFn: async () => (await api.get<{ bookings: BookingSummary[]; meta: PageMeta }>("/bookings", { params: { role: "owner", scope: "action", limit: 5 } })).data,
  });
  const renterAction = useQuery({
    queryKey: ["bookings", "renter", "action", "overview"],
    queryFn: async () => (await api.get<{ bookings: BookingSummary[]; meta: PageMeta }>("/bookings", { params: { role: "renter", scope: "action", limit: 5 } })).data,
  });
  const payout = useQuery({
    queryKey: ["payouts", "account"],
    queryFn: async () => (await api.get<{ account: PayoutAccount | null; kycStatus: string }>("/payouts/account")).data,
  });

  useNotificationEvent(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    }, [qc]),
  );

  const d = dash.data;
  const attention = [...(renterAction.data?.bookings ?? []), ...(ownerAction.data?.bookings ?? [])];
  const isOwner = (d?.listings.total ?? 0) > 0;
  const firstName = user?.name.split(" ")[0] ?? "there";

  // Account set-up nudges
  const nudges: { key: string; tone: "amber" | "blue" | "red"; icon: ReactNode; title: string; body: string; to: string; cta: string }[] = [];
  if (user && !user.phoneVerified)
    nudges.push({ key: "phone", tone: "amber", icon: <Phone className="h-4 w-4" />, title: "Verify your phone number", body: "Required to book items or publish listings. Takes 30 seconds with an OTP.", to: "/verify-phone?next=/dashboard", cta: "Verify now" });
  if (user && user.kycStatus === "NONE" && isOwner)
    nudges.push({ key: "kyc", tone: "blue", icon: <ShieldCheck className="h-4 w-4" />, title: "Get ID-verified", body: "Verified owners earn trust badges, unlock instant booking and receive payouts.", to: "/dashboard/settings#kyc", cta: "Verify ID" });
  if (user?.kycStatus === "REJECTED")
    nudges.push({ key: "kyc-r", tone: "red", icon: <ShieldCheck className="h-4 w-4" />, title: "ID verification was rejected", body: "Please re-submit a clear photo of a valid government ID.", to: "/dashboard/settings#kyc", cta: "Re-submit" });
  if (user?.kycStatus === "PENDING")
    nudges.push({ key: "kyc-p", tone: "blue", icon: <Clock className="h-4 w-4" />, title: "ID verification in review", body: "We usually review documents within 24 hours. We'll notify you when it's done.", to: "/dashboard/settings#kyc", cta: "View status" });
  if (isOwner && payout.isSuccess && !payout.data.account)
    nudges.push({ key: "payout", tone: "amber", icon: <Landmark className="h-4 w-4" />, title: "Add payout details", body: "Add a bank account or UPI ID so we can send your earnings. Payouts are held until you do.", to: "/dashboard/earnings#payout-account", cta: "Add details" });

  return (
    <div>
      <Seo title="Dashboard" noindex />
      <PageHeader
        title={`Hi, ${firstName} 👋`}
        subtitle="Here's what's happening with your rentals and listings."
        action={
          <>
            <ButtonLink to="/search" variant="outline" icon={<Search className="h-4 w-4" />}>Rent something</ButtonLink>
            <ButtonLink to="/dashboard/listings/new" icon={<Plus className="h-4 w-4" />}>List an item</ButtonLink>
          </>
        }
      />

      {nudges.length > 0 && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {nudges.map((n) => (
            <Alert key={n.key} tone={n.tone} icon={n.icon} title={n.title}>
              <p>{n.body}</p>
              <Link to={n.to} className="mt-1.5 inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                {n.cta} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Alert>
          ))}
        </div>
      )}

      {/* Stats */}
      {dash.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : dash.isError ? (
        <ErrorState error={dash.error} onRetry={() => dash.refetch()} />
      ) : d ? (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <Link to="/dashboard/rentals?tab=active" className="block rounded-2xl focus-visible:outline-2">
              <Stat label="Active rentals" value={d.rentals.active} sub={`${d.rentals.upcoming} upcoming`} icon={<CalendarDays className="h-5 w-5" />} tone="violet" />
            </Link>
            <Link to="/dashboard/bookings?tab=action" className="block rounded-2xl">
              <Stat label="Pending requests" value={d.ownerBookings.pendingRequests} sub={`${d.ownerBookings.upcoming} upcoming · ${d.ownerBookings.active} active`} icon={<CalendarCheck className="h-5 w-5" />} tone={d.ownerBookings.pendingRequests ? "amber" : "blue"} />
            </Link>
            <Link to="/dashboard/earnings" className="block rounded-2xl">
              <Stat label="Earnings paid" value={moneyShort(d.earnings.paid)} sub={`${moneyShort(d.earnings.upcoming + d.earnings.pending)} upcoming`} icon={<Wallet className="h-5 w-5" />} tone="green" />
            </Link>
            <Link to="/dashboard/listings" className="block rounded-2xl">
              <Stat label="Listings" value={d.listings.total} sub={`${d.listings.active} active`} icon={<Package className="h-5 w-5" />} tone="brand" />
            </Link>
          </div>
          {d.earnings.onHold > 0 && (
            <Alert tone="red" className="mt-3" icon={<Landmark className="h-4 w-4" />} title={`${money(d.earnings.onHold)} in payouts on hold`}>
              Complete ID verification and payout details to release them. <Link to="/dashboard/earnings" className="font-semibold underline">Review earnings</Link>
            </Alert>
          )}
        </>
      ) : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-5">
        {/* Needs attention */}
        <section className="xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Needs your attention</h2>
            {attention.length > 0 && <Badge tone="amber">{(ownerAction.data?.meta.total ?? 0) + (renterAction.data?.meta.total ?? 0)}</Badge>}
          </div>
          {ownerAction.isLoading || renterAction.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </div>
          ) : ownerAction.isError || renterAction.isError ? (
            <ErrorState error={ownerAction.error ?? renterAction.error} onRetry={() => { ownerAction.refetch(); renterAction.refetch(); }} />
          ) : attention.length ? (
            <div className="space-y-3">
              {attention.map((b) => (
                <div key={b.id}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {b.viewerRole === "RENTER" ? "Complete payment" : b.status === "REQUESTED" ? "Respond to request" : "Inspect returned item"}
                  </p>
                  <BookingListCard b={b} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<BadgeCheck className="h-6 w-6" />} title="You're all caught up" description="Booking requests, payments due and returned items to inspect will show up here." />
          )}
        </section>

        {/* Upcoming */}
        <section className="xl:col-span-2">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Upcoming & in progress</h2>
          <Card padded={false}>
            {dash.isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : d?.upcoming.length ? (
              <ul className="divide-y divide-slate-100">
                {d.upcoming.map((b) => (
                  <li key={b.id}>
                    <Link to={`/dashboard/bookings/${b.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">{b.listing.image && <img src={b.listing.image} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{b.listing.title}</p>
                        <p className="truncate text-xs text-slate-500">{fmtRange(b.startAt, b.endAt)}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <StatusBadge status={b.status} />
                          <span className="text-[11px] font-medium text-slate-500">{b.role === "OWNER" ? "Renting out" : "Renting"}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-6 text-center text-sm text-slate-500">
                No upcoming bookings.{" "}
                <Link to="/search" className="link">Explore items near you</Link>
              </div>
            )}
          </Card>

          {!isOwner && dash.isSuccess && (
            <Card className="mt-4 bg-gradient-to-br from-brand-600 to-violet-600 text-white">
              <p className="text-lg font-bold">Earn from things you don't use</p>
              <p className="mt-1 text-sm text-white/80">List your camera, drill or tent in minutes. Deposits and payments are handled securely.</p>
              <ButtonLink to="/dashboard/listings/new" variant="secondary" className="mt-4" icon={<Plus className="h-4 w-4" />}>Create a listing</ButtonLink>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
