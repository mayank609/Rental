/** Listing response shapes. Exact coordinates/address are owner-only. */
import type { Listing, ListingImage, Category, City, Locality, User, Subscription, Address } from "@prisma/client";
import { publicUser } from "../users/users.serializers";

export type ListingWithRelations = Listing & {
  images?: ListingImage[];
  category?: Category;
  subcategory?: Category | null;
  city?: City;
  locality?: Locality | null;
  owner?: User & { subscription?: Subscription | null };
  address?: Address | null;
};

export const isFeatured = (l: Pick<Listing, "featuredUntil">) => Boolean(l.featuredUntil && l.featuredUntil > new Date());

export function publicListing(l: ListingWithRelations) {
  return {
    id: l.id,
    slug: l.slug,
    title: l.title,
    description: l.description,
    status: l.status,
    condition: l.condition,
    category: l.category ? { id: l.category.id, name: l.category.name, slug: l.category.slug } : undefined,
    subcategory: l.subcategory ? { id: l.subcategory.id, name: l.subcategory.name, slug: l.subcategory.slug } : null,
    pricing: {
      hourly: l.priceHourly,
      daily: l.priceDaily,
      weekly: l.priceWeekly,
      monthly: l.priceMonthly,
      securityDeposit: l.securityDeposit,
    },
    minRentalHours: l.minRentalHours,
    maxRentalHours: l.maxRentalHours,
    instantBooking: l.instantBooking,
    pickupAvailable: l.pickupAvailable,
    deliveryAvailable: l.deliveryAvailable,
    deliveryFee: l.deliveryFee,
    deliveryRadiusKm: l.deliveryRadiusKm,
    rules: l.rules,
    cancellationPolicy: l.cancellationPolicy,
    location: {
      lat: l.approxLat,
      lng: l.approxLng,
      approximate: true,
      city: l.city ? { name: l.city.name, slug: l.city.slug, state: l.city.state } : undefined,
      locality: l.locality ? { name: l.locality.name, slug: l.locality.slug } : null,
    },
    images: (l.images ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({ id: i.id, url: i.url, mediumUrl: i.mediumUrl, thumbUrl: i.thumbUrl, width: i.width, height: i.height })),
    owner: l.owner ? publicUser(l.owner) : undefined,
    rating: { avg: l.ratingAvg, count: l.ratingCount },
    bookingCount: l.bookingCount,
    isFeatured: isFeatured(l),
    isVerified: l.isVerified,
    publishedAt: l.publishedAt,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

export function ownerListing(l: ListingWithRelations) {
  return {
    ...publicListing(l),
    rejectionReason: l.rejectionReason,
    viewCount: l.viewCount,
    featuredUntil: l.featuredUntil,
    version: l.version,
    exactLocation: { lat: l.lat, lng: l.lng, pincode: l.pincode },
    address: l.address,
  };
}
