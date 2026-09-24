/** Admin dashboard metrics: GMV, revenue, users, funnel, city supply/demand. */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { cached } from "../../lib/cache";

const PAID_STATUSES = ["CONFIRMED", "ACTIVE", "OVERDUE", "RETURNED", "COMPLETED", "DISPUTED"] as const;

export async function dashboard(days: number) {
  return cached("admin", `dashboard:${days}:${new Date().toISOString().slice(0, 13)}`, 300, async () => {
    const since = new Date(Date.now() - days * 24 * 3600_000);
    const prevSince = new Date(since.getTime() - days * 24 * 3600_000);

    const paidAgg = (from: Date, to: Date) =>
      prisma.booking.aggregate({
        where: { status: { in: [...PAID_STATUSES] }, confirmedAt: { gte: from, lt: to } },
        _sum: { rentAmount: true, platformRevenue: true, totalAmount: true },
        _count: true,
      });
    const now = new Date();
    const [cur, prev, activeUsers, newUsers, totalUsers, activeListings, pendingListings, openDisputes, openFlags, openReports, pendingKyc] = await Promise.all([
      paidAgg(since, now),
      paidAgg(prevSince, since),
      prisma.user.count({ where: { lastLoginAt: { gte: since }, status: "ACTIVE" } }),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.user.count({ where: { status: { not: "DELETED" } } }),
      prisma.listing.count({ where: { status: "ACTIVE", deletedAt: null } }),
      prisma.listing.count({ where: { status: "PENDING_REVIEW", deletedAt: null } }),
      prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      prisma.flag.count({ where: { status: "OPEN" } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.kycDocument.count({ where: { status: "PENDING" } }),
    ]);

    // Extra revenue streams (promotions, subscriptions) + late fees
    const [extraRevenue, lateFees] = await Promise.all([
      prisma.payment.aggregate({ where: { purpose: { in: ["FEATURED", "SUBSCRIPTION"] }, status: "CAPTURED", capturedAt: { gte: since } }, _sum: { amount: true } }),
      prisma.ledgerEntry.aggregate({ where: { account: "PLATFORM_REVENUE", description: "Late fee platform share", createdAt: { gte: since } }, _sum: { amount: true } }),
    ]);

    const daily = await prisma.$queryRaw<{ day: Date; gmv: bigint; revenue: bigint; bookings: bigint }[]>`
      SELECT date_trunc('day', "confirmedAt") AS day, COALESCE(SUM("rentAmount"),0)::bigint AS gmv,
             COALESCE(SUM("platformRevenue"),0)::bigint AS revenue, COUNT(*)::bigint AS bookings
      FROM "Booking" WHERE "confirmedAt" >= ${since} AND "status" IN ('CONFIRMED','ACTIVE','OVERDUE','RETURNED','COMPLETED','DISPUTED')
      GROUP BY 1 ORDER BY 1`;

    const bookingsPerCity = await prisma.$queryRaw<{ city: string; slug: string; bookings: bigint; gmv: bigint }[]>`
      SELECT c.name AS city, c.slug, COUNT(b.id)::bigint AS bookings, COALESCE(SUM(b."rentAmount"),0)::bigint AS gmv
      FROM "Booking" b JOIN "Listing" l ON l.id = b."listingId" JOIN "City" c ON c.id = l."cityId"
      WHERE b."createdAt" >= ${since}
      GROUP BY c.name, c.slug ORDER BY bookings DESC LIMIT 15`;

    const topCategories = await prisma.$queryRaw<{ category: string; bookings: bigint; gmv: bigint }[]>`
      SELECT cat.name AS category, COUNT(b.id)::bigint AS bookings, COALESCE(SUM(b."rentAmount"),0)::bigint AS gmv
      FROM "Booking" b JOIN "Listing" l ON l.id = b."listingId" JOIN "Category" cat ON cat.id = l."categoryId"
      WHERE b."createdAt" >= ${since} AND b."status" IN ('CONFIRMED','ACTIVE','OVERDUE','RETURNED','COMPLETED','DISPUTED')
      GROUP BY cat.name ORDER BY gmv DESC LIMIT 10`;

    // Funnel: searches → listing views (approx) → requests → accepted → paid → completed
    const [searches, requests, accepted, paid, completed, views] = await Promise.all([
      prisma.searchLog.count({ where: { createdAt: { gte: since } } }),
      prisma.booking.count({ where: { createdAt: { gte: since } } }),
      prisma.booking.count({ where: { createdAt: { gte: since }, acceptedAt: { not: null } } }),
      prisma.booking.count({ where: { createdAt: { gte: since }, confirmedAt: { not: null } } }),
      prisma.booking.count({ where: { createdAt: { gte: since }, status: "COMPLETED" } }),
      prisma.recentlyViewed.count({ where: { viewedAt: { gte: since } } }),
    ]);

    const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
    const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
    const gmv = cur._sum.rentAmount ?? 0;
    const revenue = (cur._sum.platformRevenue ?? 0) + (extraRevenue._sum.amount ?? 0) + (lateFees._sum.amount ?? 0);
    return {
      period: { days, since },
      kpis: {
        gmv,
        gmvChange: pct(gmv, prev._sum.rentAmount ?? 0),
        revenue,
        revenueChange: pct(cur._sum.platformRevenue ?? 0, prev._sum.platformRevenue ?? 0),
        bookings: cur._count,
        bookingsChange: pct(cur._count, prev._count),
        avgBookingValue: cur._count ? Math.round(gmv / cur._count) : 0,
        activeUsers,
        newUsers,
        totalUsers,
        activeListings,
      },
      queues: { pendingListings, openDisputes, openFlags, openReports, pendingKyc },
      revenueBreakdown: {
        bookingFees: cur._sum.platformRevenue ?? 0,
        promotionsAndSubscriptions: extraRevenue._sum.amount ?? 0,
        lateFees: lateFees._sum.amount ?? 0,
      },
      daily: daily.map((d) => ({ date: d.day.toISOString().slice(0, 10), gmv: n(d.gmv), revenue: n(d.revenue), bookings: n(d.bookings) })),
      bookingsPerCity: bookingsPerCity.map((c) => ({ city: c.city, slug: c.slug, bookings: n(c.bookings), gmv: n(c.gmv) })),
      topCategories: topCategories.map((c) => ({ category: c.category, bookings: n(c.bookings), gmv: n(c.gmv) })),
      funnel: [
        { stage: "Searches", count: searches },
        { stage: "Listing views", count: views },
        { stage: "Booking requests", count: requests },
        { stage: "Accepted", count: accepted },
        { stage: "Paid", count: paid },
        { stage: "Completed", count: completed },
      ],
    };
  });
}

/** Supply (active listings) vs demand (searches, requests) per city. */
export async function cityAnalytics(days: number) {
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const rows = await prisma.$queryRaw<{ id: string; name: string; slug: string; lat: number; lng: number; supply: bigint; searches: bigint; zero_result: bigint; requests: bigint; gmv: bigint }[]>`
    SELECT c.id, c.name, c.slug, c.lat, c.lng,
      (SELECT COUNT(*) FROM "Listing" l WHERE l."cityId" = c.id AND l."status" = 'ACTIVE' AND l."deletedAt" IS NULL)::bigint AS supply,
      (SELECT COUNT(*) FROM "SearchLog" s WHERE s."cityId" = c.id AND s."createdAt" >= ${since})::bigint AS searches,
      (SELECT COUNT(*) FROM "SearchLog" s WHERE s."cityId" = c.id AND s."createdAt" >= ${since} AND s."resultCount" = 0)::bigint AS zero_result,
      (SELECT COUNT(*) FROM "Booking" b JOIN "Listing" l ON l.id = b."listingId" WHERE l."cityId" = c.id AND b."createdAt" >= ${since})::bigint AS requests,
      (SELECT COALESCE(SUM(b."rentAmount"),0) FROM "Booking" b JOIN "Listing" l ON l.id = b."listingId" WHERE l."cityId" = c.id AND b."confirmedAt" >= ${since})::bigint AS gmv
    FROM "City" c ORDER BY supply DESC`;
  return rows.map((r) => {
    const supply = Number(r.supply);
    const demand = Number(r.searches) + Number(r.requests) * 5;
    return {
      ...r,
      supply,
      searches: Number(r.searches),
      zeroResultSearches: Number(r.zero_result),
      requests: Number(r.requests),
      gmv: Number(r.gmv),
      demandSupplyRatio: supply ? Math.round((demand / supply) * 10) / 10 : demand ? null : 0,
    };
  });
}

/** Point data for the demand/supply heatmap. */
export async function heatmap(citySlug: string | undefined, days: number) {
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const city = citySlug ? await prisma.city.findUnique({ where: { slug: citySlug } }) : null;
  const cityFilter = city ? Prisma.sql`AND "cityId" = ${city.id}` : Prisma.empty;
  const supply = await prisma.$queryRaw<{ lat: number; lng: number; w: bigint }[]>`
    SELECT round("approxLat"::numeric, 2)::float AS lat, round("approxLng"::numeric, 2)::float AS lng, COUNT(*)::bigint AS w
    FROM "Listing" WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL ${cityFilter} GROUP BY 1, 2`;
  const demand = await prisma.$queryRaw<{ lat: number; lng: number; w: bigint }[]>`
    SELECT round(lat::numeric, 2)::float AS lat, round(lng::numeric, 2)::float AS lng, COUNT(*)::bigint AS w
    FROM "SearchLog" WHERE lat IS NOT NULL AND "createdAt" >= ${since} ${cityFilter} GROUP BY 1, 2`;
  return {
    city,
    supply: supply.map((p) => ({ lat: p.lat, lng: p.lng, weight: Number(p.w) })),
    demand: demand.map((p) => ({ lat: p.lat, lng: p.lng, weight: Number(p.w) })),
  };
}
