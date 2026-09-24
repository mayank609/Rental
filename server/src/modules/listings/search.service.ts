/**
 * Listing discovery: PostGIS radius/distance + full-text + filters.
 *
 * Location semantics
 *  - `radiusKm` given  → pure radius search around lat/lng (crosses city
 *    borders, so users near a boundary still see nearby items).
 *  - only `city` given → listings in that city, sorted by distance from the
 *    user's locality point when lat/lng are known.
 *  - Nothing found     → `fallback` holds the nearest listings anywhere so
 *    the UI can show "nothing in X yet, here's what's closest".
 *
 * Featured (boosted) listings float to the top for the default sort.
 */
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { cached } from "../../lib/cache";
import { loadCategoryTree } from "../categories/categories.routes";
import { publicListing } from "./listings.serializers";
import { listingInclude } from "./listings.service";
import type { SearchInput } from "./listings.schemas";
import { pageMeta } from "../../lib/util";
import { logger } from "../../lib/logger";

interface Row {
  id: string;
  distance_km: number | null;
  rank: number | null;
}

async function categoryIds(slug?: string) {
  if (!slug) return null;
  const tree = await loadCategoryTree();
  for (const parent of tree) {
    if (parent.slug === slug) return [parent.id, ...parent.children.map((c) => c.id)];
    const child = parent.children.find((c) => c.slug === slug);
    if (child) return [child.id];
  }
  return [];
}

function buildWhere(input: SearchInput, ctx: { cityId?: string | null; catIds: string[] | null; point: Prisma.Sql | null; ignoreLocation?: boolean }) {
  const w: Prisma.Sql[] = [
    Prisma.sql`l."status" = 'ACTIVE'`,
    Prisma.sql`l."deletedAt" IS NULL`,
    Prisma.sql`u."status" = 'ACTIVE'`,
  ];
  if (!ctx.ignoreLocation) {
    if (input.radiusKm && ctx.point) {
      w.push(Prisma.sql`ST_DWithin(l."location", ${ctx.point}, ${input.radiusKm * 1000})`);
    } else if (ctx.cityId !== undefined) {
      w.push(ctx.cityId ? Prisma.sql`l."cityId" = ${ctx.cityId}` : Prisma.sql`FALSE`);
    }
    if (input.bbox) {
      const [minLng, minLat, maxLng, maxLat] = input.bbox.split(",").map(Number);
      w.push(Prisma.sql`l."approxLng" BETWEEN ${minLng} AND ${maxLng} AND l."approxLat" BETWEEN ${minLat} AND ${maxLat}`);
    }
  }
  if (ctx.catIds) {
    w.push(
      ctx.catIds.length
        ? Prisma.sql`(l."categoryId" IN (${Prisma.join(ctx.catIds)}) OR l."subcategoryId" IN (${Prisma.join(ctx.catIds)}))`
        : Prisma.sql`FALSE`,
    );
  }
  const dailyExpr = Prisma.sql`COALESCE(l."priceDaily", l."priceHourly" * 24, l."priceWeekly" / 7)`;
  if (input.minPrice != null) w.push(Prisma.sql`${dailyExpr} >= ${input.minPrice}`);
  if (input.maxPrice != null) w.push(Prisma.sql`${dailyExpr} <= ${input.maxPrice}`);
  if (input.minRating) w.push(Prisma.sql`l."ratingAvg" >= ${input.minRating}`);
  if (input.delivery) w.push(Prisma.sql`l."deliveryAvailable" = TRUE`);
  if (input.instant) w.push(Prisma.sql`l."instantBooking" = TRUE`);
  if (input.verified) w.push(Prisma.sql`(l."isVerified" = TRUE OR (u."kycStatus" = 'VERIFIED' AND u."phoneVerifiedAt" IS NOT NULL))`);
  if (input.ownerId) w.push(Prisma.sql`l."ownerId" = ${input.ownerId}`);
  if (input.q) {
    w.push(
      Prisma.sql`(l."searchVector" @@ websearch_to_tsquery('simple', ${input.q}) OR l."title" ILIKE ${"%" + input.q.replace(/[%_]/g, "") + "%"} OR similarity(l."title", ${input.q}) > 0.3)`,
    );
  }
  if (input.startAt && input.endAt && input.endAt > input.startAt) {
    w.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "Booking" b WHERE b."listingId" = l.id
        AND b."status" IN ('ACCEPTED','CONFIRMED','ACTIVE','OVERDUE')
        AND b."startAt" < ${input.endAt} AND b."endAt" > ${input.startAt})`);
    w.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "AvailabilityBlock" ab WHERE ab."listingId" = l.id
        AND ab."startAt" < ${input.endAt} AND ab."endAt" > ${input.startAt})`);
  }
  return Prisma.join(w, " AND ");
}

