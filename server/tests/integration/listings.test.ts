import { beforeAll, describe, expect, it } from "vitest";
import { app, auth, createListing, request, resetDb, seedCategory, signup, prisma, window } from "../helpers";

describe("listings & discovery", () => {
  let owner: Awaited<ReturnType<typeof signup>>;
  let cat: Awaited<ReturnType<typeof seedCategory>>;

  beforeAll(async () => {
    await resetDb();
    cat = await seedCategory();
    owner = await signup("Owner");
  });

  it("creates a listing, auto-creates the city and hides the exact location", async () => {
    const l = await createListing(owner.token, cat.parent.id);
    expect(l.status).toBe("ACTIVE");
    const city = await prisma.city.findUnique({ where: { slug: "mumbai" } });
    expect(city?.listingCount).toBe(1);
    const pub = await request(app).get(`/api/v1/listings/${l.id}`).expect(200);
    expect(pub.body.listing.exactLocation).toBeUndefined();
    expect(pub.body.listing.address).toBeUndefined();
    expect(pub.body.listing.location.approximate).toBe(true);
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.approxLat).not.toBe(row.lat);
  });

  it("rejects prohibited items and raises a flag", async () => {
    const res = await request(app)
      .post("/api/v1/listings")
      .set(auth(owner.token))
      .send({
        title: "Air pistol for rent",
        description: "Great pistol for practice, comes with pellets and case.",
        categoryId: cat.parent.id,
        priceDaily: 50000,
        address: { line1: "1 MG Road", locality: "Koramangala", city: "Bengaluru" },
        imageIds: [],
        publish: false,
      })
      .expect(422);
    expect(res.body.error.code).toBe("PROHIBITED_ITEM");
    expect(await prisma.flag.count({ where: { type: "PROHIBITED_ITEM_ATTEMPT" } })).toBe(1);
  });

  it("rejects addresses that cannot be geocoded", async () => {
    const res = await request(app)
      .post("/api/v1/listings")
      .set(auth(owner.token))
      .send({ title: "Tripod stand", description: "Sturdy aluminium tripod up to 6 feet tall.", categoryId: cat.parent.id, priceDaily: 10000, address: { line1: "Nowhere lane", city: "Atlantis" }, publish: false })
      .expect(422);
    expect(res.body.error.code).toBe("INVALID_ADDRESS");
  });

  it("finds listings by city, radius, text and category, sorted by distance", async () => {
    const byCity = await request(app).get("/api/v1/listings/search?city=mumbai").expect(200);
    expect(byCity.body.meta.total).toBe(1);
    const radius = await request(app).get("/api/v1/listings/search?lat=19.06&lng=72.83&radiusKm=5").expect(200);
    expect(radius.body.listings[0].distanceKm).toBeLessThan(5);
    const far = await request(app).get("/api/v1/listings/search?lat=28.61&lng=77.2&radiusKm=10").expect(200);
    expect(far.body.meta.total).toBe(0);
    expect(far.body.fallback.reason).toBe("NO_LISTINGS_IN_AREA");
    expect(far.body.fallback.listings).toHaveLength(1);
    const text = await request(app).get("/api/v1/listings/search?q=canon&city=mumbai").expect(200);
    expect(text.body.meta.total).toBe(1);
    const sub = await request(app).get("/api/v1/listings/search?category=cameras").expect(200);
    expect(sub.body.meta.total).toBe(1);
  });

  it("returns a quote with fees and validates min rental period", async () => {
    const l = await prisma.listing.findFirstOrThrow();
    const w = window(3, 2);
    const q = await request(app).get(`/api/v1/listings/${l.id}/quote`).query(w).expect(200);
    expect(q.body.available).toBe(true);
    expect(q.body.breakdown.rent.amount).toBe(200000);
    expect(q.body.breakdown.totalAmount).toBe(200000 + 10000 + 1800 + 500000);
    const short = { startAt: w.startAt, endAt: new Date(new Date(w.startAt).getTime() + 3 * 3600_000).toISOString() };
    await request(app).get(`/api/v1/listings/${l.id}/quote`).query(short).expect(400);
  });

  it("blocks dates and excludes them from availability search", async () => {
    const l = await prisma.listing.findFirstOrThrow();
    const w = window(10, 2);
    await request(app).post(`/api/v1/listings/${l.id}/blocks`).set(auth(owner.token)).send(w).expect(201);
    const s = await request(app).get("/api/v1/listings/search").query({ city: "mumbai", ...w }).expect(200);
    expect(s.body.meta.total).toBe(0);
  });

  it("serves sitemap with city & listing URLs", async () => {
    const res = await request(app).get("/sitemap.xml").expect(200);
    expect(res.text).toContain("/rent/mumbai");
    expect(res.text).toContain("/listing/");
  });
});
