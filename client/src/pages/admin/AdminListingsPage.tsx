/**
 * Listing moderation: review queue (PENDING_REVIEW) + all listings, preview
 * drawer with images/details, and moderation actions (approve, reject with
 * reason, pause, verify, feature for N days).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, Check, ExternalLink, Eye, ImageOff, Package, Pause, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { CONDITION_LABEL, displayPrice, fmtDate, fmtDateTime, listingPath, money } from "@/lib/format";
import { Badge, Button, Input, Modal, Tabs, Textarea } from "@/components/ui";
import { FilterBar, FilterSelect, KeyValue, Mono, PageHeader, SearchInput, StatusPill, Thumb } from "@/components/admin/AdminUi";
import { CellActions, DataTable, type Column } from "@/components/admin/DataTable";
import { Drawer } from "@/components/admin/Drawer";
import { cleanParams, useAdminMutation, useUrlFilters } from "@/components/admin/hooks";
import type { AdminCity, AdminListing, PageMeta } from "@/components/admin/types";

type ModAction = "approve" | "reject" | "pause" | "verify" | "unverify" | "feature" | "unfeature";
const ACTION_LABEL: Record<ModAction, string> = {
  approve: "Approve", reject: "Reject", pause: "Pause", verify: "Mark verified", unverify: "Remove verified", feature: "Feature", unfeature: "Remove featured",
};
const ACTION_DONE: Record<ModAction, string> = {
  approve: "Listing approved and live", reject: "Listing rejected — owner notified", pause: "Listing paused", verify: "Listing marked verified",
  unverify: "Verified badge removed", feature: "Listing featured", unfeature: "Featured placement removed",
};

export default function AdminListingsPage() {
  const [f, setF] = useUrlFilters({ tab: "queue", q: "", status: "", city: "", page: "1" });
  const [preview, setPreview] = useState<AdminListing | null>(null);
  const [pending, setPending] = useState<{ listing: AdminListing; action: ModAction } | null>(null);

  const status = f.tab === "queue" ? "PENDING_REVIEW" : f.status;
  const q = useQuery({
    queryKey: ["admin", "listings", { ...f, status }],
    queryFn: async () => (await api.get<{ listings: AdminListing[]; meta: PageMeta }>("/admin/listings", { params: cleanParams({ q: f.q, city: f.city, page: f.page, status }) })).data,
    placeholderData: keepPreviousData,
  });
  const queueCount = useQuery({
    queryKey: ["admin", "listings", "queue-count"],
    queryFn: async () => (await api.get<{ meta: PageMeta }>("/admin/listings", { params: { status: "PENDING_REVIEW", limit: 1 } })).data.meta.total,
  });
  const cities = useQuery({ queryKey: ["admin", "cities"], queryFn: async () => (await api.get<{ cities: AdminCity[] }>("/admin/cities")).data.cities });

  const moderate = useAdminMutation<{ id: string; action: ModAction; reason?: string; days?: number }, { listing: { id: string; status: string; isVerified: boolean; featuredUntil: string | null } }>({
    fn: async ({ id, ...body }) => (await api.post(`/admin/listings/${id}/moderate`, body)).data,
    invalidate: [["admin", "listings"], ["admin", "dashboard"]],
    success: (_d, v) => ACTION_DONE[v.action],
    onSuccess: (d) => {
      setPending(null);
      // Keep the open preview in sync without refetching the whole row
      setPreview((p) => (p && p.id === d.listing.id ? { ...p, status: d.listing.status as AdminListing["status"], isVerified: d.listing.isVerified, featuredUntil: d.listing.featuredUntil, isFeatured: Boolean(d.listing.featuredUntil && new Date(d.listing.featuredUntil) > new Date()) } : p));
    },
  });

  /** Quick actions run immediately; reject/feature (and destructive pause) ask for input first. */
  const run = (listing: AdminListing, action: ModAction) => {
    if (action === "reject" || action === "feature" || action === "pause") setPending({ listing, action });
    else moderate.mutate({ id: listing.id, action });
  };

  const columns: Column<AdminListing>[] = [
    {
      key: "title", header: "Listing", sort: (l) => l.title,
      cell: (l) => (
        <div className="flex min-w-0 items-center gap-3">
          {l.images[0] ? <img src={l.images[0].thumbUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><ImageOff className="h-4 w-4" /></span>}
          <div className="min-w-0">
            <p className="max-w-[280px] truncate font-medium text-slate-900">{l.title}</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              {l.category?.name ?? "—"}
              {l.isVerified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" aria-label="Verified" />}
              {l.isFeatured && <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-label="Featured" />}
            </p>
          </div>
        </div>
      ),
    },
    { key: "owner", header: "Owner", hideBelow: "md", sort: (l) => l.owner?.name ?? "", cell: (l) => (l.owner ? <Link to={`/admin/users/${l.owner.id}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap hover:text-brand-700">{l.owner.name}</Link> : "—") },
    { key: "city", header: "City", hideBelow: "sm", sort: (l) => l.location.city?.name ?? "", cell: (l) => <span>{l.location.city?.name ?? "—"}{l.location.locality && <span className="block text-xs text-slate-500">{l.location.locality.name}</span>}</span> },
    { key: "price", header: "Price", align: "right", sort: (l) => displayPrice(l.pricing).amount, cell: (l) => { const p = displayPrice(l.pricing); return <span className="tabular-nums">{money(p.amount)}<span className="text-xs text-slate-500">/{p.unit}</span></span>; } },
    { key: "status", header: "Status", sort: (l) => l.status, cell: (l) => <StatusPill status={l.status} /> },
    { key: "flags", header: "Flags", align: "center", sort: (l) => l.openFlags, cell: (l) => (l.openFlags ? <Badge tone="red" icon={<AlertTriangle className="h-3 w-3" />}>{l.openFlags}</Badge> : <span className="text-slate-300">—</span>) },
    { key: "updated", header: "Updated", hideBelow: "lg", sort: (l) => l.updatedAt, cell: (l) => fmtDate(l.updatedAt) },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      cell: (l) => (
        <CellActions>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setPreview(l)} aria-label="Preview">
            <Eye className="h-4 w-4" />
          </Button>
          {l.status === "PENDING_REVIEW" && (
            <>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => run(l, "reject")} aria-label="Reject">
                <X className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" className="h-8" onClick={() => run(l, "approve")} disabled={moderate.isPending}>
                <Check className="h-4 w-4" /> Approve
              </Button>
            </>
          )}
        </CellActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Listings" subtitle="Moderate new listings, verify quality and manage featured placements." />
      <Tabs
        className="mb-4"
        value={f.tab}
        onChange={(v) => setF({ tab: v, status: "" })}
        tabs={[
          { value: "queue", label: "Review queue", count: queueCount.data },
          { value: "all", label: "All listings" },
        ]}
      />
      <FilterBar>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Title or listing ID" />
        {f.tab === "all" && (
          <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ status: v })} options={[{ value: "", label: "Any status" }, ...["ACTIVE", "PENDING_REVIEW", "PAUSED", "REJECTED", "DRAFT", "ARCHIVED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() }))]} />
        )}
        <FilterSelect label="City" value={f.city} onChange={(v) => setF({ city: v })} options={[{ value: "", label: "All cities" }, ...(cities.data ?? []).map((c) => ({ value: c.slug, label: c.name }))]} />
      </FilterBar>
      <DataTable
        caption="Listings"
        columns={columns}
        rows={q.data?.listings}
        rowKey={(l) => l.id}
        loading={q.isLoading}
        onRowClick={setPreview}
        meta={q.data?.meta}
        onPageChange={(p) => setF({ page: String(p) })}
        empty={f.tab === "queue" ? { title: "Review queue is empty", description: "New listings appear here when moderation is enabled in Trust settings.", icon: <Check className="h-5 w-5" /> } : { title: "No listings found", icon: <Package className="h-5 w-5" /> }}
      />

      {/* Preview drawer */}
      <Drawer
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.title}
        width="max-w-2xl"
        footer={preview && <ModerationButtons listing={preview} onAction={(a) => run(preview, a)} busy={moderate.isPending} />}
      >
        {preview && <ListingPreview l={preview} />}
      </Drawer>

      <ModerateDialog pending={pending} onClose={() => setPending(null)} loading={moderate.isPending} onSubmit={(body) => pending && moderate.mutate({ id: pending.listing.id, action: pending.action, ...body })} />
    </div>
  );
}

function ModerationButtons({ listing: l, onAction, busy }: { listing: AdminListing; onAction: (a: ModAction) => void; busy: boolean }) {
  return (
    <>
      {l.status !== "ACTIVE" && l.status !== "ARCHIVED" && (
        <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => onAction("approve")} disabled={busy}>
          Approve
        </Button>
      )}
      {l.status !== "REJECTED" && (
        <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => onAction("reject")} disabled={busy}>
          Reject
        </Button>
      )}
      {l.status === "ACTIVE" && (
        <Button size="sm" variant="outline" icon={<Pause className="h-4 w-4" />} onClick={() => onAction("pause")} disabled={busy}>
          Pause
        </Button>
      )}
      <Button size="sm" variant="outline" icon={<BadgeCheck className="h-4 w-4" />} onClick={() => onAction(l.isVerified ? "unverify" : "verify")} disabled={busy}>
        {l.isVerified ? "Unverify" : "Verify"}
      </Button>
      <Button size="sm" variant="outline" icon={<Sparkles className="h-4 w-4" />} onClick={() => onAction(l.isFeatured ? "unfeature" : "feature")} disabled={busy}>
        {l.isFeatured ? "Unfeature" : "Feature"}
      </Button>
    </>
  );
}

function ListingPreview({ l }: { l: AdminListing }) {
  const p = l.pricing;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={l.status} />
        {l.isVerified && <Badge tone="green">Verified</Badge>}
        {l.isFeatured && <Badge tone="amber">Featured{l.featuredUntil ? ` until ${fmtDate(l.featuredUntil)}` : ""}</Badge>}
        {l.openFlags > 0 && <Badge tone="red">{l.openFlags} open flag{l.openFlags > 1 ? "s" : ""}</Badge>}
        {l.status === "ACTIVE" && (
          <a href={listingPath(l)} target="_blank" rel="noreferrer" className="link ml-auto inline-flex items-center gap-1 text-sm">
            Public page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {l.rejectionReason && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Rejection reason: {l.rejectionReason}</p>}
      {l.images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {l.images.map((img, i) => (
            <Thumb key={img.id} src={img.mediumUrl || img.url} alt={`${l.title} photo ${i + 1}`} className="aspect-[4/3] w-full" />
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-100 p-6 text-center text-sm text-slate-500">No photos</p>
      )}
      <KeyValue
        items={[
          { label: "Owner", value: l.owner ? <Link className="link" to={`/admin/users/${l.owner.id}`}>{l.owner.name}</Link> : "—" },
          { label: "Category", value: [l.category?.name, l.subcategory?.name].filter(Boolean).join(" › ") },
          { label: "Location", value: [l.location.locality?.name, l.location.city?.name].filter(Boolean).join(", ") },
          { label: "Address", value: l.address ? `${l.address.line1}, ${l.address.locality}${l.address.pincode ? ` ${l.address.pincode}` : ""}` : "—" },
          { label: "Condition", value: CONDITION_LABEL[l.condition] ?? l.condition },
          { label: "Cancellation", value: l.cancellationPolicy.toLowerCase() },
          { label: "Pricing", value: [p.hourly && `${money(p.hourly)}/hr`, p.daily && `${money(p.daily)}/day`, p.weekly && `${money(p.weekly)}/wk`, p.monthly && `${money(p.monthly)}/mo`].filter(Boolean).join(" · ") },
          { label: "Deposit", value: money(p.securityDeposit) },
          { label: "Fulfilment", value: [l.pickupAvailable && "Pickup", l.deliveryAvailable && `Delivery${l.deliveryFee ? ` (${money(l.deliveryFee)})` : ""}`].filter(Boolean).join(", ") },
          { label: "Instant booking", value: l.instantBooking ? "Yes" : "No" },
          { label: "Views / bookings", value: `${l.viewCount ?? 0} / ${l.bookingCount}` },
          { label: "Created", value: fmtDateTime(l.createdAt) },
          { label: "ID", value: <Mono>{l.id}</Mono> },
        ]}
      />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</p>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{l.description || "—"}</p>
      </div>
      {l.rules && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rules</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{l.rules}</p>
        </div>
      )}
    </div>
  );
}

/** Collects the reason (reject/pause) or featured days before moderating. */
function ModerateDialog({ pending, onClose, onSubmit, loading }: { pending: { listing: AdminListing; action: ModAction } | null; onClose: () => void; onSubmit: (b: { reason?: string; days?: number }) => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");
  const action = pending?.action;
  const needsReason = action === "reject";
  const daysNum = Number(days);
  const invalid = (needsReason && reason.trim().length < 3) || (action === "feature" && !(daysNum >= 1 && daysNum <= 90));

  return (
    <Modal
      open={Boolean(pending)}
      onClose={() => { onClose(); setReason(""); }}
      title={action ? `${ACTION_LABEL[action]} listing` : ""}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={action === "reject" ? "danger" : "primary"}
            loading={loading}
            disabled={invalid}
            onClick={() => {
              onSubmit(action === "feature" ? { days: daysNum } : { reason: reason.trim() || undefined });
              setReason("");
            }}
          >
            {action ? ACTION_LABEL[action] : ""}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        <b className="text-slate-900">{pending?.listing.title}</b>
        {action === "reject" && " — the owner is notified with your reason and can edit and resubmit."}
        {action === "pause" && " will be hidden from search until the owner re-activates it."}
        {action === "feature" && " will be boosted in search results and carousels."}
      </p>
      {action === "feature" ? (
        <Input label="Feature for (days)" name="days" type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} hint="1–90 days, starting now." />
      ) : (
        <Textarea label={needsReason ? "Reason (shown to owner)" : "Note (optional)"} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={needsReason ? "e.g. Photos don't show the actual item" : ""} autoFocus />
      )}
    </Modal>
  );
}
