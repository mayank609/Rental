/**
 * Browse / search results.
 *
 * URL is the source of truth: city, category and locality live in the
 * SEO-friendly path (/rent/:category/:city/:locality, "all" = any
 * category); every other filter lives in the query string so results are
 * shareable and back/forward friendly.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import clsx from "clsx";
import { List, Map as MapIcon, MapPin, PackagePlus, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Category, SearchResponse } from "@/lib/types";
import { toPaise } from "@/lib/format";
import { useCategories } from "@/hooks/useConfig";
import { useLocationStore } from "@/stores/location";
import { Seo } from "@/components/Seo";
import { LocationPicker } from "@/components/LocationPicker";
import { Button, ButtonLink, EmptyState, Modal, Pagination, Select, Skeleton, Spinner } from "@/components/ui";
import { ErrorState, ListingGrid, unslug } from "@/components/public/common";
import { BrowseFilters, countActiveFilters, type BrowseFilterValues } from "@/components/public/BrowseFilters";

const SearchMap = lazy(() => import("@/components/public/SearchMap"));

const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "distance", label: "Nearest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "newest", label: "Newest" },
] as const;

const PAGE_SIZE = 24;

function findCategory(tree: Category[] | undefined, slug: string | null) {
  if (!tree || !slug) return null;
  for (const c of tree) {
    if (c.slug === slug) return c;
    const ch = c.children?.find((x) => x.slug === slug);
    if (ch) return ch;
  }
  return null;
}

/** Builds the canonical SEO path for a city/category/locality combination. */
function buildPath(city: string | null, category: string | null, locality: string | null) {
  if (!city) return "/search";
  if (locality) return `/rent/${category ?? "all"}/${city}/${locality}`;
  if (category) return `/rent/${category}/${city}`;
  return `/rent/${city}`;
}

