/**
 * Geocoding, reverse geocoding, autocomplete and IP location.
 * Providers: Google Maps, Mapbox, Nominatim (OpenStreetMap, free) and an
 * offline gazetteer (used in tests and as a last-resort fallback).
 * All results are cached in Redis to control API costs.
 */
import { env } from "../config/env";
import { kv } from "./redis";
import { logger } from "./logger";
import { GAZETTEER } from "./geo.data";
import { haversineKm } from "./util";

export interface GeoPlace {
  lat: number;
  lng: number;
  city: string;
  locality?: string;
  state?: string;
  pincode?: string;
  country?: string;
  formatted?: string;
}

const CACHE_TTL = 60 * 60 * 24 * 30;

async function withCache<T>(key: string, fn: () => Promise<T | null>): Promise<T | null> {
  const hit = await kv.get(`geo:${key}`).catch(() => null);
  if (hit) return JSON.parse(hit) as T;
  const v = await fn();
  if (v) await kv.set(`geo:${key}`, JSON.stringify(v), CACHE_TTL).catch(() => undefined);
  return v;
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": `${env.PLATFORM_NAME}/1.0 (${env.SUPPORT_EMAIL})`, ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- offline --
export function offlineReverse(lat: number, lng: number): GeoPlace | null {
  let best: GeoPlace | null = null;
  let bestD = Infinity;
  for (const c of GAZETTEER) {
    for (const l of c.localities) {
      const d = haversineKm({ lat, lng }, l);
      if (d < bestD) {
        bestD = d;
        best = { lat, lng, city: c.name, locality: l.name, state: c.state, pincode: l.pincode, country: "IN" };
      }
    }
  }
  return bestD < 60 ? best : null;
}

function offlineSearch(q: string): GeoPlace[] {
  const s = q.toLowerCase();
  const out: GeoPlace[] = [];
  for (const c of GAZETTEER) {
    if (c.name.toLowerCase().includes(s)) out.push({ lat: c.lat, lng: c.lng, city: c.name, state: c.state, country: "IN", formatted: `${c.name}, ${c.state}` });
    for (const l of c.localities) {
      if (l.name.toLowerCase().includes(s) || s.includes(l.name.toLowerCase()) || l.pincode === s.trim())
        out.push({ lat: l.lat, lng: l.lng, city: c.name, locality: l.name, state: c.state, pincode: l.pincode, country: "IN", formatted: `${l.name}, ${c.name}` });
    }
  }
  if (!out.length) {
    // Address strings like "12 MG Road, Koramangala, Bengaluru"
    for (const c of GAZETTEER) {
      if (!s.includes(c.name.toLowerCase())) continue;
      const loc = c.localities.find((l) => s.includes(l.name.toLowerCase()));
      const p = loc ?? { lat: c.lat, lng: c.lng, pincode: undefined, name: undefined };
      out.push({ lat: p.lat, lng: p.lng, city: c.name, locality: loc?.name, state: c.state, pincode: loc?.pincode, country: "IN", formatted: q });
    }
  }
  return out.slice(0, 8);
}

// -------------------------------------------------------------- nominatim --
function fromNominatim(r: any): GeoPlace | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = r.address ?? {};
  const city = a.city || a.town || a.village || a.municipality || a.state_district || a.county;
  if (!city) return null;
  return {
    lat: +r.lat,
    lng: +r.lon,
    city: String(city).replace(/ (Municipal Corporation|District)$/i, ""),
    locality: a.suburb || a.neighbourhood || a.quarter || a.city_district || undefined,
    state: a.state,
    pincode: a.postcode,
    country: (a.country_code ?? "").toUpperCase(),
    formatted: r.display_name,
  };
}

// ------------------------------------------------------------------ google --
function fromGoogle(r: any): GeoPlace | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const get = (t: string) => r.address_components?.find((c: any) => c.types.includes(t))?.long_name; // eslint-disable-line @typescript-eslint/no-explicit-any
  const city = get("locality") || get("administrative_area_level_2");
  if (!city) return null;
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    city,
    locality: get("sublocality_level_1") || get("sublocality") || get("neighborhood"),
    state: get("administrative_area_level_1"),
    pincode: get("postal_code"),
    country: r.address_components?.find((c: any) => c.types.includes("country"))?.short_name, // eslint-disable-line @typescript-eslint/no-explicit-any
    formatted: r.formatted_address,
  };
}

