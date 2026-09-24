/**
 * Listing lifecycle: create / update / publish / soft-delete, owner calendar
 * blocks, moderation hooks and listing quotas (free vs Pro).
 */
import type { Prisma as P, Listing } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../../lib/errors";
import { fuzzCoordinate, slugify } from "../../lib/util";
import { geocode, reverseGeocode, GeoPlace } from "../../lib/geo";
import { invalidate } from "../../lib/cache";
import { audit } from "../../lib/audit";
import { getSettings } from "../settings/settings.service";
import { findProhibited, raiseFlag } from "../trust/trust.service";
import { upsertCityAndLocality, refreshCityCounts } from "../locations/locations.service";
import { isProActive } from "../users/users.serializers";
import { createListingSchema, updateListingSchema, addressInput } from "./listings.schemas";
import { ACTIVE_BOOKING_STATUSES, findConflicts } from "../bookings/availability";

type CreateInput = z.infer<typeof createListingSchema>;
type UpdateInput = z.infer<typeof updateListingSchema>;

/** Fields that cannot change while the listing has upcoming/active bookings. */
export const LOCKED_FIELDS_WITH_BOOKINGS = [
  "categoryId",
  "subcategoryId",
  "securityDeposit",
  "cancellationPolicy",
  "addressId",
  "address",
  "condition",
  "minRentalHours",
  "maxRentalHours",
] as const;

export const listingInclude = {
  images: true,
  category: true,
  subcategory: true,
  city: true,
  locality: true,
  owner: { include: { subscription: true } },
} satisfies P.ListingInclude;

async function resolveAddress(ownerId: string, input: { addressId?: string; address?: z.infer<typeof addressInput> }) {
  if (input.addressId) {
    const a = await prisma.address.findFirst({ where: { id: input.addressId, userId: ownerId } });
    if (!a) throw notFound("Address");
    const place: GeoPlace = { lat: a.lat, lng: a.lng, city: a.city, locality: a.locality, state: a.state ?? undefined, pincode: a.pincode ?? undefined };
    return { address: a, place };
  }
  const addr = input.address!;
  let place: GeoPlace | null = null;
  if (addr.lat != null && addr.lng != null) {
    // Owner dropped a pin — trust coordinates, derive city/locality from them
    const rev = await reverseGeocode(addr.lat, addr.lng);
    place = { lat: addr.lat, lng: addr.lng, city: rev?.city ?? addr.city, locality: addr.locality || rev?.locality, state: addr.state ?? rev?.state, pincode: addr.pincode ?? rev?.pincode };
  } else {
    const q = [addr.line1, addr.line2, addr.locality, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
    place = (await geocode(q)) ?? (await geocode([addr.locality, addr.city, addr.pincode].filter(Boolean).join(", ")));
    if (place) place = { ...place, locality: addr.locality || place.locality, pincode: addr.pincode ?? place.pincode };
  }
  if (!place || !place.city) {
    throw unprocessable("We couldn't locate this address. Check it or drop a pin on the map.", "INVALID_ADDRESS");
  }
  const address = await prisma.address.create({
    data: {
      userId: ownerId,
      line1: addr.line1,
      line2: addr.line2,
      locality: place.locality ?? addr.locality ?? place.city,
      city: place.city,
      state: place.state,
      pincode: place.pincode,
      lat: place.lat,
      lng: place.lng,
    },
  });
  return { address, place };
}

async function assertCategory(categoryId: string, subcategoryId?: string | null) {
  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat || !cat.isActive) throw badRequest("Invalid category");
  if (subcategoryId) {
    const sub = await prisma.category.findUnique({ where: { id: subcategoryId } });
    if (!sub || sub.parentId !== categoryId) throw badRequest("Invalid subcategory");
  }
}

async function assertNotProhibited(ownerId: string, title?: string, description?: string, rules?: string | null) {
  const hit = await findProhibited(title, description, rules);
  if (hit) {
    await raiseFlag({ type: "PROHIBITED_ITEM_ATTEMPT", userId: ownerId, severity: 2, details: { keyword: hit, title } });
    throw unprocessable(`This item appears to be prohibited on our platform ("${hit}"). See our prohibited items policy.`, "PROHIBITED_ITEM", { keyword: hit });
  }
}

async function attachImages(listingId: string, ownerId: string, imageIds: string[]) {
  if (!imageIds.length) return;
  const imgs = await prisma.listingImage.findMany({ where: { id: { in: imageIds }, uploaderId: ownerId } });
  if (imgs.length !== imageIds.length) throw badRequest("Some images are invalid");
  await prisma.$transaction([
    // Detach removed images
    prisma.listingImage.updateMany({ where: { listingId, id: { notIn: imageIds } }, data: { listingId: null } }),
    ...imageIds.map((id, i) => prisma.listingImage.update({ where: { id }, data: { listingId, sortOrder: i } })),
  ]);
}

