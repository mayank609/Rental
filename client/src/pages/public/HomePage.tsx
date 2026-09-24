/**
 * Home: location-aware discovery. Auto-detects the user's city on first
 * visit (GPS → IP fallback, never blocking render), then shows categories,
 * featured and nearby items, recently viewed and trust/owner CTAs.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, Crosshair, IndianRupee, MapPin, PackagePlus, Search, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { Listing, SearchResponse } from "@/lib/types";
import { useLocationStore } from "@/stores/location";
import { useAuth } from "@/stores/auth";
import { useCategories } from "@/hooks/useConfig";
import { Seo } from "@/components/Seo";
import { LocationPicker } from "@/components/LocationPicker";
import { PLATFORM_NAME } from "@/components/layout/Header";
import { ButtonLink, EmptyState, SectionHeader, Skeleton, Spinner } from "@/components/ui";
import { CategoryIcon, ErrorState, ListingCarousel, ListingGrid } from "@/components/public/common";
import { RENTER_STEPS, StepsStrip, TrustBadges } from "@/components/public/marketing";

const POPULAR_SEARCHES = ["DSLR camera", "Projector", "Camping tent", "PS5", "Drone", "Power drill"];

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { location, detecting, detect } = useLocationStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const categories = useCategories();

  // Detect once on first visit; runs in the background so the page renders immediately.
  useEffect(() => {
    if (!useLocationStore.getState().location) void detect();
  }, [detect]);

  const citySlug = location?.citySlug;
  const featured = useQuery({
    queryKey: ["featured", citySlug ?? null],
    queryFn: async () => (await api.get<{ listings: Listing[] }>("/listings/featured", { params: { city: citySlug, limit: 12 } })).data.listings,
    enabled: !detecting || Boolean(location),
  });
  const nearby = useQuery({
    queryKey: ["home-nearby", citySlug, location?.lat, location?.lng],
    queryFn: async () =>
      (await api.get<SearchResponse>("/listings/search", { params: { city: citySlug, lat: location!.lat, lng: location!.lng, sort: "recommended", limit: 8 } })).data,
    enabled: Boolean(location),
  });
  const recent = useQuery({
    queryKey: ["recently-viewed"],
    queryFn: async () => (await api.get<{ listings: Listing[] }>("/users/me/recently-viewed")).data.listings,
    enabled: Boolean(user),
  });

  const place = location ? (location.locality ? `${location.locality}, ${location.city}` : location.city) : null;
  const browseBase = location ? `/rent/${location.citySlug}` : "/search";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    navigate(`${browseBase}${qs ? `?${qs}` : ""}`);
  };

  const nearbyEmpty = nearby.data && nearby.data.listings.length === 0;

  return (
    <>
      <Seo
        title={`${PLATFORM_NAME} — Rent anything from people near you`}
        description="Rent cameras, electronics, furniture, tools, camping gear and more from verified people in your city. Secure Razorpay payments, deposits held in escrow."
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: PLATFORM_NAME,
          url: typeof window !== "undefined" ? window.location.origin : undefined,
          potentialAction: { "@type": "SearchAction", target: `${typeof window !== "undefined" ? window.location.origin : ""}/search?q={search_term_string}`, "query-input": "required name=search_term_string" },
        }}
      />

      {/* ------------------------------------------------------------ Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 left-10 h-96 w-96 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="container-page relative pb-16 pt-12 sm:pb-24 sm:pt-20">
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25"
            aria-label={place ? `Current location ${place}. Change location` : "Choose your location"}
          >
            {detecting && !location ? <Spinner className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
            <span className="truncate">{place ?? (detecting ? "Finding your location…" : "Choose your location")}</span>
            <span className="text-white/70 underline-offset-2">· change</span>
          </button>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl">
            Rent anything,<br className="hidden sm:block" /> from people nearby.
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/80 sm:text-lg">
            Cameras for the weekend, a projector for match night, a tent for the trek. Why buy when your neighbour has one?
          </p>

          <form onSubmit={submit} role="search" className="mt-8 flex max-w-3xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-brand-900/30 sm:flex-row sm:items-center">
            <label className="flex flex-1 items-center gap-2 px-3">
              <Search className="h-5 w-5 shrink-0 text-slate-400" />
              <span className="sr-only">What do you want to rent?</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you want to rent?" className="h-12 w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400" />
            </label>
            <button type="button" onClick={() => setPickerOpen(true)} className="flex h-12 items-center gap-2 rounded-xl px-3 text-left text-sm text-slate-700 hover:bg-slate-50 sm:border-l sm:border-slate-200 sm:rounded-none sm:pl-4">
              <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="max-w-[180px] truncate font-medium">{place ?? "Anywhere"}</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            <button type="submit" className="h-12 rounded-xl bg-brand-600 px-6 font-semibold text-white shadow-sm hover:bg-brand-700">Search</button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-white/70">Popular:</span>
            {POPULAR_SEARCHES.map((s) => (
              <Link key={s} to={`${browseBase}?q=${encodeURIComponent(s)}`} className="rounded-full bg-white/10 px-3 py-1 font-medium text-white ring-1 ring-white/20 hover:bg-white/20">
                {s}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="container-page space-y-16 py-12 sm:space-y-20">
        {/* ------------------------------------------------------ Categories */}
        <section aria-labelledby="cat-h">
          <SectionHeader title={<span id="cat-h">Browse by category</span>} subtitle={place ? `What people are renting in ${location?.city}` : undefined} />
          {categories.isError ? (
            <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {categories.isLoading
                ? Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
                : categories.data?.map((c) => (
                    <Link
                      key={c.id}
                      to={location ? `/rent/${c.slug}/${location.citySlug}` : `/search?category=${c.slug}`}
                      className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                        <CategoryIcon icon={c.icon} className="h-6 w-6" />
                      </span>
                      <span className="line-clamp-2 text-xs font-semibold text-slate-800 sm:text-sm">{c.name}</span>
                    </Link>
                  ))}
            </div>
          )}
        </section>

        {/* -------------------------------------------------------- Featured */}
        {(featured.isLoading || (featured.data?.length ?? 0) > 0) && (
          <section aria-labelledby="feat-h">
            <SectionHeader
              title={<span id="feat-h" className="inline-flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /> Featured{location ? ` in ${location.city}` : ""}</span>}
              subtitle="Hand-picked, top-rated items from trusted owners"
            />
            <ListingCarousel listings={featured.data} loading={featured.isLoading} label="Featured listings" />
          </section>
        )}

        {/* -------------------------------------------------------- Near you */}
        <section aria-labelledby="near-h">
          <SectionHeader
            title={<span id="near-h">{location?.locality ? `Near ${location.locality}` : location ? `Near you in ${location.city}` : "Near you"}</span>}
            subtitle={nearbyEmpty ? undefined : "Sorted by distance from you"}
            action={location && !nearbyEmpty ? <ButtonLink to={browseBase} variant="outline" size="sm">View all <ArrowRight className="h-4 w-4" /></ButtonLink> : undefined}
          />
          {!location ? (
            detecting ? (
              <ListingGrid loading skeletons={4} />
            ) : (
              <EmptyState
                icon={<Crosshair className="h-6 w-6" />}
                title="Where are you?"
                description="Set your location to see items you can pick up nearby."
                action={<button className="link" onClick={() => setPickerOpen(true)}>Choose location</button>}
              />
            )
          ) : nearby.isError ? (
            <ErrorState error={nearby.error} onRetry={() => nearby.refetch()} />
          ) : nearbyEmpty ? (
            <div className="space-y-6">
              <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 p-5 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold text-slate-900">Nothing in {location.locality ?? location.city} yet — here's what's closest</p>
                  <p className="mt-1 text-sm text-slate-600">Be the first to list in your area and start earning.</p>
                </div>
                <ButtonLink to="/dashboard/listings/new" icon={<PackagePlus className="h-4 w-4" />}>List an item</ButtonLink>
              </div>
              {nearby.data?.fallback?.listings.length ? <ListingGrid listings={nearby.data.fallback.listings.slice(0, 8)} /> : null}
            </div>
          ) : (
            <ListingGrid listings={nearby.data?.listings} loading={nearby.isLoading} skeletons={8} />
          )}
        </section>

        {/* ------------------------------------------------ Recently viewed */}
        {user && (recent.data?.length ?? 0) > 0 && (
          <section aria-labelledby="recent-h">
            <SectionHeader title={<span id="recent-h">Recently viewed</span>} />
            <ListingCarousel listings={recent.data} label="Recently viewed listings" />
          </section>
        )}

        {/* ---------------------------------------------------- How it works */}
        <section aria-labelledby="how-h" className="-mx-4 rounded-none bg-slate-950 px-4 py-12 sm:mx-0 sm:rounded-3xl sm:px-10 sm:py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">How it works</p>
              <h2 id="how-h" className="mt-2 text-2xl font-bold text-white sm:text-3xl">Rent in four simple steps</h2>
            </div>
            <Link to="/how-it-works" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-300 hover:text-white">Learn more <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <StepsStrip steps={RENTER_STEPS} dark />
        </section>

        {/* ---------------------------------------------------------- Trust */}
        <section aria-labelledby="trust-h">
          <SectionHeader title={<span id="trust-h">Safe by design</span>} subtitle="Every rental is protected, end to end." action={<Link to="/trust-and-safety" className="link text-sm">Trust & safety →</Link>} />
          <TrustBadges />
        </section>

        {/* ------------------------------------------------------ Owner CTA */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-8 ring-1 ring-orange-100 sm:p-12">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-orange-200/40 blur-2xl" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-orange-700 ring-1 ring-orange-200">
                <IndianRupee className="h-3.5 w-3.5" /> For owners
              </p>
              <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">Earn from things you own</h2>
              <p className="mt-3 max-w-xl text-slate-700">
                That camera, drone or tent sitting in the cupboard could pay for itself. Listing is free, deposits protect your item, and payouts go straight to your bank.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink to="/dashboard/listings/new" size="lg" icon={<PackagePlus className="h-5 w-5" />}>List an item — it's free</ButtonLink>
                <ButtonLink to="/how-it-works#owners" size="lg" variant="outline">How earning works</ButtonLink>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["₹0", "to list"],
                ["Escrow", "held deposits"],
                ["24h", "payout after completion"],
                ["Verified", "renters only"],
              ].map(([k, v]) => (
                <div key={v} className="rounded-2xl bg-white/80 p-4 text-center ring-1 ring-orange-100 backdrop-blur">
                  <dt className="text-xl font-extrabold text-slate-900">{k}</dt>
                  <dd className="text-xs font-medium text-slate-600">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>

      <LocationPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}
