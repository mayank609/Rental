/** City index: every city with live listings, grouped A–Z (links to /rent/:city). */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, PackagePlus, Search, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Seo } from "@/components/Seo";
import { ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { ErrorState, PageHero } from "@/components/public/common";

interface CityRow {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  listingCount: number;
}

export default function CitiesPage() {
  const [filter, setFilter] = useState("");
  const cities = useQuery({
    queryKey: ["cities"],
    queryFn: async () => (await api.get<{ cities: CityRow[] }>("/locations/cities")).data.cities,
    staleTime: 5 * 60_000,
  });

  const top = useMemo(() => [...(cities.data ?? [])].sort((a, b) => b.listingCount - a.listingCount).slice(0, 6), [cities.data]);
  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = (cities.data ?? []).filter((c) => !f || c.name.toLowerCase().includes(f) || c.state?.toLowerCase().includes(f)).sort((a, b) => a.name.localeCompare(b.name));
    const map = new Map<string, CityRow[]>();
    for (const c of list) {
      const k = c.name[0].toUpperCase();
      map.set(k, [...(map.get(k) ?? []), c]);
    }
    return [...map.entries()];
  }, [cities.data, filter]);

  const total = cities.data?.reduce((s, c) => s + c.listingCount, 0) ?? 0;

  return (
    <>
      <Seo
        title="Rent items in cities across India"
        description="Browse rentals in Mumbai, Delhi, Bengaluru, Pune, Hyderabad, Chennai and every other city where people share on RentNest."
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: (cities.data ?? []).map((c, i) => ({ "@type": "ListItem", position: i + 1, name: `Rent in ${c.name}`, url: `${window.location.origin}/rent/${c.slug}` })),
        }}
      />
      <PageHero
        eyebrow="Cities"
        title="Rent from people in your city"
        subtitle={cities.data ? `${cities.data.length} cities · ${total.toLocaleString("en-IN")} items and counting. New cities appear here automatically as soon as someone lists an item there.` : "New cities appear here automatically as soon as someone lists an item there."}
      >
        <label className="relative block max-w-md">
          <span className="sr-only">Filter cities</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find your city or state" className="h-12 w-full rounded-xl bg-white pl-10 pr-4 text-slate-900 shadow-lg outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/30" />
        </label>
      </PageHero>

      <div className="container-page py-12 pb-24 md:pb-12">
        {cities.isError ? (
          <ErrorState error={cities.error} onRetry={() => cities.refetch()} />
        ) : cities.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
        ) : !cities.data?.length ? (
          <EmptyState icon={<Building2 className="h-6 w-6" />} title="No cities yet" description="Be the first to list an item — your city will show up here." action={<ButtonLink to="/dashboard/listings/new">List an item</ButtonLink>} />
        ) : (
          <>
            {!filter && (
              <section className="mb-12">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900"><Sparkles className="h-5 w-5 text-amber-500" /> Most active</h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  {top.map((c, i) => (
                    <Link key={c.id} to={`/rent/${c.slug}`} className="group relative overflow-hidden rounded-2xl p-4 text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-xl" style={{ background: `linear-gradient(135deg, hsl(${240 + i * 18} 70% 55%), hsl(${265 + i * 18} 70% 45%))` }}>
                      <Building2 className="absolute -bottom-2 -right-2 h-16 w-16 text-white/15 transition group-hover:scale-110" />
                      <p className="relative text-lg font-bold">{c.name}</p>
                      <p className="relative text-xs text-white/80">{c.listingCount} items</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* A–Z jump links */}
            {groups.length > 4 && (
              <nav aria-label="Jump to letter" className="mb-6 flex flex-wrap gap-1.5">
                {groups.map(([letter]) => (
                  <a key={letter} href={`#city-${letter}`} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-brand-50 hover:text-brand-700">{letter}</a>
                ))}
              </nav>
            )}

            {groups.length === 0 ? (
              <EmptyState icon={<MapPin className="h-6 w-6" />} title={`No city matches “${filter}”`} description="Your city might not have listings yet. Be the first to list something there!" action={<ButtonLink to="/dashboard/listings/new" icon={<PackagePlus className="h-4 w-4" />}>List an item</ButtonLink>} />
            ) : (
              <div className="space-y-10">
                {groups.map(([letter, list]) => (
                  <section key={letter} id={`city-${letter}`} className="scroll-mt-24">
                    <h2 className="mb-3 border-b border-slate-200 pb-2 text-2xl font-extrabold text-brand-600">{letter}</h2>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((c) => (
                        <li key={c.id}>
                          <Link to={`/rent/${c.slug}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200 transition hover:ring-brand-300 hover:shadow-sm">
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-900">{c.name}</span>
                              {c.state && <span className="block text-xs text-slate-500">{c.state}</span>}
                            </span>
                            <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{c.listingCount} item{c.listingCount === 1 ? "" : "s"}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            <div className="mt-14 rounded-3xl bg-slate-900 p-8 text-center text-white sm:p-10">
              <h2 className="text-2xl font-bold">Don't see your city?</h2>
              <p className="mx-auto mt-2 max-w-lg text-white/70">RentNest works everywhere in India. List the first item in your city and it'll appear here automatically.</p>
              <ButtonLink to="/dashboard/listings/new" size="lg" className="mt-6" icon={<PackagePlus className="h-5 w-5" />}>List an item</ButtonLink>
            </div>
          </>
        )}
      </div>
    </>
  );
}
