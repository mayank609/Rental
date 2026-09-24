/**
 * Interactive pin-drop map for the listing wizard. Click anywhere or drag
 * the pin to set the exact location. Loaded with React.lazy so Leaflet
 * stays out of the main bundle.
 */
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import { BaseMap } from "@/components/map/BaseMap";

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-100%);width:34px;height:44px;position:absolute;left:0;top:0">
    <svg viewBox="0 0 24 32" width="34" height="44" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0z" fill="#4f46e5"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg></div>`,
  iconSize: [0, 0],
});

function ClickToSet({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onChange(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Pans the map when the pin is moved programmatically (e.g. "locate"). */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    const cur = map.getCenter();
    if (Math.abs(cur.lat - lat) > 0.0005 || Math.abs(cur.lng - lng) > 0.0005) map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [lat, lng, map]);
  return null;
}

export default function LocationPinMap({ lat, lng, fallback, onChange }: { lat: number | null; lng: number | null; fallback: { lat: number; lng: number }; onChange: (lat: number, lng: number) => void }) {
  const has = lat != null && lng != null;
  const center = useMemo<[number, number]>(() => (has ? [lat!, lng!] : [fallback.lat, fallback.lng]), [has, lat, lng, fallback.lat, fallback.lng]);
  return (
    <BaseMap center={center} zoom={has ? 15 : 12} className="h-72 w-full rounded-2xl sm:h-80">
      <ClickToSet onChange={onChange} />
      {has && (
        <>
          <Recenter lat={lat!} lng={lng!} />
          <Marker
            position={[lat!, lng!]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onChange(p.lat, p.lng);
              },
            }}
          />
        </>
      )}
    </BaseMap>
  );
}
