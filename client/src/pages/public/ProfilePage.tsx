/**
 * Public user profile: identity & trust signals, active listings and
 * reviews split by role, plus block / report actions.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import axios from "axios";
import { Ban, BadgeCheck, CalendarDays, Flag, MessageSquareText, Package, Phone, ShieldCheck, Star, UserX } from "lucide-react";
import { api, apiError } from "@/lib/api";
import type { Listing, PageMeta, PublicUser } from "@/lib/types";
import { fmtDate, fromNow } from "@/lib/format";
import { useAuth } from "@/stores/auth";
import { Seo } from "@/components/Seo";
import { PLATFORM_NAME } from "@/components/layout/Header";
import { Avatar, Button, ButtonLink, EmptyState, Modal, Pagination, Rating, Skeleton, Tabs, VerifiedBadge } from "@/components/ui";
import { ErrorState, ListingGrid } from "@/components/public/common";
import { ReportModal } from "@/components/public/ReportModal";

interface ProfileResponse {
  user: PublicUser;
  listings: Listing[];
  blocked: boolean;
}
interface UserReview {
  id: string;
  rating: number;
  comment: string | null;
  role: "RENTER_TO_OWNER" | "OWNER_TO_RENTER";
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
  listing: { id: string; title: string } | null;
}

type Tab = "RENTER_TO_OWNER" | "OWNER_TO_RENTER";

export default function ProfilePage() {
  const { id = "" } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("RENTER_TO_OWNER");
  const [page, setPage] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const profile = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => (await api.get<ProfileResponse>(`/users/${id}`)).data,
  });
  const reviews = useQuery({
    queryKey: ["user-reviews", id, tab, page],
    queryFn: async () => (await api.get<{ reviews: UserReview[]; meta: PageMeta }>(`/reviews/user/${id}`, { params: { role: tab, page } })).data,
    enabled: Boolean(profile.data),
  });

  const block = useMutation({
    mutationFn: (blocked: boolean) => (blocked ? api.delete(`/users/${id}/block`) : api.post(`/users/${id}/block`)),
    onSuccess: (_r, wasBlocked) => {
      qc.setQueryData<ProfileResponse>(["profile", id], (d) => (d ? { ...d, blocked: !wasBlocked } : d));
      toast.success(wasBlocked ? "User unblocked" : "User blocked. They can't message or book with you.");
      setConfirmBlock(false);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const requireLogin = () => navigate(`/login?next=${encodeURIComponent(`/users/${id}`)}`);

  if (profile.isLoading) {
    return (
      <div className="container-page py-10">
        <div className="flex items-center gap-5"><Skeleton className="h-24 w-24 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-32" /></div></div>
        <div className="mt-10"><ListingGrid loading skeletons={4} /></div>
      </div>
    );
  }
  if (profile.isError || !profile.data) {
    const nf = axios.isAxiosError(profile.error) && profile.error.response?.status === 404;
    return (
      <div className="container-page py-16">
        <Seo title="Profile" noindex />
        {nf ? <EmptyState icon={<UserX className="h-6 w-6" />} title="This profile isn't available" description="The account may have been deleted or suspended." action={<ButtonLink to="/">Go home</ButtonLink>} /> : <ErrorState error={profile.error} onRetry={() => profile.refetch()} />}
      </div>
    );
  }

  const { user: u, listings, blocked } = profile.data;
  const isMe = me?.id === u.id;
  const totalReviews = u.ownerRating.count + u.renterRating.count;

  return (
    <div className="pb-24 md:pb-10">
      <Seo
        title={`${u.name} on ${PLATFORM_NAME}`}
        description={`${u.name} has ${listings.length} item${listings.length === 1 ? "" : "s"} for rent. ${u.ownerRating.count ? `Rated ${u.ownerRating.avg.toFixed(1)}★ by ${u.ownerRating.count} renters.` : ""}`}
        image={u.avatarUrl ?? undefined}
        jsonLd={{ "@context": "https://schema.org", "@type": "Person", name: u.name, image: u.avatarUrl ?? undefined }}
      />

      <div className="h-32 bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500 sm:h-40" />
      <div className="container-page">
        <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Avatar name={u.name} src={u.avatarUrl} size={112} className="ring-4" />
            <div className="pb-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">{u.name} <VerifiedBadge user={u} /></h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><CalendarDays className="h-4 w-4" /> Joined {fmtDate(u.joinedAt)}</p>
            </div>
          </div>
          {isMe ? (
            <ButtonLink to="/dashboard/settings" variant="outline">Edit profile</ButtonLink>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" icon={<Flag className="h-4 w-4" />} onClick={() => (me ? setReportOpen(true) : requireLogin())}>Report</Button>
              <Button
                variant={blocked ? "secondary" : "outline"}
                size="sm"
                icon={<Ban className="h-4 w-4" />}
                loading={block.isPending && !confirmBlock}
                onClick={() => (!me ? requireLogin() : blocked ? block.mutate(true) : setConfirmBlock(true))}
              >
                {blocked ? "Unblock" : "Block"}
              </Button>
            </div>
          )}
        </div>

        {blocked && (
          <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">You've blocked {u.name}. They can't message you or book your items.</p>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[300px_1fr]">
          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="card p-5">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="flex items-center justify-center gap-1 text-2xl font-extrabold text-slate-900"><Star className="h-5 w-5 fill-amber-400 text-amber-400" />{u.ownerRating.count ? u.ownerRating.avg.toFixed(1) : "—"}</p>
                  <p className="text-xs text-slate-500">as owner ({u.ownerRating.count})</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-2xl font-extrabold text-slate-900"><Star className="h-5 w-5 fill-amber-400 text-amber-400" />{u.renterRating.count ? u.renterRating.avg.toFixed(1) : "—"}</p>
                  <p className="text-xs text-slate-500">as renter ({u.renterRating.count})</p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5 text-sm">
                <TrustRow ok={u.phoneVerified} icon={<Phone className="h-4 w-4" />} label="Phone verified" />
                <TrustRow ok={u.idVerified} icon={<BadgeCheck className="h-4 w-4" />} label="Government ID verified" />
                <TrustRow ok={u.isPro} icon={<ShieldCheck className="h-4 w-4" />} label="Owner Pro member" />
              </ul>
            </div>
            {u.bio && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-slate-900">About</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{u.bio}</p>
              </div>
            )}
          </aside>

          {/* Main */}
          <div className="min-w-0 space-y-12">
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900"><Package className="h-5 w-5 text-brand-600" /> {isMe ? "Your" : `${u.name.split(" ")[0]}'s`} items ({listings.length})</h2>
              {listings.length ? <ListingGrid listings={listings} className="xl:grid-cols-3" /> : <EmptyState title="No items listed yet" description={isMe ? "List something you own and start earning." : undefined} action={isMe ? <ButtonLink to="/dashboard/listings/new">List an item</ButtonLink> : undefined} />}
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-2 text-xl font-bold text-slate-900"><MessageSquareText className="h-5 w-5 text-brand-600" /> Reviews ({totalReviews})</h2>
              <Tabs<Tab>
                value={tab}
                onChange={(t) => { setTab(t); setPage(1); }}
                tabs={[
                  { value: "RENTER_TO_OWNER", label: `As owner (${u.ownerRating.count})` },
                  { value: "OWNER_TO_RENTER", label: `As renter (${u.renterRating.count})` },
                ]}
                className="mb-5"
              />
              {reviews.isLoading ? (
                <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : reviews.isError ? (
                <ErrorState error={reviews.error} onRetry={() => reviews.refetch()} />
              ) : !reviews.data?.reviews.length ? (
                <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">No reviews {tab === "RENTER_TO_OWNER" ? "from renters" : "from owners"} yet.</p>
              ) : (
                <>
                  <ul className="space-y-4">
                    {reviews.data.reviews.map((r) => (
                      <li key={r.id} className="card p-5">
                        <div className="flex items-start gap-3">
                          <Avatar name={r.author.name} src={r.author.avatarUrl} size={40} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Link to={`/users/${r.author.id}`} className="text-sm font-semibold text-slate-900 hover:underline">{r.author.name}</Link>
                              <Rating avg={r.rating} count={1} className="[&>span]:hidden" />
                            </div>
                            <p className="text-xs text-slate-500">
                              {fromNow(r.createdAt)}
                              {r.listing && <> · rented <Link to={`/listing/${r.listing.id}`} className="hover:underline">{r.listing.title}</Link></>}
                            </p>
                            {r.comment && <p className="mt-2 text-sm leading-relaxed text-slate-700">{r.comment}</p>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Pagination page={page} totalPages={reviews.data.meta.totalPages} onChange={setPage} />
                </>
              )}
            </section>
          </div>
        </div>
      </div>

      <Modal
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        title={`Block ${u.name}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBlock(false)}>Cancel</Button>
            <Button variant="danger" loading={block.isPending} onClick={() => block.mutate(false)}>Block</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">They won't be able to message you or book your listings, and you won't be able to book theirs. You can unblock anytime.</p>
      </Modal>
      {reportOpen && <ReportModal open onClose={() => setReportOpen(false)} targetType="USER" targetId={u.id} />}
    </div>
  );
}

function TrustRow({ ok, icon, label }: { ok: boolean; icon: React.ReactNode; label: string }) {
  return (
    <li className={ok ? "flex items-center gap-2.5 text-slate-800" : "flex items-center gap-2.5 text-slate-400"}>
      <span className={ok ? "text-emerald-600" : ""}>{icon}</span>
      {label}
      {ok ? <span className="ml-auto text-xs font-semibold text-emerald-600">✓</span> : <span className="ml-auto text-xs">—</span>}
    </li>
  );
}
