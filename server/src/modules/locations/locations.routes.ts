/**
 * /api/v1/locations — location detection & city/locality discovery.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate";
import { clientIp } from "../../middleware/security";
import { ipLocate, reverseGeocode, searchPlaces } from "../../lib/geo";
import { prisma } from "../../lib/prisma";
import { cached } from "../../lib/cache";
import { notFound } from "../../lib/errors";
import { slugify, haversineKm } from "../../lib/util";

export const locationsRouter = Router();

const latLng = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

/** Attach DB info (slug, listing count) to a geocoded place. */
async function enrich<T extends { city: string; locality?: string; lat: number; lng: number }>(place: T) {
  const citySlug = slugify(place.city);
  const city = await prisma.city.findUnique({ where: { slug: citySlug }, select: { id: true, listingCount: true, name: true } });
  return { ...place, citySlug, localitySlug: place.locality ? slugify(place.locality) : undefined, cityListingCount: city?.listingCount ?? 0 };
}

/** IP-based fallback when browser geolocation is denied. */
locationsRouter.get("/detect", async (req, res) => {
  const cdnCity = req.headers["cf-ipcity"] || req.headers["x-vercel-ip-city"];
  const ip = clientIp(req);
  let place = await ipLocate(ip);
  if (!place && cdnCity) {
    const found = await searchPlaces(decodeURIComponent(String(cdnCity)), 1);
    place = found[0] ?? null;
  }
  if (!place) {
    // Last resort: the city with the most listings
    const top = await prisma.city.findFirst({ where: { isActive: true }, orderBy: { listingCount: "desc" } });
    if (!top) return res.json({ place: null, source: "none" });
    return res.json({ place: await enrich({ city: top.name, lat: top.lat, lng: top.lng, state: top.state }), source: "default" });
  }
  res.json({ place: await enrich(place), source: "ip" });
});

/** Reverse geocode browser coordinates to city + locality. */
locationsRouter.get("/reverse", validate({ query: latLng }), async (req, res) => {
  const { lat, lng } = req.query as unknown as z.infer<typeof latLng>;
  const place = await reverseGeocode(lat, lng);
  if (!place) return res.json({ place: { lat, lng, city: null } });
  res.json({ place: await enrich({ ...place, lat, lng }) });
});

/** Autocomplete for city / locality / pincode / address. */
locationsRouter.get("/search", validate({ query: z.object({ q: z.string().min(2).max(120) }) }), async (req, res) => {
  const q = String(req.query.q);
  const [dbCities, places] = await Promise.all([
    prisma.city.findMany({
      where: { name: { contains: q, mode: "insensitive" }, isActive: true },
      take: 5,
      orderBy: { listingCount: "desc" },
    }),
    searchPlaces(q, 6),
  ]);
  const results = [
    ...dbCities.map((c) => ({ type: "city", city: c.name, citySlug: c.slug, state: c.state, lat: c.lat, lng: c.lng, listingCount: c.listingCount })),
    ...(await Promise.all(places.map((p) => enrich(p)))).map((p) => ({ type: p.locality ? "locality" : "city", ...p })),
  ];
  // De-duplicate by city+locality
  const seen = new Set<string>();
  res.json({
    results: results.filter((r) => {
      const k = `${r.citySlug}|${(r as { locality?: string }).locality ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  });
});

/** Cities that currently have listings (for city index / SEO / picker). */
locationsRouter.get("/cities", async (_req, res) => {
  const cities = await cached("cities", "all", 300, () =>
    prisma.city.findMany({
      where: { isActive: true, listingCount: { gt: 0 } },
      orderBy: [{ listingCount: "desc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, state: true, lat: true, lng: true, listingCount: true },
    }),
  );
  res.json({ cities });
});

locationsRouter.get("/cities/:slug", async (req, res) => {
  const city = await cached("cities", `city:${req.params.slug}`, 300, () =>
    prisma.city.findUnique({
      where: { slug: req.params.slug },
      include: { localities: { orderBy: [{ listingCount: "desc" }, { name: "asc" }], take: 200 } },
    }),
  );
  if (!city) throw notFound("City");
  res.json({ city });
});

/** Nearest cities with listings to a point (used for empty states). */
locationsRouter.get("/nearby-cities", validate({ query: latLng }), async (req, res) => {
  const { lat, lng } = req.query as unknown as z.infer<typeof latLng>;
  const cities = await prisma.city.findMany({ where: { isActive: true, listingCount: { gt: 0 } } });
  const sorted = cities
    .map((c) => ({ ...c, distanceKm: Math.round(haversineKm({ lat, lng }, c) * 10) / 10 }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 6);
  res.json({ cities: sorted });
});
