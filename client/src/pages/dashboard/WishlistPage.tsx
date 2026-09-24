/** Saved listings. Un-hearting a card removes it (ListingCard invalidates ["wishlist"]). */
import { useQuery } from "@tanstack/react-query";
import { Heart, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Listing } from "@/lib/types";
import { Seo } from "@/components/Seo";
import { ListingCard, ListingCardSkeleton } from "@/components/ListingCard";
import { ButtonLink, EmptyState } from "@/components/ui";
import { ErrorState, PageHeader } from "@/components/dashboard/common";

export default function WishlistPage() {
  const q = useQuery({ queryKey: ["wishlist"], queryFn: async () => (await api.get<{ listings: Listing[] }>("/users/me/wishlist")).data.listings });
  const items = q.data ?? [];
  const unavailable = items.filter((l) => l.status !== "ACTIVE");
  const available = items.filter((l) => l.status === "ACTIVE");

  return (
    <div>
      <Seo title="Wishlist" noindex />
      <PageHeader title="Wishlist" subtitle={q.isSuccess && items.length ? `${items.length} saved item${items.length > 1 ? "s" : ""}` : "Items you've saved for later."} />
      {q.isLoading ? (
        <div className="grid grid-cols-1 gap-6 min-[480px]:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <ListingCardSkeleton key={i} />)}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <EmptyState
          icon={<Heart className="h-6 w-6" />}
          title="Nothing saved yet"
          description="Tap the heart on any item to save it here and compare later."
          action={<ButtonLink to="/search" icon={<Search className="h-4 w-4" />}>Explore items</ButtonLink>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 min-[480px]:grid-cols-2 xl:grid-cols-3">
            {available.map((l) => <ListingCard key={l.id} listing={l} wishlisted />)}
          </div>
          {unavailable.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">No longer available</h2>
              <div className="grid grid-cols-1 gap-6 opacity-60 min-[480px]:grid-cols-2 xl:grid-cols-3">
                {unavailable.map((l) => <ListingCard key={l.id} listing={l} wishlisted />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
