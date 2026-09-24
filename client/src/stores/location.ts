/**
 * User location: auto-detected (browser geolocation → IP fallback) or
 * manually chosen. Persisted in localStorage and synced to the account.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";

export interface UserLocation {
  city: string;
  citySlug: string;
  locality?: string | null;
  localitySlug?: string | null;
  lat: number;
  lng: number;
  source: "gps" | "ip" | "manual" | "default";
}

interface LocationStore {
  location: UserLocation | null;
  detecting: boolean;
  permissionDenied: boolean;
  radiusKm: number | null;
  setLocation: (l: UserLocation, sync?: boolean) => void;
  setRadius: (r: number | null) => void;
  detect: (opts?: { force?: boolean }) => Promise<UserLocation | null>;
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function fromIp(): Promise<UserLocation | null> {
  try {
    const r = await api.get("/locations/detect");
    const p = r.data.place;
    if (!p) return null;
    return { city: p.city, citySlug: p.citySlug ?? slugify(p.city), locality: p.locality ?? null, localitySlug: p.localitySlug ?? null, lat: p.lat, lng: p.lng, source: r.data.source === "ip" ? "ip" : "default" };
  } catch {
    return null;
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60_000 });
  });
}

export const useLocationStore = create<LocationStore>()(
  persist(
    (set, get) => ({
      location: null,
      detecting: false,
      permissionDenied: false,
      radiusKm: null,
      setLocation: (l, sync = true) => {
        set({ location: l });
        if (sync) api.put("/users/me/location", { city: l.city, locality: l.locality ?? null, lat: l.lat, lng: l.lng }).catch(() => undefined);
      },
      setRadius: (r) => set({ radiusKm: r }),
      detect: async ({ force } = {}) => {
        const cur = get().location;
        if (cur && cur.source === "manual" && !force) return cur;
        set({ detecting: true });
        try {
          const pos = await getPosition();
          const { latitude: lat, longitude: lng } = pos.coords;
          const r = await api.get("/locations/reverse", { params: { lat, lng } });
          const p = r.data.place;
          if (p?.city) {
            const loc: UserLocation = { city: p.city, citySlug: p.citySlug, locality: p.locality ?? null, localitySlug: p.localitySlug ?? null, lat, lng, source: "gps" };
            set({ location: loc, permissionDenied: false });
            return loc;
          }
          throw new Error("unresolved");
        } catch (err) {
          const denied = (err as GeolocationPositionError)?.code === 1;
          if (denied) set({ permissionDenied: true });
          const ip = cur && !force ? cur : await fromIp();
          if (ip) set({ location: ip });
          return ip;
        } finally {
          set({ detecting: false });
        }
      },
    }),
    { name: "rn-location", partialize: (s) => ({ location: s.location, radiusKm: s.radiusKm, permissionDenied: s.permissionDenied }) },
  ),
);