export async function assertListingQuota(ownerId: string) {
  const [{ pro }, sub, count] = await Promise.all([
    getSettings(),
    prisma.subscription.findUnique({ where: { userId: ownerId } }),
    prisma.listing.count({ where: { ownerId, deletedAt: null, status: { notIn: ["ARCHIVED", "REJECTED"] } } }),
  ]);
  const max = isProActive(sub) ? pro.maxListingsPro : pro.maxListingsFree;
  if (count >= max) {
    throw forbidden(`You've reached your limit of ${max} listings. Upgrade to Pro to list more.`, "LISTING_LIMIT");
  }
}

async function initialStatus(ownerId: string, publish: boolean) {
  if (!publish) return "DRAFT" as const;
  const { trust } = await getSettings();
  return trust.listingModeration ? ("PENDING_REVIEW" as const) : ("ACTIVE" as const);
}

export async function createListing(ownerId: string, input: CreateInput) {
  await assertListingQuota(ownerId);
  await assertCategory(input.categoryId, input.subcategoryId);
  await assertNotProhibited(ownerId, input.title, input.description, input.rules);
  if (input.publish && input.imageIds.length === 0) throw badRequest("Add at least one photo before publishing");

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
  if (input.instantBooking) await assertInstantBookingAllowed(owner.id);

  const { address, place } = await resolveAddress(ownerId, input);
  const { city, locality } = await upsertCityAndLocality(place);
  const status = await initialStatus(ownerId, input.publish);

  const listing = await prisma.listing.create({
    data: {
      ownerId,
      title: input.title,
      slug: slugify(input.title),
      description: input.description,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId ?? null,
      condition: input.condition,
      priceHourly: input.priceHourly ?? null,
      priceDaily: input.priceDaily ?? null,
      priceWeekly: input.priceWeekly ?? null,
      priceMonthly: input.priceMonthly ?? null,
      securityDeposit: input.securityDeposit,
      minRentalHours: input.minRentalHours,
      maxRentalHours: input.maxRentalHours ?? null,
      instantBooking: input.instantBooking,
      pickupAvailable: input.pickupAvailable,
      deliveryAvailable: input.deliveryAvailable,
      deliveryFee: input.deliveryFee ?? null,
      deliveryRadiusKm: input.deliveryRadiusKm ?? null,
      rules: input.rules ?? null,
      cancellationPolicy: input.cancellationPolicy,
      addressId: address.id,
      lat: place.lat,
      lng: place.lng,
      // Placeholder; replaced below once we know the id (stable fuzz seed)
      approxLat: place.lat,
      approxLng: place.lng,
      cityId: city.id,
      localityId: locality?.id,
      pincode: place.pincode,
      status,
      publishedAt: status === "ACTIVE" ? new Date() : null,
    },
  });
  const approx = fuzzCoordinate(place.lat, place.lng, listing.id);
  await prisma.listing.update({ where: { id: listing.id }, data: { approxLat: approx.lat, approxLng: approx.lng } });
  await attachImages(listing.id, ownerId, input.imageIds);
  await refreshCityCounts(city.id);
  await invalidate("listings");
  return prisma.listing.findUniqueOrThrow({ where: { id: listing.id }, include: { ...listingInclude, address: true } });
}

export async function assertInstantBookingAllowed(ownerId: string) {
  const [{ trust }, owner] = await Promise.all([getSettings(), prisma.user.findUniqueOrThrow({ where: { id: ownerId } })]);
  const verified = Boolean(owner.phoneVerifiedAt) && (!trust.instantBookingRequiresKyc || owner.kycStatus === "VERIFIED");
  if (!verified) throw forbidden("Instant booking is available to verified owners only. Complete ID verification first.", "VERIFICATION_REQUIRED");
}

export async function hasOpenBookings(listingId: string) {
  const n = await prisma.booking.count({
    where: { listingId, status: { in: ACTIVE_BOOKING_STATUSES }, endAt: { gt: new Date(Date.now() - 30 * 24 * 3600_000) } },
  });
  return n > 0;
}

export async function getOwnedListing(listingId: string, userId: string, allowStaff = false, role?: string) {
  const l = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } });
  if (!l) throw notFound("Listing");
  if (l.ownerId !== userId && !(allowStaff && (role === "ADMIN" || role === "SUPPORT"))) throw forbidden();
  return l;
}

