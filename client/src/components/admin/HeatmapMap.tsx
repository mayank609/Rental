/**
 * Supply vs demand heatmap (lazy loaded — pulls in leaflet).
 * Points are ~1km grid cells; circle radius scales with sqrt(weight).
 */
import { useEffect } from "react";
import { CircleMarker, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import BaseMap from "@/components/map/BaseMap";
import type { HeatPoint } from "./types";

const COLORS = { supply: "#2563eb", demand: "#f97316" } as const;

function FitBounds({ points, center }: { points: HeatPoint[]; center: [number, number] }) {
  const map = useMap();
  // Stable key so we only refit when the visible data actually changes
  const key = `${center.join(",")}|${points.length}|${points[0]?.lat ?? ""}|${points[points.length - 1]?.lng ?? ""}`;
  useEffect(() => {
    if (points.length > 1) {
      const lats = points.map((p) => p.lat);
      const lngs = points.map((p) => p.lng);
      const b: LatLngBoundsExpression = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ];
      map.fitBounds(b, { padding: [30, 30], maxZoom: 13 });
    } else {
      map.setView(center, points.length ? 12 : map.getZoom());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function HeatmapMap({ supply, demand, show, center, zoom }: { supply: HeatPoint[]; demand: HeatPoint[]; show: { supply: boolean; demand: boolean }; center: [number, number]; zoom: number }) {
  const all = [...(show.supply ? supply : []), ...(show.demand ? demand : [])];
  const maxW = Math.max(1, ...all.map((p) => p.weight));
  const radius = (w: number) => 5 + Math.sqrt(w / maxW) * 22;

  const layer = (pts: HeatPoint[], kind: keyof typeof COLORS) =>
    pts.map((p, i) => (
      <CircleMarker key={`${kind}-${i}`} center={[p.lat, p.lng]} radius={radius(p.weight)} pathOptions={{ color: COLORS[kind], weight: 1, fillColor: COLORS[kind], fillOpacity: 0.35 }}>
        <Tooltip>
          {kind === "supply" ? "Active listings" : "Searches"}: <b>{p.weight}</b>
        </Tooltip>
      </CircleMarker>
    ));

  return (
    <BaseMap center={center} zoom={zoom} className="h-full w-full">
      <FitBounds points={all} center={center} />
      {show.supply && layer(supply, "supply")}
      {show.demand && layer(demand, "demand")}
    </BaseMap>
  );
}
