/**
 * Seed script: categories, staff & sample users, ~80 listings across 10
 * Indian cities (with generated images), bookings in every lifecycle state,
 * payments, payouts and reviews.
 *
 *   npm run db:seed          (idempotent: wipes marketplace data first)
 *
 * Demo logins (password: Password@123, or OTP 123456 when OTP_DEV_ECHO):
 *   admin@rentnest.in · support@rentnest.in · owner@rentnest.in · renter@rentnest.in
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { GAZETTEER } from "../src/lib/geo.data";
import { fuzzCoordinate, slugify, bookingCode, DAY, HOUR } from "../src/lib/util";
import { calculateBreakdown } from "../src/modules/pricing/pricing";
import { DEFAULT_SETTINGS } from "../src/modules/settings/settings.defaults";
import { storage } from "../src/lib/storage";

const prisma = new PrismaClient();

const CATEGORIES: { name: string; icon: string; children: string[] }[] = [
  { name: "Cameras & Photography", icon: "camera", children: ["DSLR & Mirrorless", "Lenses", "Drones", "Action Cameras", "Lighting & Tripods"] },
  { name: "Electronics", icon: "laptop", children: ["Laptops", "Gaming Consoles", "Projectors", "Speakers & Audio", "Tablets"] },
  { name: "Furniture", icon: "sofa", children: ["Sofas", "Beds", "Tables & Chairs", "Office Furniture"] },
  { name: "Home Appliances", icon: "refrigerator", children: ["Refrigerators", "Washing Machines", "Air Conditioners", "Kitchen Appliances"] },
  { name: "Vehicles", icon: "bike", children: ["Bicycles", "Scooters", "Motorbikes", "Electric Scooters"] },
  { name: "Tools & DIY", icon: "wrench", children: ["Power Tools", "Ladders", "Gardening", "Cleaning Equipment"] },
  { name: "Outdoor & Camping", icon: "tent", children: ["Tents", "Backpacks", "Sleeping Bags", "Trekking Gear"] },
  { name: "Party & Events", icon: "party-popper", children: ["Sound Systems", "Decor", "Costumes", "Tableware"] },
  { name: "Sports & Fitness", icon: "dumbbell", children: ["Gym Equipment", "Cricket", "Badminton", "Water Sports"] },
  { name: "Baby & Kids", icon: "baby", children: ["Strollers", "Car Seats", "Toys"] },
  { name: "Books & Music", icon: "guitar", children: ["Musical Instruments", "Textbooks"] },
  { name: "Fashion", icon: "shirt", children: ["Ethnic Wear", "Jewellery", "Bags"] },
];

// title, category, subcategory, daily ₹, deposit ₹, hourly ₹?
const ITEMS: [string, string, string, number, number, number?][] = [
  ["Sony A7 III Mirrorless Camera with 28-70mm Lens", "Cameras & Photography", "DSLR & Mirrorless", 1800, 25000],
  ["Canon EOS 90D DSLR Body", "Cameras & Photography", "DSLR & Mirrorless", 1200, 20000],
  ["DJI Mini 3 Pro Drone with Extra Batteries", "Cameras & Photography", "Drones", 2200, 30000],
  ["GoPro HERO 11 Black Action Camera", "Cameras & Photography", "Action Cameras", 700, 10000, 150],
  ["Sigma 24-70mm f/2.8 Art Lens (Sony E)", "Cameras & Photography", "Lenses", 900, 15000],
  ["Godox SL-60W LED Video Light Kit", "Cameras & Photography", "Lighting & Tripods", 500, 5000],
  ["MacBook Pro 14\" M3 Pro, 18GB RAM", "Electronics", "Laptops", 2500, 50000],
  ["PlayStation 5 with 2 Controllers & 5 Games", "Electronics", "Gaming Consoles", 900, 15000, 200],
  ["Epson Full HD Projector with 100\" Screen", "Electronics", "Projectors", 1100, 12000, 250],
  ["JBL PartyBox 310 Bluetooth Speaker", "Electronics", "Speakers & Audio", 800, 10000, 200],
  ["iPad Air 5th Gen with Apple Pencil", "Electronics", "Tablets", 700, 15000],
  ["3-Seater Fabric Sofa (Grey)", "Furniture", "Sofas", 250, 3000],
  ["Queen Size Bed with Orthopaedic Mattress", "Furniture", "Beds", 300, 4000],
  ["Ergonomic Office Chair (Mesh, Lumbar Support)", "Furniture", "Office Furniture", 120, 2000],
  ["6-Seater Dining Table Set", "Furniture", "Tables & Chairs", 350, 5000],
  ["Samsung 253L Double Door Refrigerator", "Home Appliances", "Refrigerators", 200, 4000],
  ["LG 7kg Front Load Washing Machine", "Home Appliances", "Washing Machines", 180, 4000],
  ["Voltas 1.5 Ton Split AC (Installation Included)", "Home Appliances", "Air Conditioners", 400, 8000],
  ["Philips Air Fryer XL", "Home Appliances", "Kitchen Appliances", 150, 2000],
  ["Trek FX 2 Hybrid Bicycle", "Vehicles", "Bicycles", 350, 5000, 80],
  ["Honda Activa 6G Scooter (with 2 helmets)", "Vehicles", "Scooters", 600, 5000],
  ["Royal Enfield Classic 350", "Vehicles", "Motorbikes", 1400, 10000],
  ["Ather 450X Electric Scooter", "Vehicles", "Electric Scooters", 800, 8000],
  ["Bosch Professional Drill Machine Kit", "Tools & DIY", "Power Tools", 250, 2500, 60],
  ["Aluminium 8ft Folding Ladder", "Tools & DIY", "Ladders", 120, 1500],
  ["Karcher Pressure Washer K3", "Tools & DIY", "Cleaning Equipment", 400, 5000],
  ["Quechua 4-Person Camping Tent", "Outdoor & Camping", "Tents", 350, 3000],
  ["Osprey 65L Trekking Backpack", "Outdoor & Camping", "Backpacks", 250, 3000],
  ["Sleeping Bag (-5°C rated)", "Outdoor & Camping", "Sleeping Bags", 150, 1500],
  ["DJ Sound System with Mixer & 2 Speakers", "Party & Events", "Sound Systems", 3000, 20000],
  ["Fairy Lights & Backdrop Decor Set", "Party & Events", "Decor", 800, 2000],
  ["Treadmill (Foldable, 2.5HP)", "Sports & Fitness", "Gym Equipment", 300, 6000],
  ["Kashmir Willow Cricket Kit (Full)", "Sports & Fitness", "Cricket", 200, 2000],
  ["Stand-up Paddle Board (Inflatable)", "Sports & Fitness", "Water Sports", 900, 8000],
  ["Baby Stroller (Travel System)", "Baby & Kids", "Strollers", 200, 3000],
  ["Yamaha F310 Acoustic Guitar", "Books & Music", "Musical Instruments", 150, 2500],
  ["Designer Lehenga (Bridal, Size M)", "Fashion", "Ethnic Wear", 2500, 15000],
  ["Sherwani with Safa (Size 40)", "Fashion", "Ethnic Wear", 1500, 8000],
];

const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

async function placeholderImage(title: string, i: number) {
  const color = PALETTE[i % PALETTE.length];
  const words = title.split(" ").slice(0, 4).join(" ").replace(/[&<>"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <circle cx="950" cy="200" r="220" fill="#ffffff" opacity="0.08"/><circle cx="200" cy="760" r="300" fill="#ffffff" opacity="0.06"/>
    <text x="80" y="470" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff">${words}</text>
    <text x="80" y="540" font-family="Arial, sans-serif" font-size="32" fill="#e5e7eb">Available for rent on RentNest</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer();
  const key = `seed/${slugify(title)}-${i}`;
  const [url, mediumUrl, thumbUrl] = await Promise.all([
    storage.put(`${key}.webp`, buf, "image/webp"),
    storage.put(`${key}_md.webp`, await sharp(buf).resize(800).webp({ quality: 70 }).toBuffer(), "image/webp"),
    storage.put(`${key}_th.webp`, await sharp(buf).resize(400, 300).webp({ quality: 65 }).toBuffer(), "image/webp"),
  ]);
  return { key, url, mediumUrl, thumbUrl, width: 1200, height: 900 };
}

const rnd = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

async function wipe() {
  // Order matters (FKs). Settings and categories are preserved/upserted.
  const tables = [
    "LedgerEntry", "Refund", "Invoice", "Payout", "Payment", "DisputeEvidence", "Dispute", "Review", "Checklist", "BookingEvent",
    "Message", "Conversation", "Booking", "AvailabilityBlock", "WishlistItem", "RecentlyViewed", "Promotion", "Flag", "Report",
    "ListingImage", "Listing", "Address", "Locality", "City", "SearchLog", "Notification", "PushSubscription", "KycDocument",
    "PayoutAccount", "Subscription", "RefreshToken", "UserBlock", "AuditLog", "WebhookEvent", "InvoiceSequence", "User",
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

async function main() {
  console.log("🌱 Seeding…");
  await wipe();

  // Categories
  const catIds: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: slugify(c.name) },
      create: { name: c.name, slug: slugify(c.name), icon: c.icon, sortOrder: i },
      update: { icon: c.icon, sortOrder: i, isActive: true },
    });
    catIds[c.name] = parent.id;
    for (const [j, child] of c.children.entries()) {
      const sub = await prisma.category.upsert({
        where: { slug: slugify(child) },
        create: { name: child, slug: slugify(child), parentId: parent.id, sortOrder: j },
        update: { parentId: parent.id, sortOrder: j, isActive: true },
      });
      catIds[child] = sub.id;
    }
  }

  // Users
  const passwordHash = await bcrypt.hash("Password@123", 10);
  const now = new Date();
  const mkUser = (data: Partial<Prisma.UserCreateInput> & { name: string }) =>
    prisma.user.create({ data: { passwordHash, phoneVerifiedAt: now, emailVerifiedAt: now, consentAt: now, ...data } });

  const admin = await mkUser({ name: "Asha Admin", email: "admin@rentnest.in", phone: "+919000000001", role: "ADMIN", kycStatus: "VERIFIED" });
  await mkUser({ name: "Sam Support", email: "support@rentnest.in", phone: "+919000000002", role: "SUPPORT", kycStatus: "VERIFIED" });
  const owner = await mkUser({ name: "Rohan Mehta", email: "owner@rentnest.in", phone: "+919000000003", kycStatus: "VERIFIED", bio: "Photographer & gadget lover. I keep my gear in top condition." });
  const renter = await mkUser({ name: "Priya Sharma", email: "renter@rentnest.in", phone: "+919000000004", kycStatus: "VERIFIED", bio: "Weekend traveller." });
  const owners = [owner];
  const names = ["Arjun Nair", "Sneha Reddy", "Vikram Singh", "Ananya Iyer", "Kabir Khan", "Meera Joshi", "Aditya Rao", "Isha Gupta", "Farhan Ali", "Neha Patil", "Karan Malhotra", "Divya Menon"];
  for (const [i, n] of names.entries()) {
    owners.push(await mkUser({ name: n, email: `${slugify(n).replace(/-/g, ".")}@example.com`, phone: `+9190000001${String(i).padStart(2, "0")}`, kycStatus: i % 3 === 0 ? "NONE" : "VERIFIED" }));
  }
  const renters = [renter];
  for (let i = 0; i < 8; i++) {
    renters.push(await mkUser({ name: `Renter ${i + 1}`, email: `renter${i + 1}@example.com`, phone: `+9190000002${String(i).padStart(2, "0")}` }));
  }
  await prisma.subscription.create({ data: { userId: owner.id, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 25 * DAY) } });
  for (const o of owners.filter((o) => o.kycStatus === "VERIFIED")) {
    await prisma.payoutAccount.create({ data: { userId: o.id, method: "UPI", accountHolderName: o.name, upiId: `${slugify(o.name).replace(/-/g, "")}@okicici`, status: "VERIFIED" } });
  }

  // Cities, localities, listings
  const random = rnd(42);
  const listings: { id: string; ownerId: string; priceDaily: number | null; priceHourly: number | null; priceWeekly: number | null; priceMonthly: number | null; securityDeposit: number; cancellationPolicy: "FLEXIBLE" | "MODERATE" | "STRICT"; title: string }[] = [];
  let imgIdx = 0;
  for (const [ci, c] of GAZETTEER.entries()) {
    const city = await prisma.city.create({ data: { name: c.name, slug: slugify(c.name), state: c.state, lat: c.lat, lng: c.lng } });
    const localities = [];
    for (const l of c.localities) {
      localities.push(await prisma.locality.create({ data: { cityId: city.id, name: l.name, slug: slugify(l.name), lat: l.lat, lng: l.lng, pincode: l.pincode } }));
    }
    const perCity = ci < 3 ? 12 : 6;
    for (let k = 0; k < perCity; k++) {
      const item = ITEMS[(ci * 7 + k * 3) % ITEMS.length];
      const [title, cat, sub, daily, deposit, hourly] = item;
      const locIdx = k % c.localities.length;
      const loc = c.localities[locIdx];
      const lat = +(loc.lat + (random() - 0.5) * 0.02).toFixed(6);
      const lng = +(loc.lng + (random() - 0.5) * 0.02).toFixed(6);
      const o = owners[(ci * 3 + k) % owners.length];
      const address = await prisma.address.create({ data: { userId: o.id, line1: `${10 + k} ${["MG Road", "Station Road", "Main Street", "Park Avenue"][k % 4]}`, locality: loc.name, city: c.name, state: c.state, pincode: loc.pincode, lat, lng } });
      const policies = ["FLEXIBLE", "MODERATE", "STRICT"] as const;
      const listing = await prisma.listing.create({
        data: {
          ownerId: o.id,
          title,
          slug: slugify(title),
          description: `${title} available for rent in ${loc.name}, ${c.name}. Well maintained and cleaned after every rental. All accessories included as shown in photos. Ideal for trips, events, shoots or trying before you buy. Please handle with care and return on time.`,
          categoryId: catIds[cat],
          subcategoryId: catIds[sub],
          condition: (["LIKE_NEW", "GOOD", "NEW", "GOOD"] as const)[k % 4],
          priceDaily: daily * 100,
          priceHourly: hourly ? hourly * 100 : null,
          priceWeekly: Math.round(daily * 5.5) * 100,
          priceMonthly: Math.round(daily * 18) * 100,
          securityDeposit: deposit * 100,
          minRentalHours: hourly ? 2 : 24,
          maxRentalHours: 24 * 60,
          instantBooking: o.kycStatus === "VERIFIED" && k % 3 === 0,
          pickupAvailable: true,
          deliveryAvailable: k % 2 === 0,
          deliveryFee: k % 2 === 0 ? 14900 : null,
          deliveryRadiusKm: k % 2 === 0 ? 10 : null,
          rules: "Valid government ID required at pickup. No smoking. Return clean. Late returns charged per day.",
          cancellationPolicy: policies[k % 3],
          addressId: address.id,
          lat,
          lng,
          approxLat: lat,
          approxLng: lng,
          cityId: city.id,
          localityId: localities[locIdx].id,
          pincode: loc.pincode,
          status: "ACTIVE",
          isVerified: k % 4 === 0,
          featuredUntil: k === 1 ? new Date(Date.now() + 10 * DAY) : null,
          viewCount: Math.floor(random() * 400),
          publishedAt: new Date(Date.now() - Math.floor(random() * 60) * DAY),
        },
      });
      const approx = fuzzCoordinate(lat, lng, listing.id);
      await prisma.listing.update({ where: { id: listing.id }, data: { approxLat: approx.lat, approxLng: approx.lng } });
      const imgs = await Promise.all([0, 1, 2].map((n) => placeholderImage(title, imgIdx + n)));
      imgIdx += 3;
      await prisma.listingImage.createMany({ data: imgs.map((im, n) => ({ ...im, listingId: listing.id, uploaderId: o.id, sortOrder: n })) });
      listings.push({ id: listing.id, ownerId: o.id, priceDaily: listing.priceDaily, priceHourly: listing.priceHourly, priceWeekly: listing.priceWeekly, priceMonthly: listing.priceMonthly, securityDeposit: listing.securityDeposit, cancellationPolicy: listing.cancellationPolicy, title });
    }
    await prisma.city.update({ where: { id: city.id }, data: { listingCount: perCity } });
    for (const l of localities) {
      await prisma.locality.update({ where: { id: l.id }, data: { listingCount: await prisma.listing.count({ where: { localityId: l.id } }) } });
    }
  }

  // Bookings in various states
  const fees = DEFAULT_SETTINGS.fees;
  let seq = 0;
  async function mkBooking(listingIdx: number, renterUser: { id: string }, startOffsetDays: number, days: number, status: Prisma.BookingCreateInput["status"], extra: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
    const l = listings[listingIdx % listings.length];
    if (l.ownerId === renterUser.id) return null;
    const startAt = new Date(Math.floor((Date.now() + startOffsetDays * DAY) / HOUR) * HOUR);
    const endAt = new Date(startAt.getTime() + days * DAY);
    const b = calculateBreakdown(l, startAt, endAt, fees, { protectionPlan: seq % 3 === 0 });
    seq++;
    const booking = await prisma.booking.create({
      data: {
        code: bookingCode(),
        listingId: l.id,
        renterId: renterUser.id,
        ownerId: l.ownerId,
        startAt,
        endAt,
        status,
        cancellationPolicy: l.cancellationPolicy,
        pricingUnit: b.rent.unit,
        pricingUnits: b.rent.units,
        rentAmount: b.rentAmount,
        serviceFee: b.serviceFee,
        protectionFee: b.protectionFee,
        protectionPlan: b.protectionFee > 0,
        taxAmount: b.taxAmount,
        depositAmount: b.depositAmount,
        totalAmount: b.totalAmount,
        ownerCommission: b.ownerCommission,
        ownerCommissionTax: b.ownerCommissionTax,
        ownerPayoutAmount: b.ownerPayoutAmount,
        platformRevenue: b.platformRevenue,
        priceBreakdown: b as unknown as object,
        agreementVersion: DEFAULT_SETTINGS.legal.rentalAgreementVersion,
        agreementAcceptedAt: new Date(startAt.getTime() - 3 * DAY),
        createdAt: new Date(Math.min(Date.now(), startAt.getTime() - 3 * DAY)),
        expiresAt: status === "REQUESTED" ? new Date(Date.now() + 20 * HOUR) : status === "ACCEPTED" ? new Date(Date.now() + 10 * HOUR) : null,
        ...extra,
      },
    });
    await prisma.conversation.upsert({
      where: { listingId_renterId: { listingId: l.id, renterId: renterUser.id } },
      create: { listingId: l.id, renterId: renterUser.id, ownerId: l.ownerId, messages: { create: [{ senderId: renterUser.id, body: "Hi! Is this available for my dates?" }, { senderId: l.ownerId, body: "Yes, it is. Happy to help!" }] } },
      update: {},
    });
    const paid = ["CONFIRMED", "ACTIVE", "RETURNED", "COMPLETED", "OVERDUE", "DISPUTED"].includes(status as string);
    if (paid) {
      const payment = await prisma.payment.create({
        data: {
          userId: renterUser.id, bookingId: booking.id, purpose: "BOOKING", provider: "mock", providerOrderId: `order_seed_${booking.id}`, providerPaymentId: `pay_seed_${booking.id}`,
          amount: b.totalAmount, status: status === "COMPLETED" ? "PARTIALLY_REFUNDED" : "CAPTURED", idempotencyKey: `seed:${booking.id}`, method: "upi",
          capturedAt: booking.createdAt, refundedAmount: status === "COMPLETED" ? b.depositAmount : 0,
        },
      });
      await prisma.ledgerEntry.createMany({
        data: [
          { account: "RENTER_PAYMENT", amount: b.totalAmount, description: "BOOKING payment captured", bookingId: booking.id, paymentId: payment.id },
          { account: "PLATFORM_REVENUE", amount: b.platformRevenue, description: "Platform fees", bookingId: booking.id, paymentId: payment.id },
        ],
      });
      await prisma.payout.create({
        data: { ownerId: l.ownerId, bookingId: booking.id, amount: b.ownerPayoutAmount, status: status === "COMPLETED" ? "PAID" : "PENDING", paidAt: status === "COMPLETED" ? endAt : null },
      });
      if (status === "COMPLETED") {
        await prisma.refund.create({ data: { paymentId: payment.id, amount: b.depositAmount, reason: "Security deposit release", status: "PROCESSED", idempotencyKey: `seed:refund:${booking.id}`, providerRefundId: `rfnd_seed_${booking.id}` } });
      }
    }
    return booking;
  }

  // Completed history with reviews
  const comments = ["Great condition, smooth handover!", "Owner was super helpful.", "Exactly as described.", "Would rent again.", "Good value for money.", "Punctual and friendly."];
  for (let i = 0; i < 30; i++) {
    const r = renters[i % renters.length];
    const b = await mkBooking(i * 5, r, -40 + i, 2 + (i % 3), "COMPLETED", { confirmedAt: new Date(Date.now() - (45 - i) * DAY), completedAt: new Date(Date.now() - (37 - i) * DAY), handedOverAt: new Date(Date.now() - (40 - i) * DAY), returnedAt: new Date(Date.now() - (38 - i) * DAY), depositReleasedAt: new Date() });
    if (!b) continue;
    const rating = 4 + (i % 2);
    await prisma.review.create({ data: { bookingId: b.id, listingId: b.listingId, authorId: r.id, subjectId: b.ownerId, role: "RENTER_TO_OWNER", rating, comment: comments[i % comments.length], createdAt: b.completedAt! } });
    await prisma.review.create({ data: { bookingId: b.id, authorId: b.ownerId, subjectId: r.id, role: "OWNER_TO_RENTER", rating: 5, comment: "Careful renter, returned on time.", createdAt: b.completedAt! } });
  }
  // Recompute rating aggregates
  for (const l of listings) {
    const agg = await prisma.review.aggregate({ where: { listingId: l.id }, _avg: { rating: true }, _count: true });
    const bookingCount = await prisma.booking.count({ where: { listingId: l.id, status: "COMPLETED" } });
    await prisma.listing.update({ where: { id: l.id }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count, bookingCount } });
  }
  for (const u of [...owners, ...renters]) {
    const o = await prisma.review.aggregate({ where: { subjectId: u.id, role: "RENTER_TO_OWNER" }, _avg: { rating: true }, _count: true });
    const r = await prisma.review.aggregate({ where: { subjectId: u.id, role: "OWNER_TO_RENTER" }, _avg: { rating: true }, _count: true });
    await prisma.user.update({ where: { id: u.id }, data: { ownerRatingAvg: o._avg.rating ?? 0, ownerRatingCount: o._count, renterRatingAvg: r._avg.rating ?? 0, renterRatingCount: r._count } });
  }

  // Demo scenarios for the main owner & renter accounts
  const ownerListingIdx = listings.findIndex((l) => l.ownerId === owner.id);
  const otherIdx = listings.findIndex((l) => l.ownerId !== owner.id && l.ownerId !== renter.id);
  await mkBooking(ownerListingIdx, renter, 5, 2, "REQUESTED", { message: "Hi Rohan, I'd love to rent this for a wedding shoot." });
  await mkBooking(ownerListingIdx, renters[1], 12, 3, "CONFIRMED", { confirmedAt: new Date() });
  await mkBooking(ownerListingIdx + 1, renters[2], -1, 3, "ACTIVE", { confirmedAt: new Date(Date.now() - 3 * DAY), handedOverAt: new Date(Date.now() - DAY) });
  await mkBooking(otherIdx, renter, 3, 2, "ACCEPTED", { acceptedAt: new Date() });
  await mkBooking(otherIdx + 2, renter, 20, 4, "CONFIRMED", { confirmedAt: new Date() });

  // Search logs for demand heatmap
  const cities = await prisma.city.findMany();
  const logs: Prisma.SearchLogCreateManyInput[] = [];
  for (let i = 0; i < 600; i++) {
    const c = cities[i % cities.length];
    logs.push({ cityId: c.id, lat: c.lat + (random() - 0.5) * 0.15, lng: c.lng + (random() - 0.5) * 0.15, resultCount: Math.floor(random() * 20), createdAt: new Date(Date.now() - Math.floor(random() * 30) * DAY) });
  }
  await prisma.searchLog.createMany({ data: logs });

  // A couple of trust & safety items for the admin queues
  await prisma.flag.create({ data: { type: "OFF_PLATFORM_ATTEMPT", userId: renters[3].id, severity: 2, details: { attempts: 3, lastHits: ["phone"] } } });
  await prisma.report.create({ data: { reporterId: renter.id, targetType: "LISTING", targetId: listings[7].id, reason: "FAKE_LISTING", details: "Photos look like stock images." } });
  // Sample KYC document (a generated image) so the admin viewer has a real file
  const kycImg = await sharp({ create: { width: 900, height: 560, channels: 3, background: { r: 241, g: 245, b: 249 } } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560"><rect x="20" y="20" width="860" height="520" rx="24" fill="#fff" stroke="#4f46e5" stroke-width="4"/><text x="60" y="110" font-family="Arial" font-size="40" font-weight="700" fill="#111">SAMPLE ID DOCUMENT</text><text x="60" y="180" font-family="Arial" font-size="28" fill="#374151">Name: ${owners[1].name}</text><text x="60" y="230" font-family="Arial" font-size="28" fill="#374151">PAN: XXXXXX234F</text><text x="60" y="480" font-family="Arial" font-size="22" fill="#9ca3af">Demo data — not a real document</text></svg>`) }])
    .png()
    .toBuffer();
  await storage.put("kyc/sample.png", kycImg, "image/png", true);
  await prisma.kycDocument.create({ data: { userId: owners[1].id, docType: "PAN", docNumberMasked: "XXXXXX234F", fileKey: "kyc/sample.png" } });
  await prisma.user.update({ where: { id: owners[1].id }, data: { kycStatus: "PENDING" } });
  await prisma.auditLog.create({ data: { actorId: admin.id, action: "seed", entityType: "System", entityId: "seed" } });

  const counts = await Promise.all([prisma.user.count(), prisma.listing.count(), prisma.booking.count(), prisma.city.count()]);
  console.log(`✅ Seeded ${counts[0]} users, ${counts[1]} listings, ${counts[2]} bookings across ${counts[3]} cities`);
  console.log("   Logins (password Password@123): admin@rentnest.in, support@rentnest.in, owner@rentnest.in, renter@rentnest.in");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