export async function updateListing(listing: Listing, actorId: string, input: UpdateInput) {
  if (input.version != null && input.version !== listing.version) {
    throw conflict("This listing was modified elsewhere. Reload and try again.", "STALE_VERSION");
  }
  const lockedTouched = LOCKED_FIELDS_WITH_BOOKINGS.filter((f) => {
    const v = (input as Record<string, unknown>)[f];
    if (v === undefined) return false;
    if (f === "address") return true;
    return (listing as unknown as Record<string, unknown>)[f] !== v;
  });
  if (lockedTouched.length && (await hasOpenBookings(listing.id))) {
    throw conflict(
      `These fields can't be changed while the listing has active or upcoming bookings: ${lockedTouched.join(", ")}`,
      "FIELDS_LOCKED",
    );
  }
  if (input.categoryId) await assertCategory(input.categoryId, input.subcategoryId);
  if (input.title || input.description || input.rules) {
    await assertNotProhibited(listing.ownerId, input.title ?? listing.title, input.description ?? listing.description, input.rules ?? listing.rules);
  }
  if (input.instantBooking && !listing.instantBooking) await assertInstantBookingAllowed(listing.ownerId);

  const data: P.ListingUncheckedUpdateInput = {};
  const copy = [
    "title", "description", "categoryId", "subcategoryId", "condition", "priceHourly", "priceDaily", "priceWeekly", "priceMonthly",
    "securityDeposit", "minRentalHours", "maxRentalHours", "instantBooking", "pickupAvailable", "deliveryAvailable", "deliveryFee",
    "deliveryRadiusKm", "rules", "cancellationPolicy",
  ] as const;
  for (const k of copy) if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  if (input.title) data.slug = slugify(input.title);

  const merged = { ...listing, ...data } as Listing;
  if (!merged.priceDaily && !merged.priceHourly) throw badRequest("Set a daily or hourly price");

  let oldCityId: string | null = null;
  if (input.address || input.addressId) {
    const { address, place } = await resolveAddress(listing.ownerId, input);
    const { city, locality } = await upsertCityAndLocality(place);
    const approx = fuzzCoordinate(place.lat, place.lng, listing.id);
    Object.assign(data, {
      addressId: address.id, lat: place.lat, lng: place.lng, approxLat: approx.lat, approxLng: approx.lng,
      cityId: city.id, localityId: locality?.id ?? null, pincode: place.pincode,
    });
    if (city.id !== listing.cityId) oldCityId = listing.cityId;
  }

  // Material edits of a rejected listing go back to review
  const { trust } = await getSettings();
  if (listing.status === "REJECTED" && (input.title || input.description || input.imageIds)) {
    data.status = trust.listingModeration ? "PENDING_REVIEW" : "ACTIVE";
    data.rejectionReason = null;
  }

  data.version = { increment: 1 };
  const updated = await prisma.listing.update({ where: { id: listing.id }, data });
  if (input.imageIds) await attachImages(listing.id, listing.ownerId, input.imageIds);
  if (actorId !== listing.ownerId) {
    await audit({ actorId, action: "listing.update", entityType: "Listing", entityId: listing.id, before: listing, after: data });
  }
  await refreshCityCounts(updated.cityId);
  if (oldCityId) await refreshCityCounts(oldCityId);
  await invalidate("listings");
  return prisma.listing.findUniqueOrThrow({ where: { id: listing.id }, include: { ...listingInclude, address: true } });
}

export async function setListingStatus(listing: Listing, target: "ACTIVE" | "PAUSED" | "ARCHIVED") {
  if (target === "ACTIVE") {
    const imgCount = await prisma.listingImage.count({ where: { listingId: listing.id } });
    if (!imgCount) throw badRequest("Add at least one photo before publishing");
    if (listing.status === "REJECTED") throw badRequest("Edit the listing to address the rejection reason first");
    const { trust } = await getSettings();
    if (listing.status === "DRAFT" && trust.listingModeration) {
      await prisma.listing.update({ where: { id: listing.id }, data: { status: "PENDING_REVIEW" } });
      await invalidate("listings");
      return "PENDING_REVIEW";
    }
    if (listing.status === "PENDING_REVIEW") throw badRequest("Listing is awaiting review");
  }
  if (target === "ARCHIVED" && (await hasOpenBookings(listing.id))) {
    throw conflict("Resolve active bookings before archiving this listing", "HAS_ACTIVE_BOOKINGS");
  }
  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: target, publishedAt: target === "ACTIVE" ? listing.publishedAt ?? new Date() : listing.publishedAt },
  });
  await refreshCityCounts(listing.cityId);
  await invalidate("listings");
  return target;
}

export async function softDeleteListing(listing: Listing, actorId: string) {
  if (await hasOpenBookings(listing.id)) throw conflict("Resolve active bookings before deleting this listing", "HAS_ACTIVE_BOOKINGS");
  await prisma.listing.update({ where: { id: listing.id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  await audit({ actorId, action: "listing.delete", entityType: "Listing", entityId: listing.id });
  await refreshCityCounts(listing.cityId);
  await invalidate("listings");
}

export async function addBlock(listingId: string, startAt: Date, endAt: Date, reason?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${listingId} FOR UPDATE`;
    const { bookings } = await findConflicts(tx, listingId, startAt, endAt);
    if (bookings.length) throw conflict("These dates overlap an existing booking", "DATES_BOOKED");
    return tx.availabilityBlock.create({ data: { listingId, startAt, endAt, reason } });
  });
}
