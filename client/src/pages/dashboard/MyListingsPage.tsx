/**
 * Owner's listings: status tabs, performance at a glance and actions
 * (edit, calendar, pause/publish, boost, delete, view public page).
 */
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import { AlertTriangle, CalendarRange, Crown, Eye, ExternalLink, ImageOff, MoreVertical, Package, Pause, Pencil, Play, Plus, Rocket, Sparkles, Star, Trash2 } from "lucide-react";
import { api, apiError, apiErrorCode } from "@/lib/api";
import { format } from "date-fns";
import { displayPrice, listingPath, money } from "@/lib/format";
import type { Listing, ListingStatus, PageMeta } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Seo } from "@/components/Seo";
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, Modal, Pagination, Skeleton, Tabs, type Tone } from "@/components/ui";
import { ErrorState, PageHeader } from "@/components/dashboard/common";
import { BoostModal } from "@/components/dashboard/BoostModal";

type TabValue = "" | ListingStatus;
const TABS: { value: TabValue; label: string }[] = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING_REVIEW", label: "In review" },
  { value: "DRAFT", label: "Drafts" },
  { value: "PAUSED", label: "Paused" },
  { value: "REJECTED", label: "Rejected" },
];

const LISTING_STATUS: Record<ListingStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "green" },
  PENDING_REVIEW: { label: "In review", tone: "amber" },
  DRAFT: { label: "Draft", tone: "gray" },
  PAUSED: { label: "Paused", tone: "blue" },
  REJECTED: { label: "Rejected", tone: "red" },
  ARCHIVED: { label: "Archived", tone: "gray" },
};

export default function MyListingsPage() {
  const [params, setParams] = useSearchParams();
  const status = (TABS.some((t) => t.value === params.get("status")) ? params.get("status") : "") as TabValue;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [boosting, setBoosting] = useState<Listing | null>(null);
  const [deleting, setDeleting] = useState<Listing | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["listings", "mine", status, page],
    queryFn: async () => (await api.get<{ listings: Listing[]; meta: PageMeta }>("/listings/mine", { params: { status: status || undefined, page, limit: 12 } })).data,
    placeholderData: keepPreviousData,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, target }: { id: string; target: "ACTIVE" | "PAUSED" }) => (await api.post<{ status: ListingStatus }>(`/listings/${id}/status`, { status: target })).data.status,
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["listings", "mine"] });
      toast.success(s === "PENDING_REVIEW" ? "Submitted for review — we'll notify you once it's live." : s === "ACTIVE" ? "Listing is live" : "Listing paused — it won't appear in search.");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/listings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listings", "mine"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Listing deleted");
      setDeleting(null);
    },
    onError: (e) => {
      if (apiErrorCode(e) === "HAS_ACTIVE_BOOKINGS") {
        setDeleting(null);
        setBlocked("This listing has active or upcoming bookings. Complete or cancel them first — or pause the listing to stop new requests.");
      } else toast.error(apiError(e));
    },
  });

  const listings = q.data?.listings ?? [];
  return (
    <div>
      <Seo title="My listings" noindex />
      <PageHeader
        title="My listings"
        subtitle="Manage your items, availability and promotions."
        action={
          <ButtonLink to="/dashboard/listings/new" icon={<Plus className="h-4 w-4" />}>
            New listing
          </ButtonLink>
        }
      />

      {blocked && (
        <Alert tone="amber" className="mb-4" icon={<AlertTriangle className="h-4 w-4" />} title="Can't delete yet">
          {blocked}{" "}
          <button className="font-semibold underline" onClick={() => setBlocked(null)}>Dismiss</button>
        </Alert>
      )}

      <Tabs value={status} onChange={(v) => setParams(v ? { status: v } : {}, { replace: true })} tabs={TABS} className="mb-5" />

      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card overflow-hidden">
              <Skeleton className="aspect-[16/10] rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !listings.length ? (
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title={status ? `No ${TABS.find((t) => t.value === status)?.label.toLowerCase()} listings` : "List your first item"}
          description={status ? "Try another tab." : "Earn from the things you already own — cameras, tools, camping gear, consoles and more. It takes about 5 minutes."}
          action={!status && <ButtonLink to="/dashboard/listings/new" icon={<Plus className="h-4 w-4" />}>Create a listing</ButtonLink>}
        />
      ) : (
        <>
          <div className={clsx("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", q.isPlaceholderData && "opacity-60")}>
            {listings.map((l) => (
              <ListingTile
                key={l.id}
                l={l}
                busy={setStatus.isPending && setStatus.variables?.id === l.id}
                onEdit={() => navigate(`/dashboard/listings/${l.id}/edit`)}
                onToggle={() => setStatus.mutate({ id: l.id, target: l.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })}
                onBoost={() => setBoosting(l)}
                onDelete={() => setDeleting(l)}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={q.data?.meta.totalPages ?? 1} onChange={(p) => setParams({ ...(status ? { status } : {}), page: String(p) })} />
        </>
      )}

      {!user?.isPro && (q.data?.meta.total ?? 0) >= 5 && (
        <Card className="mt-8 flex flex-col items-start gap-4 bg-gradient-to-r from-amber-50 to-white sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Crown className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Growing your rental business?</p>
            <p className="text-sm text-slate-600">Owner Pro lowers your commission, raises your listing limit and unlocks analytics.</p>
          </div>
          <ButtonLink to="/dashboard/pro" variant="dark">See Owner Pro</ButtonLink>
        </Card>
      )}

      <BoostModal listing={boosting} onClose={() => setBoosting(null)} />
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete listing?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" loading={del.isPending} onClick={() => deleting && del.mutate(deleting.id)} icon={<Trash2 className="h-4 w-4" />}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          “{deleting?.title}” will be removed from search and your profile. Past bookings and invoices are kept. This can't be undone — consider pausing instead.
        </p>
      </Modal>
    </div>
  );
}

