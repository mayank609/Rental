/** Shape user records for API responses — never leak PII to other users. */
import type { User, Subscription } from "@prisma/client";

export function isProActive(sub?: Pick<Subscription, "status" | "currentPeriodEnd"> | null) {
  return Boolean(sub && sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date());
}

/** Public profile visible to everyone. */
export function publicUser(u: User & { subscription?: Subscription | null }) {
  return {
    id: u.id,
    name: u.status === "DELETED" ? "Deleted user" : u.name,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    joinedAt: u.createdAt,
    phoneVerified: Boolean(u.phoneVerifiedAt),
    idVerified: u.kycStatus === "VERIFIED",
    isVerified: Boolean(u.phoneVerifiedAt) && u.kycStatus === "VERIFIED",
    isPro: isProActive(u.subscription),
    ownerRating: { avg: u.ownerRatingAvg, count: u.ownerRatingCount },
    renterRating: { avg: u.renterRatingAvg, count: u.renterRatingCount },
  };
}

/** Full profile for the account owner. */
export function selfUser(u: User & { subscription?: Subscription | null }) {
  return {
    ...publicUser(u),
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    kycStatus: u.kycStatus,
    emailVerified: Boolean(u.emailVerifiedAt),
    hasPassword: Boolean(u.passwordHash),
    googleLinked: Boolean(u.googleId),
    preferredLocation: u.preferredCitySlug
      ? { citySlug: u.preferredCitySlug, locality: u.preferredLocality, lat: u.preferredLat, lng: u.preferredLng }
      : null,
    notificationPrefs: u.notificationPrefs,
    marketingOptIn: u.marketingOptIn,
    subscription: u.subscription ? { plan: u.subscription.plan, status: u.subscription.status, currentPeriodEnd: u.subscription.currentPeriodEnd } : null,
    createdAt: u.createdAt,
  };
}