function orderBy(input: SearchInput, point: Prisma.Sql | null) {
  const featured = Prisma.sql`(l."featuredUntil" IS NOT NULL AND l."featuredUntil" > NOW()) DESC`;
  const dist = point ? Prisma.sql`distance_km ASC NULLS LAST` : Prisma.sql`l."publishedAt" DESC NULLS LAST`;
  const daily = Prisma.sql`COALESCE(l."priceDaily", l."priceHourly" * 24)`;
  switch (input.sort) {
    case "distance":
      return Prisma.sql`${dist}, l.id`;
    case "price_asc":
      return Prisma.sql`${daily} ASC, l.id`;
    case "price_desc":
      return Prisma.sql`${daily} DESC, l.id`;
    case "rating":
      return Prisma.sql`l."ratingAvg" DESC, l."ratingCount" DESC, l.id`;
    case "newest":
      return Prisma.sql`l."publishedAt" DESC NULLS LAST, l.id`;
    default:
      // Recommended: boosted first, then relevance (text), then distance, then quality
      return input.q
        ? Prisma.sql`${featured}, rank DESC, ${dist}, l.id`
        : Prisma.sql`${featured}, ${dist}, l."ratingAvg" DESC, l.id`;
  }
}

async function runQuery(input: SearchInput, ctx: { cityId?: string | null; catIds: string[] | null; point: Prisma.Sql | null; ignoreLocation?: boolean }, limit: number, offset: number) {
  const where = buildWhere(input, ctx);
  const distanceSel = ctx.point ? Prisma.sql`ST_Distance(l."location", ${ctx.point}) / 1000.0` : Prisma.sql`NULL::float`;
  const rankSel = input.q ? Prisma.sql`ts_rank(l."searchVector", websearch_to_tsquery('simple', ${input.q}))` : Prisma.sql`NULL::float`;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT l.id, ${distanceSel} AS distance_km, ${rankSel} AS rank
      FROM "Listing" l JOIN "User" u ON u.id = l."ownerId"
      WHERE ${where}
      ORDER BY ${orderBy(input, ctx.point)}
      LIMIT ${limit} OFFSET ${offset}`,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "Listing" l JOIN "User" u ON u.id = l."ownerId" WHERE ${where}`,
  ]);
  const listings = await hydrate(rows);
  return { listings, total: Number(countRows[0]?.count ?? 0) };
}

export async function hydrate(rows: Row[]) {
  if (!rows.length) return [];
  const full = await prisma.listing.findMany({ where: { id: { in: rows.map((r) => r.id) } }, include: listingInclude });
  const byId = new Map(full.map((l) => [l.id, l]));
  return rows
    .filter((r) => byId.has(r.id))
    .map((r) => {
      const l = publicListing(byId.get(r.id)!);
      const { description, rules, ...card } = l; // keep search payload light
      void description;
      void rules;
      return { ...card, images: card.images.slice(0, 3), distanceKm: r.distance_km != null ? Math.round(r.distance_km * 10) / 10 : null };
    });
}

export async function searchListings(input: SearchInput, userId?: string) {
  const key = crypto.createHash("sha1").update(JSON.stringify(input)).digest("hex");
  const result = await cached("listings", `search:${key}`, 60, async () => {
    const catIds = await categoryIds(input.category);
    let cityId: string | null | undefined;
    let cityInfo: { id: string; name: string; slug: string; lat: number; lng: number } | null = null;
    if (input.city) {
      cityInfo = await prisma.city.findUnique({ where: { slug: input.city }, select: { id: true, name: true, slug: true, lat: true, lng: true } });
      cityId = cityInfo?.id ?? null;
    }
    // Locality slug → use its centre as the distance origin when no GPS point
    let lat = input.lat;
    let lng = input.lng;
    if ((lat == null || lng == null) && input.locality && cityInfo) {
      const loc = await prisma.locality.findFirst({ where: { cityId: cityInfo.id, slug: input.locality } });
      if (loc) ({ lat, lng } = loc);
    }
    if ((lat == null || lng == null) && cityInfo) ({ lat, lng } = cityInfo);
    const point = lat != null && lng != null ? Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography` : null;

    const offset = (input.page - 1) * input.limit;
    const main = await runQuery(input, { cityId, catIds, point }, input.limit, offset);

    let fallback: { reason: string; listings: Awaited<ReturnType<typeof hydrate>> } | null = null;
    if (main.total === 0 && input.page === 1 && point) {
      const near = await runQuery({ ...input, sort: "distance", radiusKm: undefined, bbox: undefined, startAt: undefined, endAt: undefined }, { catIds, point, ignoreLocation: true }, 12, 0);
      fallback = { reason: input.q || input.category ? "NO_MATCHES_NEARBY" : "NO_LISTINGS_IN_AREA", listings: near.listings };
    }
    return {
      listings: main.listings,
      meta: pageMeta(main.total, input.page, input.limit),
      city: cityInfo,
      origin: point ? { lat, lng } : null,
      fallback,
    };
  });

  // Demand signal for admin heatmap (fire-and-forget)
  if (input.page === 1) {
    prisma.searchLog
      .create({
        data: {
          cityId: result.city?.id ?? null,
          userId: userId ?? null,
          query: input.q ?? null,
          categorySlug: input.category ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          resultCount: result.meta.total,
        },
      })
      .catch((err) => logger.warn({ err }, "search log failed"));
  }
  return result;
}
