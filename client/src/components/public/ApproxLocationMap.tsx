/**
 * Small, non-interactive-by-default map showing a ~500 m circle around the
 * listing's approximate location. Lazy-loaded from the listing page.
 */
import { Circle } from "react-leaflet";
import BaseMap from "@/components/map/BaseMap";

export default function ApproxLocationMap({ lat, lng, radius = 500 }: { lat: number; lng: number; radius?: number }) {
  return (
    <BaseMap center={[lat, lng]} zoom={14} scrollWheelZoom={false} className="h-full w-full">
      <Circle center={[lat, lng]} radius={radius} pathOptions={{ color: "#4f46e5", fillColor: "#6366f1", fillOpacity: 0.2, weight: 2 }} />
    </BaseMap>
  );
}
