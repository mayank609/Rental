/**
 * Small building blocks shared by the public pages: error states, listing
 * grids / carousels (with wishlist awareness) and category icons.
 */
import { useRef, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertTriangle, Baby, Bike, Camera, ChevronLeft, ChevronRight, Dumbbell, Guitar, Laptop, Package, PartyPopper, RefreshCw,
  Refrigerator, Shirt, Sofa, Tent, Wrench,
} from "lucide-react";
import { api, apiError } from "@/lib/api";
import type { Listing } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { ListingCard, ListingCardSkeleton } from "@/components/ListingCard";
import { Button } from "@/components/ui";

/* ------------------------------------------------------------------ errors */

/** Friendly error block with a retry button (used for failed queries). */
export function ErrorState({ error, onRetry, title = "We couldn't load this", className }: { error?: unknown; onRetry?: () => void; title?: string; className?: string }) {
  return (
    <div role="alert" className={clsx("flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50/60 px-6 py-10 text-center", className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="font-semibold text-slate-900">{title}</p>
      {error != null && <p className="mt-1 max-w-md text-sm text-slate-600">{apiError(error)}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- category */

const CATEGORY_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  camera: Camera,
  laptop: Laptop,
  sofa: Sofa,
  refrigerator: Refrigerator,
  bike: Bike,
  wrench: Wrench,
  tent: Tent,
  "party-popper": PartyPopper,
  dumbbell: Dumbbell,
  baby: Baby,
  guitar: Guitar,
  shirt: Shirt,
};

/** Maps the admin-configured icon name to a lucide icon (falls back to a box). */
export function CategoryIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || Package;
  return <Icon className={className} />;
}

/* --------------------------------------------------------------- wishlist */

/**
 * IDs of the signed-in user's wishlisted listings, so cards can render the
 * filled heart. Keyed under ["wishlist", ...] so ListingCard's invalidation
 * of ["wishlist"] refreshes it automatically.
 */
export function useWishlistIds() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["wishlist", "ids"],
    queryFn: async () => (await api.get<{ listings: { id: string }[] }>("/users/me/wishlist")).data.listings.map((l) => l.id),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  return new Set(user ? q.data ?? [] : []);
}

/* ------------------------------------------------------------ listing grid */

export function ListingGrid({
  listings, loading, skeletons = 8, onHover, className,
}: { listings?: Listing[]; loading?: boolean; skeletons?: number; onHover?: (id: string | null) => void; className?: string }) {
  const wished = useWishlistIds();
  return (
    <div className={clsx("grid grid-cols-1 gap-x-5 gap-y-8 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {loading
        ? Array.from({ length: skeletons }, (_, i) => <ListingCardSkeleton key={i} />)
        : listings?.map((l) => <ListingCard key={l.id} listing={l} wishlisted={wished.has(l.id)} onHover={onHover} />)}
    </div>
  );
}

/** Horizontally scrolling row of cards with arrow controls on desktop. */
export function ListingCarousel({ listings, loading, label }: { listings?: Listing[]; loading?: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const wished = useWishlistIds();
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="relative">
      <div ref={ref} className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" role="region" aria-label={label}>
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="w-[75%] shrink-0 snap-start min-[480px]:w-[45%] md:w-[31%] lg:w-[23.5%]">
                <ListingCardSkeleton />
              </div>
            ))
          : listings?.map((l) => (
              <div key={l.id} className="w-[75%] shrink-0 snap-start min-[480px]:w-[45%] md:w-[31%] lg:w-[23.5%]">
                <ListingCard listing={l} wishlisted={wished.has(l.id)} />
              </div>
            ))}
      </div>
      {!loading && (listings?.length ?? 0) > 4 && (
        <>
          <button onClick={() => scroll(-1)} aria-label="Scroll left" className="absolute -left-4 top-[30%] hidden h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md hover:bg-slate-50 lg:flex">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={() => scroll(1)} aria-label="Scroll right" className="absolute -right-4 top-[30%] hidden h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md hover:bg-slate-50 lg:flex">
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- misc */

/** Page-level hero band used by marketing pages. */
export function PageHero({ eyebrow, title, subtitle, children, tone = "brand" }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; children?: ReactNode; tone?: "brand" | "dark" }) {
  return (
    <section className={clsx("relative overflow-hidden", tone === "dark" ? "bg-slate-950 text-white" : "bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 text-white")}>
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="container-page relative py-14 sm:py-20">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">{eyebrow}</p>}
        <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">{subtitle}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

/** Unslug for display fallbacks: "andheri-west" → "Andheri West". */
export const unslug = (s: string) => s.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** Share a URL with the Web Share API or fall back to copying it. */
export async function shareUrl(title: string, url = window.location.href): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return "shared";
    return "failed";
  }
}