// ------------------------------------------------------------------ mapbox --
function fromMapbox(f: any): GeoPlace | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const ctx: any[] = f.context ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const find = (p: string) => (f.id?.startsWith(p) ? f.text : ctx.find((c) => c.id.startsWith(p))?.text);
  const city = find("place");
  if (!city) return null;
  return {
    lat: f.center[1],
    lng: f.center[0],
    city,
    locality: find("locality") || find("neighborhood"),
    state: find("region"),
    pincode: find("postcode"),
    country: ctx.find((c) => c.id.startsWith("country"))?.short_code?.toUpperCase(),
    formatted: f.place_name,
  };
}

/** Forward geocode a free-text address. */
export async function geocode(address: string): Promise<GeoPlace | null> {
  const results = await searchPlaces(address, 1);
  return results[0] ?? null;
}

/** Autocomplete places (cities, localities, pincodes, addresses). */
export async function searchPlaces(q: string, limit = 6): Promise<GeoPlace[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const key = `search:${env.GEOCODER}:${query.toLowerCase()}:${limit}`;
  const res = await withCache<GeoPlace[]>(key, async () => {
    try {
      switch (env.GEOCODER) {
        case "google": {
          const j = await fetchJson(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=${env.COUNTRY_CODE.toLowerCase()}&key=${env.GOOGLE_MAPS_API_KEY}`,
          );
          return (j.results ?? []).map(fromGoogle).filter(Boolean).slice(0, limit);
        }
        case "mapbox": {
          const j = await fetchJson(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=${env.COUNTRY_CODE.toLowerCase()}&limit=${limit}&access_token=${env.MAPBOX_TOKEN}`,
          );
          return (j.features ?? []).map(fromMapbox).filter(Boolean);
        }
        case "nominatim": {
          const j = await fetchJson(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&countrycodes=${env.COUNTRY_CODE.toLowerCase()}&q=${encodeURIComponent(query)}`,
          );
          return (j ?? []).map(fromNominatim).filter(Boolean);
        }
        default:
          return offlineSearch(query).slice(0, limit);
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "geocoder failed, using offline fallback");
      return offlineSearch(query).slice(0, limit);
    }
  });
  return res ?? [];
}

/** Reverse geocode coordinates to city/locality. */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace | null> {
  const key = `rev:${env.GEOCODER}:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return withCache<GeoPlace>(key, async () => {
    try {
      switch (env.GEOCODER) {
        case "google": {
          const j = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${env.GOOGLE_MAPS_API_KEY}`);
          return (j.results ?? []).map(fromGoogle).find(Boolean) ?? offlineReverse(lat, lng);
        }
        case "mapbox": {
          const j = await fetchJson(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${env.MAPBOX_TOKEN}`);
          return (j.features ?? []).map(fromMapbox).find(Boolean) ?? offlineReverse(lat, lng);
        }
        case "nominatim": {
          const j = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=16&lat=${lat}&lon=${lng}`);
          const p = fromNominatim(j);
          return p ? { ...p, lat, lng } : offlineReverse(lat, lng);
        }
        default:
          return offlineReverse(lat, lng);
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "reverse geocode failed, using offline fallback");
      return offlineReverse(lat, lng);
    }
  });
}

/** Approximate city from an IP address (used when geolocation is denied). */
export async function ipLocate(ip: string): Promise<GeoPlace | null> {
  const isPrivate = !ip || /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:127\.)/.test(ip);
  if (isPrivate || env.GEOCODER === "offline") return null;
  return withCache<GeoPlace>(`ip:${ip}`, async () => {
    try {
      const j = await fetchJson(`${env.IP_GEO_URL}/${encodeURIComponent(ip)}?fields=status,city,regionName,lat,lon,zip,countryCode`);
      if (j.status !== "success" || !j.city) return null;
      return { lat: j.lat, lng: j.lon, city: j.city, state: j.regionName, pincode: j.zip, country: j.countryCode };
    } catch {
      return null;
    }
  });
}
