/**
 * Dynamic city & locality registry. Cities are never hard-coded: the first
 * listing geocoded into a new city creates its City row (and so its SEO page).
 */
import { prisma, Tx } from "../../lib/prisma";
import { slugify } from "../../lib/util";
import type { GeoPlace } from "../../lib/geo";
import { invalidate } from "../../lib/cache";

export async function upsertCityAndLocality(place: GeoPlace, tx: Tx = prisma) {
  const citySlug = slugify(place.city);
  const city = await tx.city.upsert({
    where: { slug: citySlug },
    create: { name: place.city, slug: citySlug, state: place.state, country: place.country || "IN", lat: place.lat, lng: place.lng },
    update: {},
  });
  let locality = null;
  if (place.locality) {
    const slug = slugify(place.locality);
    locality = await tx.locality.upsert({
      where: { cityId_slug: { cityId: city.id, slug } },
      create: { cityId: city.id, name: place.locality, slug, lat: place.lat, lng: place.lng, pincode: place.pincode },
      update: {},
    });
  }
  return { city, locality };
}

/** Recompute cached listing counts for a city (and its localities). */
export async function refreshCityCounts(cityId: string, tx: Tx = prisma) {
  const count = await tx.listing.count({ where: { cityId, status: "ACTIVE", deletedAt: null } });
  await tx.city.update({ where: { id: cityId }, data: { listingCount: count } });
  const perLocality = await tx.listing.groupBy({
    by: ["localityId"],
    where: { cityId, status: "ACTIVE", deletedAt: null, localityId: { not: null } },
    _count: true,
  });
  await tx.locality.updateMany({ where: { cityId }, data: { listingCount: 0 } });
  for (const row of perLocality) {
    if (row.localityId) await tx.locality.update({ where: { id: row.localityId }, data: { listingCount: row._count } });
  }
  await invalidate("cities");
}
