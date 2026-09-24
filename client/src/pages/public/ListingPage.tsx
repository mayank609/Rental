/**
 * Listing detail: gallery, details, owner, availability, approximate
 * location, policies, reviews, similar items and the booking widget.
 */
import { lazy, Suspense, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import clsx from "clsx";
import axios from "axios";
import {
  BadgeCheck, CalendarDays, ClipboardList, Flag, Heart, MapPin, MessageCircle, PackageSearch, Share2, ShieldCheck, Sparkles, Store, Truck, Zap,
} from "lucide-react";
import { api, apiError } from "@/lib/api";
import type { Listing, PageMeta } from "@/lib/types";
import { CONDITION_LABEL, fmtDate, money, fromNow } from "@/lib/format";
import { useAuth } from "@/stores/auth";
import { usePlatformConfig } from "@/hooks/useConfig";
import { Seo } from "@/components/Seo";
import { Avatar, Badge, Button, ButtonLink, EmptyState, Modal, Pagination, Rating, SectionHeader, Skeleton, VerifiedBadge } from "@/components/ui";
import { ErrorState, ListingCarousel, shareUrl } from "@/components/public/common";
import { ImageGallery } from "@/components/public/ImageGallery";
import { AvailabilityCalendar, BookingWidget } from "@/components/public/BookingWidget";
import { defaultFulfillment, useBookingDraft, useCalendarMatchers, type UnavailableRange } from "@/components/public/booking";
import { CancellationTiers, POLICY_LABEL } from "@/components/public/marketing";
import { ReportModal } from "@/components/public/ReportModal";

const ApproxLocationMap = lazy(() => import("@/components/public/ApproxLocationMap"));

interface ListingResponse {
  listing: Listing;
  isOwner: boolean;
  wishlisted: boolean;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
}

export default function ListingPage() {
  const { id = "" } = useParams<{ id: string; slug?: string }>();
  const q = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => (await api.get<ListingResponse>(`/listings/${id}`)).data,
    enabled: Boolean(id),
  });

  if (q.isLoading) return <ListingSkeleton />;
  if (q.isError || !q.data) {
    const notFound = axios.isAxiosError(q.error) && q.error.response?.status === 404;
    return (
      <div className="container-page py-16">
        <Seo title={notFound ? "Listing not found" : "Listing"} noindex />
        {notFound ? (
          <EmptyState
            icon={<PackageSearch className="h-6 w-6" />}
            title="This listing isn't available"
            description="It may have been removed or paused by the owner. Plenty more to explore nearby, though!"
            action={<ButtonLink to="/search">Browse items</ButtonLink>}
          />
        ) : (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </div>
    );
  }
  // Keyed so the booking draft resets when navigating between listings.
  return <ListingView key={q.data.listing.id} data={q.data} />;
}

function ListingView({ data }: { data: ListingResponse }) {
  const { listing, isOwner } = data;
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const config = usePlatformConfig();
  const [draft, setDraft] = useBookingDraft(listing, { fulfillment: defaultFulfillment(listing) });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [descOpen, setDescOpen] = useState(false);

  const availability = useQuery({
    queryKey: ["availability", listing.id],
    queryFn: async () => (await api.get<{ unavailable: UnavailableRange[] }>(`/listings/${listing.id}/availability`)).data.unavailable,
  });
  const { disabled, partial } = useCalendarMatchers(availability.data);

  const reviews = useQuery({
    queryKey: ["listing-reviews", listing.id, reviewPage],
    queryFn: async () => (await api.get<{ reviews: Review[]; meta: PageMeta }>(`/listings/${listing.id}/reviews`, { params: { page: reviewPage } })).data,
  });
  const similar = useQuery({
    queryKey: ["similar", listing.id],
    queryFn: async () => (await api.get<{ listings: Listing[] }>(`/listings/${listing.id}/similar`)).data.listings,
  });

  const requireLogin = () => {
    navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  };

  const wishlist = useMutation({
    mutationFn: () => (data.wishlisted ? api.delete(`/users/me/wishlist/${listing.id}`) : api.post(`/users/me/wishlist/${listing.id}`)),
    onSuccess: () => {
      qc.setQueryData<ListingResponse>(["listing", listing.id], (d) => (d ? { ...d, wishlisted: !d.wishlisted } : d));
      qc.invalidateQueries({ queryKey: ["wishlist"] });
      toast.success(data.wishlisted ? "Removed from wishlist" : "Saved to wishlist");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const message = useMutation({
    mutationFn: async () => (await api.post<{ conversation: { id: string } }>("/chat/conversations", { listingId: listing.id })).data.conversation,
    onSuccess: (c) => navigate(`/dashboard/messages/${c.id}`),
    onError: (e) => toast.error(apiError(e)),
  });

  const onShare = async () => {
    const r = await shareUrl(listing.title);
    if (r === "copied") toast.success("Link copied to clipboard");
    else if (r === "failed") toast.error("Couldn't share this link");
  };

  const owner = listing.owner;
  const place = [listing.location.locality?.name, listing.location.city?.name].filter(Boolean).join(", ");
  const img = listing.images[0];
  const p = listing.pricing;
  const priceFrom = p.daily ?? p.hourly ?? 0;
  const priceUnit = p.daily ? "day" : "hour";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description?.slice(0, 500),
    image: listing.images.map((i) => i.url),
    category: listing.category?.name,
    itemCondition: listing.condition === "NEW" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: (priceFrom / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      url: `${origin}/listing/${listing.id}/${listing.slug}`,
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
    },
    ...(listing.rating.count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: listing.rating.avg, reviewCount: listing.rating.count } } : {}),
  };

  const widgetProps = { listing, isOwner, config: config.data, draft, onDraft: setDraft, disabled, partial };

  return (
    <div className="pb-40 lg:pb-10">
      <Seo
        title={`Rent ${listing.title}${place ? ` in ${place}` : ""}`}
        description={`Rent ${listing.title} for ${money(priceFrom)}/${priceUnit}${place ? ` in ${place}` : ""}. ${listing.description?.slice(0, 120) ?? ""}`}
        image={img?.mediumUrl}
        canonical={`${origin}/listing/${listing.id}/${listing.slug}`}
        jsonLd={jsonLd}
      />

      <div className="container-page pt-4 sm:pt-6">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="mb-3 hidden flex-wrap items-center gap-1 text-xs text-slate-500 sm:flex">
          <Link to="/" className="hover:text-slate-800">Home</Link>
          {listing.location.city && <><span>/</span><Link to={`/rent/${listing.location.city.slug}`} className="hover:text-slate-800">{listing.location.city.name}</Link></>}
          {listing.category && listing.location.city && <><span>/</span><Link to={`/rent/${listing.category.slug}/${listing.location.city.slug}`} className="hover:text-slate-800">{listing.category.name}</Link></>}
        </nav>

        {/* Title row */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {listing.isFeatured && <Badge tone="amber" icon={<Sparkles className="h-3 w-3" />}>Featured</Badge>}
              {listing.instantBooking && <Badge tone="brand" icon={<Zap className="h-3 w-3" />}>Instant book</Badge>}
              {listing.isVerified && <Badge tone="green" icon={<BadgeCheck className="h-3 w-3" />}>Verified item</Badge>}
              {listing.status !== "ACTIVE" && <Badge tone="red">{listing.status.replace(/_/g, " ").toLowerCase()}</Badge>}
            </div>
            <h1 className="text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl">{listing.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <Rating avg={listing.rating.avg} count={listing.rating.count} size="md" />
              <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {place}</span>
              {listing.bookingCount > 0 && <span>{listing.bookingCount} rental{listing.bookingCount === 1 ? "" : "s"}</span>}
            </p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onShare} icon={<Share2 className="h-4 w-4" />}>Share</Button>
            {!isOwner && (
              <Button
                variant="ghost"
                size="sm"
                loading={wishlist.isPending}
                onClick={() => (user ? wishlist.mutate() : requireLogin())}
                aria-pressed={data.wishlisted}
                icon={<Heart className={clsx("h-4 w-4", data.wishlisted && "fill-rose-500 text-rose-500")} />}
              >
                {data.wishlisted ? "Saved" : "Save"}
              </Button>
            )}
          </div>
        </div>

        <ImageGallery images={listing.images} title={listing.title} />

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
          {/* ------------------------------------------------ main column */}
          <div className="min-w-0 space-y-10">
            {/* Owner */}
            {owner && (
              <section className="flex flex-col gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-center sm:justify-between">
                <Link to={`/users/${owner.id}`} className="flex items-center gap-4">
                  <Avatar name={owner.name} src={owner.avatarUrl} size={56} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-slate-900">Listed by {owner.name}</span>
                      <VerifiedBadge user={owner} />
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <Rating avg={owner.ownerRating.avg} count={owner.ownerRating.count} />
                      <span>· Joined {fmtDate(owner.joinedAt)}</span>
                    </span>
                  </span>
                </Link>
                {!isOwner && (
                  <Button variant="outline" loading={message.isPending} onClick={() => (user ? message.mutate() : requireLogin())} icon={<MessageCircle className="h-4 w-4" />}>
                    Message owner
                  </Button>
                )}
              </section>
            )}

            {/* Highlights */}
            <section className="grid gap-4 sm:grid-cols-2">
              <Highlight icon={<ClipboardList className="h-5 w-5" />} title={`Condition: ${CONDITION_LABEL[listing.condition]}`} text={listing.category ? `${listing.category.name}${listing.subcategory ? ` · ${listing.subcategory.name}` : ""}` : ""} />
              <Highlight icon={<ShieldCheck className="h-5 w-5" />} title={`${money(p.securityDeposit)} refundable deposit`} text="Held by the platform, returned after inspection" />
              {listing.pickupAvailable && <Highlight icon={<Store className="h-5 w-5" />} title="Pickup available" text={`From ${place} — exact address shared after confirmation`} />}
              {listing.deliveryAvailable && (
                <Highlight
                  icon={<Truck className="h-5 w-5" />}
                  title={`Delivery ${listing.deliveryFee ? `for ${money(listing.deliveryFee)}` : "— free"}`}
                  text={listing.deliveryRadiusKm ? `Within ${listing.deliveryRadiusKm} km of the item` : "Delivered to your address"}
                />
              )}
              {listing.instantBooking && <Highlight icon={<Zap className="h-5 w-5" />} title="Instant booking" text="No waiting — confirmed as soon as you pay" />}
            </section>

            {/* Description */}
            <section>
              <h2 className="mb-3 text-xl font-bold text-slate-900">About this item</h2>
              <div className={clsx("relative whitespace-pre-line text-[15px] leading-relaxed text-slate-700", !descOpen && (listing.description?.length ?? 0) > 600 && "max-h-60 overflow-hidden")}>
                {listing.description}
                {!descOpen && (listing.description?.length ?? 0) > 600 && <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-50" />}
              </div>
              {(listing.description?.length ?? 0) > 600 && (
                <button className="link mt-2 text-sm" onClick={() => setDescOpen((v) => !v)}>{descOpen ? "Show less" : "Read more"}</button>
              )}
            </section>

            {listing.rules && (
              <section>
                <h2 className="mb-3 text-xl font-bold text-slate-900">Owner's rules</h2>
                <div className="whitespace-pre-line rounded-2xl bg-amber-50/60 p-5 text-sm leading-relaxed text-slate-700 ring-1 ring-amber-100">{listing.rules}</div>
              </section>
            )}

            {/* Availability */}
            {!isOwner && (
              <section>
                <SectionHeader title="Availability" subtitle="Select pickup and return dates. Crossed-out days are booked." />
                <div className="card inline-block max-w-full overflow-x-auto p-4">
                  <AvailabilityCalendar range={draft.range} onChange={(r) => setDraft({ range: r })} disabled={disabled} partial={partial} months={typeof window !== "undefined" && window.innerWidth >= 900 ? 2 : 1} />
                </div>
              </section>
            )}

            {/* Location */}
            <section>
              <h2 className="mb-1 text-xl font-bold text-slate-900">Where you'll pick it up</h2>
              <p className="mb-3 text-sm text-slate-600">{place}{listing.location.city?.state ? `, ${listing.location.city.state}` : ""}</p>
              <div className="h-64 overflow-hidden rounded-2xl ring-1 ring-slate-200 sm:h-80">
                <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                  <ApproxLocationMap lat={listing.location.lat} lng={listing.location.lng} />
                </Suspense>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> Approximate area shown. Exact address shared after booking is confirmed.</p>
            </section>

            {/* Cancellation */}
            <section>
              <h2 className="mb-1 text-xl font-bold text-slate-900">Cancellation policy · {POLICY_LABEL[listing.cancellationPolicy]}</h2>
              <p className="mb-3 text-sm text-slate-600">How much of the rent you get back depends on when you cancel. <Link to="/refund-policy" className="link">Full refund policy</Link></p>
              {config.isLoading ? <Skeleton className="h-24 w-full" /> : <CancellationTiers policy={listing.cancellationPolicy} config={config.data} />}
            </section>

            {/* Reviews */}
            <section id="reviews" className="scroll-mt-24">
              <h2 className="mb-4 flex items-center gap-3 text-xl font-bold text-slate-900">
                Reviews <Rating avg={listing.rating.avg} count={listing.rating.count} size="md" />
              </h2>
              {reviews.isLoading ? (
                <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
              ) : reviews.isError ? (
                <ErrorState error={reviews.error} onRetry={() => reviews.refetch()} />
              ) : !reviews.data?.reviews.length ? (
                <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">No reviews yet. Be the first to rent it and share your experience!</p>
              ) : (
                <>
                  <ul className="grid gap-4 md:grid-cols-2">
                    {reviews.data.reviews.map((r) => (
                      <li key={r.id} className="card p-5">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.author.name} src={r.author.avatarUrl} size={40} />
                          <div className="min-w-0">
                            <Link to={`/users/${r.author.id}`} className="block truncate text-sm font-semibold text-slate-900 hover:underline">{r.author.name}</Link>
                            <p className="text-xs text-slate-500">{fromNow(r.createdAt)}</p>
                          </div>
                          <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-slate-800">★ {r.rating}</span>
                        </div>
                        {r.comment && <p className="mt-3 text-sm leading-relaxed text-slate-700">{r.comment}</p>}
                      </li>
                    ))}
                  </ul>
                  <Pagination page={reviewPage} totalPages={reviews.data.meta.totalPages} onChange={setReviewPage} />
                </>
              )}
            </section>

            {!isOwner && (
              <button onClick={() => (user ? setReportOpen(true) : requireLogin())} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">
                <Flag className="h-4 w-4" /> Report this listing
              </button>
            )}
          </div>

          {/* ------------------------------------------- booking sidebar */}
          <aside className="hidden lg:block" aria-label="Booking">
            <div className="sticky top-24">
              <BookingWidget {...widgetProps} />
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Payments protected · Never pay outside {config.data?.platformName ?? "the app"}
              </p>
            </div>
          </aside>
        </div>

        {/* Similar */}
        {(similar.isLoading || (similar.data?.length ?? 0) > 0) && (
          <section className="mt-16">
            <SectionHeader title="Similar items nearby" />
            <ListingCarousel listings={similar.data} loading={similar.isLoading} label="Similar listings" />
          </section>
        )}
      </div>

      {/* Mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base"><span className="font-extrabold text-slate-900">{money(priceFrom)}</span><span className="text-sm text-slate-500"> / {priceUnit}</span></p>
            <p className="text-xs text-slate-500">{money(p.securityDeposit)} deposit · <Rating avg={listing.rating.avg} count={listing.rating.count} /></p>
          </div>
          {isOwner ? (
            <ButtonLink to={`/dashboard/listings/${listing.id}/edit`}>Edit listing</ButtonLink>
          ) : (
            <Button onClick={() => setSheetOpen(true)} icon={listing.instantBooking ? <Zap className="h-4 w-4 fill-white" /> : <CalendarDays className="h-4 w-4" />}>
              {listing.instantBooking ? "Book now" : "Check dates"}
            </Button>
          )}
        </div>
      </div>

      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="Book this item">
        <BookingWidget {...widgetProps} bare />
      </Modal>
      {reportOpen && <ReportModal open onClose={() => setReportOpen(false)} targetType="LISTING" targetId={listing.id} />}
    </div>
  );
}

function Highlight({ icon, title, text }: { icon: React.ReactNode; title: string; text?: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        {text && <span className="mt-0.5 block text-xs text-slate-600">{text}</span>}
      </span>
    </div>
  );
}

function ListingSkeleton() {
  return (
    <div className="container-page py-6" aria-busy="true" aria-label="Loading listing">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="mt-3 h-4 w-1/3" />
      <Skeleton className="mt-5 aspect-[16/9] w-full rounded-3xl sm:aspect-auto sm:h-[420px]" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
        <Skeleton className="hidden h-96 w-full rounded-2xl lg:block" />
      </div>
    </div>
  );
}
