/**
 * Leaflet map with OpenStreetMap tiles (or Mapbox when VITE_MAPBOX_TOKEN
 * is set). Import lazily from pages to keep the maps chunk out of the
 * initial bundle.
 */
import { MapContainer, TileLayer, type MapContainerProps } from "react-leaflet";
import type { ReactNode } from "react";

const MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN;

export function BaseMap({ children, className, ...props }: MapContainerProps & { children?: ReactNode; className?: string }) {
  return (
    <MapContainer scrollWheelZoom className={className ?? "h-full w-full"} {...props}>
      {MAPBOX ? (
        <TileLayer
          url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX}`}
          attribution='© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
      ) : (
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      )}
      {children}
    </MapContainer>
  );
}

export default BaseMap;