export default function BrowsePage() {
  const params = useParams<{ city?: string; category?: string; locality?: string }>();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const categories = useCategories();
  const userLoc = useLocationStore((s) => s.location);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [qInput, setQInput] = useState(sp.get("q") ?? "");
  const topRef = useRef<HTMLDivElement>(null);

  // ---- Path state (SEO URL) ------------------------------------------------
  const city = params.city ?? sp.get("city") ?? null;
  const pathCategory = params.category && params.category !== "all" ? params.category : null;
  const category = pathCategory ?? sp.get("category") ?? null;
  const locality = params.locality ?? null;

  // ---- Query string state --------------------------------------------------
  const q = sp.get("q") ?? "";
  const sort = (sp.get("sort") ?? "recommended") as (typeof SORTS)[number]["value"];
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const view = sp.get("view") === "map" ? "map" : "list";
  const bbox = sp.get("bbox");
  const filters: BrowseFilterValues = {
    radius: sp.get("radius") ? Number(sp.get("radius")) : null,
    min: sp.get("min") ?? "",
    max: sp.get("max") ?? "",
    start: sp.get("start") ?? "",
    end: sp.get("end") ?? "",
    rating: sp.get("rating") ? Number(sp.get("rating")) : null,
    delivery: sp.get("delivery") === "1",
    instant: sp.get("instant") === "1",
    verified: sp.get("verified") === "1",
  };

  useEffect(() => setQInput(q), [q]);

  /** Patch query-string params; resets to page 1 unless the page itself changes. */
  const patchQuery = (patch: Record<string, string | number | boolean | null | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === "" || v === false) next.delete(k);
      else next.set(k, v === true ? "1" : String(v));
    }
    if (!("page" in patch)) next.delete("page");
    setSp(next, { replace: false });
  };

  const onFilterChange = (patch: Partial<BrowseFilterValues>) => patchQuery(patch as Record<string, string | number | boolean | null>);

  const onCategory = (slug: string | null) => {
    const next = new URLSearchParams(sp);
    next.delete("page");
    if (city) {
      next.delete("category");
      navigate(`${buildPath(city, slug, locality)}${next.toString() ? `?${next}` : ""}`);
    } else {
      if (slug) next.set("category", slug);
      else next.delete("category");
      setSp(next);
    }
  };

  // When the user picks a new place in the picker, move to that city's URL.
  const pickerUsed = useRef(false);
  useEffect(() => {
    if (!pickerUsed.current || !userLoc) return;
    pickerUsed.current = false;
    const next = new URLSearchParams(sp);
    next.delete("page");
    next.delete("bbox");
    next.delete("city");
    navigate(`${buildPath(userLoc.citySlug, category, userLoc.localitySlug ?? null)}${next.toString() ? `?${next}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoc?.citySlug, userLoc?.localitySlug, userLoc?.lat]);

  // ---- API params ---------------------------------------------------------
  // Use the user's precise point for distance only when it's in the city being viewed
  // and no explicit locality overrides it (the server then uses the locality centre).
  const usePoint = Boolean(userLoc && (!city || userLoc.citySlug === city) && (!locality || userLoc.localitySlug === locality));
  const apiParams = useMemo(() => {
    const p: Record<string, string | number | boolean> = { sort, page, limit: PAGE_SIZE };
    if (q) p.q = q;
    if (city) p.city = city;
    if (locality) p.locality = locality;
    if (category) p.category = category;
    if (usePoint && userLoc) {
      p.lat = userLoc.lat;
      p.lng = userLoc.lng;
    }
    if (filters.radius) p.radiusKm = filters.radius;
    const minP = toPaise(filters.min);
    const maxP = toPaise(filters.max);
    if (minP != null) p.minPrice = minP;
    if (maxP != null) p.maxPrice = maxP;
    if (filters.start) {
      p.startAt = new Date(`${filters.start}T00:00:00`).toISOString();
      p.endAt = new Date(`${filters.end || filters.start}T23:59:59`).toISOString();
    }
    if (filters.rating) p.minRating = filters.rating;
    // Server booleans are coerced, so only ever send `true` (never "false").
    if (filters.delivery) p.delivery = true;
    if (filters.instant) p.instant = true;
    if (filters.verified) p.verified = true;
    if (bbox) p.bbox = bbox;
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString(), city, category, locality, usePoint, userLoc?.lat, userLoc?.lng]);

  const search = useQuery({
    queryKey: ["search", apiParams],
    queryFn: async () => (await api.get<SearchResponse>("/listings/search", { params: apiParams })).data,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (page > 1) topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  // ---- Display strings ----------------------------------------------------
  const cat = findCategory(categories.data, category);
  const catName = cat?.name ?? (category ? unslug(category) : null);
  const cityName = search.data?.city?.name ?? (city ? (userLoc?.citySlug === city ? userLoc.city : unslug(city)) : null);
  const localityName = locality ? (userLoc?.localitySlug === locality && userLoc.locality ? userLoc.locality : unslug(locality)) : null;
  const place = [localityName, cityName].filter(Boolean).join(", ");
  const heading = q
    ? `“${q}”${place ? ` in ${place}` : ""}`
    : `Rent ${catName ?? "anything"}${place ? ` in ${place}` : " near you"}`;
  const description = `Rent ${catName?.toLowerCase() ?? "cameras, electronics, furniture, tools and more"}${place ? ` in ${place}` : ""} from verified people nearby. Transparent pricing, secure payments and refundable deposits.`;

  const listings = search.data?.listings ?? [];
  const total = search.data?.meta.total ?? 0;
  const fallback = search.data?.fallback;
  const activeCount = countActiveFilters(filters, category);
  const radiusEnabled = Boolean(city || userLoc);
  const todayIso = format(new Date(), "yyyy-MM-dd");
  const mapCenter = search.data?.origin ?? search.data?.city ?? (userLoc ? { lat: userLoc.lat, lng: userLoc.lng } : { lat: 20.5937, lng: 78.9629 });
  const mapListings = listings.length ? listings : fallback?.listings ?? [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: heading,
    numberOfItems: total,
    itemListElement: listings.slice(0, 24).map((l, i) => ({
      "@type": "ListItem",
      position: (page - 1) * PAGE_SIZE + i + 1,
      url: `${window.location.origin}/listing/${l.id}/${l.slug}`,
      name: l.title,
    })),
  };

  const filterPanel = (
    <BrowseFilters values={filters} onChange={onFilterChange} categories={categories.data} category={category} onCategory={onCategory} radiusEnabled={radiusEnabled} todayIso={todayIso} />
  );

  const clearAll = () => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (view === "map") next.set("view", "map");
    if (city) navigate(`${buildPath(city, null, locality)}${next.toString() ? `?${next}` : ""}`);
    else setSp(next);
  };

  const results = search.isError ? (
    <ErrorState error={search.error} onRetry={() => search.refetch()} />
  ) : search.isLoading ? (
    <ListingGrid loading skeletons={view === "map" ? 6 : 12} className={view === "map" ? "xl:grid-cols-2 lg:grid-cols-2" : undefined} />
  ) : listings.length === 0 ? (
    <div className="space-y-8">
      <EmptyState
        icon={<Search className="h-6 w-6" />}
        title={fallback?.listings.length ? `Nothing ${q || catName ? "matching" : ""} in ${place || "this area"} yet — here's what's closest` : "No items found"}
        description={activeCount ? "Try removing a few filters or widening the distance." : "Be the first to list something here and start earning."}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {activeCount > 0 && <Button variant="outline" onClick={clearAll}>Clear filters</Button>}
            <ButtonLink to="/dashboard/listings/new" icon={<PackagePlus className="h-4 w-4" />}>List an item</ButtonLink>
          </div>
        }
      />
      {fallback?.listings.length ? (
        <div>
          <h2 className="mb-4 text-lg font-bold text-slate-900">Closest to {place || "you"}</h2>
          <ListingGrid listings={fallback.listings} onHover={setHovered} className={view === "map" ? "lg:grid-cols-2 xl:grid-cols-2" : undefined} />
        </div>
      ) : null}
    </div>
  ) : (
    <>
      <ListingGrid listings={listings} onHover={setHovered} className={clsx(view === "map" && "lg:grid-cols-2 xl:grid-cols-2", search.isFetching && "opacity-60 transition-opacity")} />
      <Pagination page={page} totalPages={search.data?.meta.totalPages ?? 1} onChange={(p) => patchQuery({ page: p })} />
    </>
  );

  return (
    <div ref={topRef} className="container-page scroll-mt-20 py-6 pb-24 md:pb-10">
      <Seo title={heading.replace(/[“”]/g, "")} description={description} jsonLd={jsonLd} noindex={Boolean(q) || page > 1 || activeCount > (category ? 1 : 0)} />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link to="/" className="hover:text-slate-800">Home</Link>
        {city && <><span>/</span><Link to={`/rent/${city}`} className="hover:text-slate-800">{cityName}</Link></>}
        {city && category && <><span>/</span><Link to={buildPath(city, category, null)} className="hover:text-slate-800">{catName}</Link></>}
        {locality && <><span>/</span><span className="text-slate-700">{localityName}</span></>}
      </nav>

      {/* Heading + search */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{heading}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {search.isLoading ? <Skeleton className="h-4 w-24" /> : <span>{total.toLocaleString("en-IN")} item{total === 1 ? "" : "s"}</span>}
            {search.isFetching && !search.isLoading && <Spinner className="h-3.5 w-3.5 text-brand-600" />}
            <span aria-hidden>·</span>
            <button onClick={() => { pickerUsed.current = true; setPickerOpen(true); }} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
              <MapPin className="h-3.5 w-3.5" /> {place || "Anywhere"} · change
            </button>
          </p>
        </div>
        <form
          role="search"
          onSubmit={(e) => { e.preventDefault(); patchQuery({ q: qInput.trim() || null }); }}
          className="relative w-full lg:max-w-sm"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search items" aria-label="Search items" className="input pl-9 pr-9" />
          {qInput && (
            <button type="button" aria-label="Clear search" onClick={() => { setQInput(""); patchQuery({ q: null }); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {/* Toolbar */}
      <div className="sticky top-16 z-30 -mx-4 mt-5 flex items-center gap-2 border-b border-slate-200/70 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <button onClick={() => setFiltersOpen(true)} className={clsx("chip lg:hidden", activeCount > 0 && "chip-active")}>
          <SlidersHorizontal className="h-4 w-4" /> Filters{activeCount > 0 && ` (${activeCount})`}
        </button>
        {bbox && (
          <button onClick={() => patchQuery({ bbox: null })} className="chip chip-active">
            Map area <X className="h-3.5 w-3.5" />
          </button>
        )}
        {activeCount > 0 && <button onClick={clearAll} className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 lg:inline">Clear all filters</button>}
        <div className="ml-auto flex items-center gap-2">
          <Select aria-label="Sort by" value={sort} onChange={(e) => patchQuery({ sort: e.target.value === "recommended" ? null : e.target.value })} className="w-40 sm:w-48 [&_select]:h-9 [&_select]:py-1.5">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <div className="flex rounded-full border border-slate-200 bg-white p-0.5" role="group" aria-label="View">
            <button aria-pressed={view === "list"} onClick={() => patchQuery({ view: null, page: page > 1 ? page : null })} className={clsx("flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium", view === "list" ? "bg-slate-900 text-white" : "text-slate-600")}>
              <List className="h-4 w-4" /><span className="hidden sm:inline">List</span>
            </button>
            <button aria-pressed={view === "map"} onClick={() => patchQuery({ view: "map", page: page > 1 ? page : null })} className={clsx("flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium", view === "map" ? "bg-slate-900 text-white" : "text-slate-600")}>
              <MapIcon className="h-4 w-4" /><span className="hidden sm:inline">Map</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-8">
        {view === "list" && (
          <aside className="hidden w-64 shrink-0 lg:block" aria-label="Filters">
            <div className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto pr-2">{filterPanel}</div>
          </aside>
        )}
        <div className={clsx("min-w-0 flex-1", view === "map" && "grid gap-6 lg:grid-cols-2")}>
          {view === "map" && (
            <div className="h-[60vh] lg:sticky lg:top-36 lg:order-2 lg:h-[calc(100vh-10rem)]">
              <Suspense fallback={<Skeleton className="h-full w-full rounded-2xl" />}>
                <SearchMap
                  listings={mapListings}
                  center={mapCenter}
                  activeId={hovered}
                  onHover={setHovered}
                  keepViewport={Boolean(bbox)}
                  onSearchArea={(b) => patchQuery({ bbox: b, radius: null })}
                />
              </Suspense>
            </div>
          )}
          <div className="min-w-0 lg:order-1">{results}</div>
        </div>
      </div>

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <>
            <Button variant="ghost" onClick={clearAll}>Clear all</Button>
            <Button onClick={() => setFiltersOpen(false)}>Show {total.toLocaleString("en-IN")} result{total === 1 ? "" : "s"}</Button>
          </>
        }
      >
        {filterPanel}
      </Modal>
      <LocationPicker
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          // The store update lands before this; drop the flag afterwards if nothing was picked.
          setTimeout(() => (pickerUsed.current = false), 300);
        }}
      />
    </div>
  );
}
