/**
 * Search results map (lazy-loaded so leaflet stays out of the main chunk).
 * Price pills are L.divIcon markers (default marker images don't survive
 * bundling). The hovered card's marker is highlighted, and panning reveals
 * a "Search this area" button that emits a bbox.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import type { Listing } from "@/lib/types";
import { displayPrice, listingPath, money } from "@/lib/format";
import BaseMap from "@/components/map/BaseMap";

export interface SearchMapProps {
  listings: Listing[];
  center: { lat: number; lng: number };
  activeId: string | null;
  onHover?: (id: string | null) => void;
  /** Called with "minLng,minLat,maxLng,maxLat" when the user asks to search the visible area. */
  onSearchArea: (bbox: string) => void;
  /** When true the map keeps the user's viewport instead of fitting to results. */
  keepViewport?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function priceIcon(l: Listing, active: boolean) {
  const p = displayPrice(l.pricing);
  return L.divIcon({
    className: "", // prevent leaflet's default white square
    html: `<span class="price-marker${active ? " active" : ""}">${esc(money(p.amount))}</span>`,
    iconSize: undefined,
    iconAnchor: [24, 12],
  });
}

/**
 * Fits the map to the result set whenever it changes (unless the viewport is
 * locked) and reports user-initiated pans/zooms. Programmatic moves are
 * ignored via a flag so "Search this area" only appears after user input.
 */
function MapController({ listings, keep, onMoved }: { listings: Listing[]; keep?: boolean; onMoved: (b: L.LatLngBounds) => void }) {
  const fitting = useRef(false);
  const map = useMapEvents({
    moveend: () => {
      if (fitting.current) return;
      onMoved(map.getBounds());
    },
  });
  const key = listings.map((l) => l.id).join(",");
  useEffect(() => {
    if (keep || !listings.length) return;
    const b = L.latLngBounds(listings.map((l) => [l.location.lat, l.location.lng] as [number, number]));
    fitting.current = true;
    map.fitBounds(b, { padding: [40, 40], maxZoom: 14, animate: false });
    // Non-animated moves emit moveend synchronously, so the flag can be reset now.
    fitting.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, keep, map]);
  return null;
}

export default function SearchMap({ listings, center, activeId, onHover, onSearchArea, keepViewport }: SearchMapProps) {
  const [moved, setMoved] = useState<L.LatLngBounds | null>(null);
  const icons = useMemo(() => new Map(listings.map((l) => [l.id, { normal: priceIcon(l, false), active: priceIcon(l, true) }])), [listings]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl ring-1 ring-slate-200">
      <BaseMap center={[center.lat, center.lng]} zoom={12} className="h-full w-full">
        <MapController listings={listings} keep={keepViewport} onMoved={setMoved} />
        {listings.map((l) => {
          const ic = icons.get(l.id)!;
          const img = l.images[0];
          return (
            <Marker
              key={l.id}
              position={[l.location.lat, l.location.lng]}
              icon={activeId === l.id ? ic.active : ic.normal}
              zIndexOffset={activeId === l.id ? 1000 : 0}
              eventHandlers={{ mouseover: () => onHover?.(l.id), mouseout: () => onHover?.(null) }}
              keyboard
              title={l.title}
            >
              <Popup>
                <Link to={listingPath(l)} className="block w-44 text-slate-900 no-underline">
                  {img && <img src={img.thumbUrl} alt="" className="mb-2 aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />}
                  <span className="line-clamp-2 block text-sm font-semibold">{l.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">
                    {money(displayPrice(l.pricing).amount)} / {displayPrice(l.pricing).unit}
                  </span>
                </Link>
              </Popup>
            </Marker>
          );
        })}
      </BaseMap>
      {moved && (
        <button
          onClick={() => {
            const sw = moved.getSouthWest();
            const ne = moved.getNorthEast();
            const r = (n: number) => Math.round(n * 1e5) / 1e5;
            onSearchArea(`${r(sw.lng)},${r(sw.lat)},${r(ne.lng)},${r(ne.lat)}`);
            setMoved(null);
          }}
          className="absolute left-1/2 top-3 z-[500] inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-slate-800"
        >
          <Search className="h-4 w-4" /> Search this area
        </button>
      )}
    </div>
  );
}
