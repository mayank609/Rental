import { memo } from "react";
import { Link } from "react-router-dom";
import { Heart, MapPin, Zap, BadgeCheck, Truck } from "lucide-react";
import clsx from "clsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import type { Listing } from "@/lib/types";
import { displayPrice, listingPath, money } from "@/lib/format";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Rating } from "./ui";

export const ListingCard = memo(function ListingCard({ listing, wishlisted, onHover, compact }: { listing: Listing; wishlisted?: boolean; onHover?: (id: string | null) => void; compact?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const price = displayPrice(listing.pricing);
  const img = listing.images[0];
  const toggle = useMutation({
    mutationFn: () => (wishlisted ? api.delete(`/users/me/wishlist/${listing.id}`) : api.post(`/users/me/wishlist/${listing.id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
      toast.success(wishlisted ? "Removed from wishlist" : "Saved to wishlist");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Link
      to={listingPath(listing)}
      className="group block"
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className={clsx("relative overflow-hidden rounded-2xl bg-slate-200", compact ? "aspect-[4/3]" : "aspect-[4/3]")}>
        {img ? (
          <img src={img.thumbUrl} srcSet={`${img.thumbUrl} 400w, ${img.mediumUrl} 800w`} sizes="(max-width: 640px) 100vw, 400px" alt={listing.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">No photo</div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {listing.isFeatured && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow">Featured</span>}
          {listing.instantBooking && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow">
              <Zap className="h-3 w-3 fill-brand-600 text-brand-600" /> Instant
            </span>
          )}
        </div>
        {user && (
          <button
            onClick={(e) => {
              e.preventDefault();
              toggle.mutate();
            }}
            aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
            className="absolute right-2 top-2 rounded-full bg-white/90 p-2 shadow transition hover:scale-110"
          >
            <Heart className={clsx("h-4 w-4", wishlisted ? "fill-rose-500 text-rose-500" : "text-slate-700")} />
          </button>
        )}
      </div>
      <div className="mt-2.5 space-y-1 px-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-brand-700">{listing.title}</h3>
          <Rating avg={listing.rating.avg} count={listing.rating.count} />
        </div>
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5" />
          <span className="truncate">{[listing.location.locality?.name, listing.location.city?.name].filter(Boolean).join(", ")}</span>
          {listing.distanceKm != null && <span className="shrink-0">· {listing.distanceKm < 1 ? `${Math.round(listing.distanceKm * 1000)} m` : `${listing.distanceKm} km`}</span>}
        </p>
        <div className="flex items-center justify-between">
          <p className="text-sm">
            <span className="font-bold text-slate-900">{money(price.amount)}</span>
            <span className="text-slate-500"> / {price.unit}</span>
          </p>
          <span className="flex items-center gap-1.5 text-slate-400">
            {listing.deliveryAvailable && <Truck className="h-3.5 w-3.5" aria-label="Delivery available" />}
            {(listing.isVerified || listing.owner?.isVerified) && <BadgeCheck className="h-4 w-4 text-emerald-500" aria-label="Verified" />}
          </span>
        </div>
      </div>
    </Link>
  );
});

export function ListingCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[4/3] rounded-2xl" />
      <div className="skeleton mt-3 h-4 w-3/4" />
      <div className="skeleton mt-2 h-3 w-1/2" />
      <div className="skeleton mt-2 h-4 w-1/3" />
    </div>
  );
}