function ListingTile({ l, busy, onEdit, onToggle, onBoost, onDelete }: { l: Listing; busy: boolean; onEdit: () => void; onToggle: () => void; onBoost: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const s = LISTING_STATUS[l.status];
  const price = displayPrice(l.pricing);
  const featured = l.featuredUntil && new Date(l.featuredUntil) > new Date();
  const canToggle = l.status === "ACTIVE" || l.status === "PAUSED" || l.status === "DRAFT";

  return (
    <Card padded={false} className="flex flex-col overflow-hidden">
      <div className="relative aspect-[16/10] bg-slate-100">
        {l.images[0] ? <img src={l.images[0].mediumUrl || l.images[0].thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><ImageOff className="h-6 w-6" /></div>}
        <div className="absolute left-2 right-12 top-2 flex flex-wrap gap-1">
          <Badge tone={s.tone} className="shadow-sm">{s.label}</Badge>
          {featured && <Badge tone="amber" icon={<Sparkles className="h-3 w-3" />} className="shadow-sm">Featured · till {format(new Date(l.featuredUntil!), "d MMM")}</Badge>}
        </div>
        <div className="absolute right-2 top-2">
          <button onClick={() => setMenu((m) => !m)} className="rounded-full bg-white/95 p-1.5 text-slate-700 shadow hover:bg-white" aria-label="More actions" aria-expanded={menu}>
            <MoreVertical className="h-4 w-4" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-[var(--shadow-pop)]" role="menu">
                {l.status === "ACTIVE" && (
                  <Link to={listingPath(l)} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50" role="menuitem">
                    <ExternalLink className="h-4 w-4" /> View public page
                  </Link>
                )}
                <Link to={`/dashboard/listings/${l.id}/calendar`} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50" role="menuitem">
                  <CalendarRange className="h-4 w-4" /> Availability
                </Link>
                {l.status === "ACTIVE" && (
                  <button onClick={() => { setMenu(false); onBoost(); }} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50" role="menuitem">
                    <Rocket className="h-4 w-4" /> Boost listing
                  </button>
                )}
                <button onClick={() => { setMenu(false); onDelete(); }} className="flex w-full items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50" role="menuitem">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 font-semibold text-slate-900">{l.title}</h3>
        <p className="mt-0.5 text-sm text-slate-600">
          <b className="text-slate-900">{money(price.amount)}</b> / {price.unit}
          {l.location.city && <span className="text-slate-400"> · {l.location.locality?.name ?? l.location.city.name}</span>}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2 text-center text-xs">
          <div>
            <p className="flex items-center justify-center gap-1 font-bold text-slate-900"><Eye className="h-3.5 w-3.5 text-slate-400" />{l.viewCount ?? 0}</p>
            <p className="text-slate-500">views</p>
          </div>
          <div>
            <p className="font-bold text-slate-900">{l.bookingCount}</p>
            <p className="text-slate-500">bookings</p>
          </div>
          <div>
            <p className="flex items-center justify-center gap-1 font-bold text-slate-900"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{l.rating.count ? l.rating.avg.toFixed(1) : "–"}</p>
            <p className="text-slate-500">{l.rating.count} reviews</p>
          </div>
        </div>
        {l.status === "REJECTED" && l.rejectionReason && (
          <Alert tone="red" className="mt-3 !p-3 text-xs" title="Needs changes">{l.rejectionReason}</Alert>
        )}
        {l.status === "PENDING_REVIEW" && <p className="mt-3 text-xs text-amber-700">Our team is reviewing this listing — usually within a few hours.</p>}
        {l.status === "DRAFT" && !l.images.length && <p className="mt-3 text-xs text-slate-500">Add at least one photo to publish.</p>}
        <div className="mt-auto flex gap-2 pt-4">
          <Button size="sm" variant="outline" className="flex-1" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
            {l.status === "REJECTED" ? "Fix & resubmit" : "Edit"}
          </Button>
          {canToggle && (
            <Button size="sm" variant={l.status === "ACTIVE" ? "ghost" : "secondary"} className="flex-1" loading={busy} icon={l.status === "ACTIVE" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} onClick={onToggle}>
              {l.status === "ACTIVE" ? "Pause" : "Publish"}
            </Button>
          )}
          {l.status === "ACTIVE" && !featured && (
            <Button size="sm" variant="ghost" icon={<Rocket className="h-4 w-4 text-brand-600" />} onClick={onBoost} aria-label="Boost listing" />
          )}
        </div>
      </div>
    </Card>
  );
}
