/** Small shared helpers. */
import { customAlphabet } from "nanoid";

export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";

const codeAlphabet = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 6);
export const bookingCode = () => `RN-${codeAlphabet()}`;

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Format paise as a human readable rupee string, e.g. 150050 → "₹1,500.50" */
export const formatMoney = (paise: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(paise / 100);

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export function paginate(page?: number, limit?: number, max = 50) {
  const p = Math.max(1, page ?? 1);
  const l = clamp(limit ?? 20, 1, max);
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
}

export const pageMeta = (total: number, page: number, limit: number) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

/**
 * Deterministically fuzz a coordinate by up to ~`radiusM` metres so listings
 * expose only an approximate location. Seeded by id so it is stable.
 */
export function fuzzCoordinate(lat: number, lng: number, seed: string, radiusM = 400) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const angle = ((h % 360) * Math.PI) / 180;
  const dist = radiusM * (0.4 + ((h >>> 9) % 600) / 1000); // 40%–100% of radius
  const dLat = (dist * Math.cos(angle)) / 111_320;
  const dLng = (dist * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5) };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
