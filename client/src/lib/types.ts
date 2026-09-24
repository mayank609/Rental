/** API response types shared across the client. Money is always in paise. */
export type Role = "USER" | "SUPPORT" | "ADMIN";

export interface PublicUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: string;
  phoneVerified: boolean;
  idVerified: boolean;
  isVerified: boolean;
  isPro: boolean;
  ownerRating: { avg: number; count: number };
  renterRating: { avg: number; count: number };
}

export interface User extends PublicUser {
  email: string | null;
  phone: string | null;
  role: Role;
  status: string;
  kycStatus: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  preferredLocation: { citySlug: string; locality: string | null; lat: number | null; lng: number | null } | null;
  notificationPrefs: Partial<Record<"email" | "sms" | "whatsapp" | "push", boolean>>;
  marketingOptIn: boolean;
  subscription: { plan: string; status: string; currentPeriodEnd: string | null } | null;
  createdAt: string;
}

export interface ListingImage {
  id: string;
  url: string;
  mediumUrl: string;
  thumbUrl: string;
  width?: number | null;
  height?: number | null;
}

export type Condition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR";
export type CancellationPolicy = "FLEXIBLE" | "MODERATE" | "STRICT";
export type ListingStatus = "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "PAUSED" | "REJECTED" | "ARCHIVED";

export interface Listing {
  id: string;
  slug: string;
  title: string;
  description?: string;
  status: ListingStatus;
  condition: Condition;
  category?: { id: string; name: string; slug: string };
  subcategory?: { id: string; name: string; slug: string } | null;
  pricing: { hourly: number | null; daily: number | null; weekly: number | null; monthly: number | null; securityDeposit: number };
  minRentalHours: number;
  maxRentalHours: number | null;
  instantBooking: boolean;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  deliveryFee: number | null;
  deliveryRadiusKm: number | null;
  rules?: string | null;
  cancellationPolicy: CancellationPolicy;
  location: {
    lat: number;
    lng: number;
    approximate: true;
    city?: { name: string; slug: string; state: string | null };
    locality: { name: string; slug: string } | null;
  };
  images: ListingImage[];
  owner?: PublicUser;
  rating: { avg: number; count: number };
  bookingCount: number;
  isFeatured: boolean;
  isVerified: boolean;
  distanceKm?: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Owner-only
  rejectionReason?: string | null;
  viewCount?: number;
  featuredUntil?: string | null;
  version?: number;
  exactLocation?: { lat: number; lng: number; pincode: string | null };
  address?: { id: string; line1: string; line2?: string | null; locality: string; city: string; state?: string | null; pincode?: string | null; lat: number; lng: number } | null;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchResponse {
  listings: Listing[];
  meta: PageMeta;
  city: { id: string; name: string; slug: string; lat: number; lng: number } | null;
  origin: { lat: number; lng: number } | null;
  fallback: { reason: "NO_MATCHES_NEARBY" | "NO_LISTINGS_IN_AREA"; listings: Listing[] } | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  description?: string | null;
  children?: Category[];
}

export interface RenterBreakdown {
  rent: { unit: "hour" | "day"; units: number; amount: number; lines: { label: string; amount: number }[] };
  serviceFee: number;
  protectionFee: number;
  deliveryFee: number;
  taxAmount: number;
  depositAmount: number;
  totalAmount: number;
  payableExcludingDeposit: number;
  rates: { serviceFeeRate: number; gstRate: number };
  currency: string;
}

export interface Quote {
  available: boolean;
  hours: number;
  breakdown: RenterBreakdown;
  ownerBreakdown?: { rentAmount: number; commission: number; commissionTax: number; commissionRate: number; payout: number };
  protectionAvailable: boolean;
  protectionCoverageCap: number;
  instantBooking: boolean;
}

export type BookingStatus =
  | "REQUESTED" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED" | "CONFIRMED" | "ACTIVE" | "OVERDUE" | "RETURNED" | "COMPLETED" | "DISPUTED";

export type BookingAction = "accept" | "decline" | "pay" | "cancel" | "handover" | "return" | "inspect" | "review" | "dispute" | "invoice";

export interface BookingSummary {
  id: string;
  code: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  expiresAt: string | null;
  totalAmount: number;
  ownerPayoutAmount?: number;
  listing: { id: string; title: string; image: string | null };
  counterparty: { id: string; name: string; avatarUrl: string | null };
  viewerRole: "OWNER" | "RENTER";
  createdAt: string;
}

export interface ChecklistPhoto { url: string; takenAt?: string; lat?: number; lng?: number }
export interface Checklist {
  id: string;
  type: "HANDOVER" | "RETURN";
  role: "OWNER" | "RENTER";
  condition: Condition | null;
  notes: string | null;
  items: { label: string; ok: boolean }[];
  photos: ChecklistPhoto[];
  createdAt: string;
}

export interface BookingDetail {
  id: string;
  code: string;
  status: BookingStatus;
  viewerRole: "OWNER" | "RENTER" | "STAFF";
  startAt: string;
  endAt: string;
  expiresAt: string | null;
  fulfillment: "PICKUP" | "DELIVERY";
  deliveryAddress: Record<string, string> | null;
  instantBook: boolean;
  protectionPlan: boolean;
  cancellationPolicy: CancellationPolicy;
  message: string | null;
  listing: {
    id: string; title: string; slug: string; image: string | null; city: string; locality: string | null;
    approxLocation: { lat: number; lng: number };
    pickupAddress: { line1: string; line2?: string | null; locality: string; city: string; pincode?: string | null; lat: number; lng: number } | null;
    rules: string | null;
  };
  renter: PublicUser & { phone?: string | null; email?: string | null };
  owner: PublicUser & { phone?: string | null; email?: string | null };
  pricing: {
    unit: string; units: number; rentAmount: number; rentLines: { label: string; amount: number }[]; serviceFee: number; protectionFee: number;
    deliveryFee: number; taxAmount: number; depositAmount: number; totalAmount: number;
    ownerCommission?: number; ownerCommissionTax?: number; ownerPayoutAmount?: number; platformRevenue?: number;
  };
  lateDays: number;
  lateFeeAmount: number;
  depositDeduction: number;
  refundAmount: number;
  ownerPenaltyAmount?: number;
  agreement: { version: string; acceptedAt: string };
  timestamps: Record<string, string | null>;
  cancellationReason: string | null;
  declineReason: string | null;
  checklists: Checklist[];
  events: { id: string; type: string; fromStatus: BookingStatus | null; toStatus: BookingStatus | null; actor: { id: string; name: string } | null; data: unknown; createdAt: string }[];
  payments: { id: string; status: string; amount: number; refundedAmount: number; method: string | null; createdAt: string; refunds: { id: string; amount: number; status: string; reason: string; createdAt: string }[] }[];
  payouts?: { id: string; amount: number; status: string; scheduledFor: string | null; paidAt: string | null; note: string | null }[];
  reviews: { id: string; authorId: string; role: string; rating: number; comment: string | null; createdAt: string }[];
  disputes: { id: string; type: string; status: string; description: string; claimAmount: number; resolution: string | null; raisedById: string; createdAt: string }[];
  invoices: { id: string; number: string; type: string; amount: number; createdAt: string }[];
  conversationId: string | null;
  actions: BookingAction[];
}

export interface CheckoutPayload {
  paymentId: string;
  provider: "razorpay" | "mock";
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  prefill: { name?: string; email?: string; contact?: string };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { url?: string } & Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  wasMasked: boolean;
  attachments: string[];
  readAt: string | null;
  createdAt: string;
  sender?: { id: string; name: string; avatarUrl: string | null };
}

export interface PlatformConfig {
  platformName: string;
  currency: string;
  country: string;
  timezone: string;
  supportEmail: string;
  companyName: string;
  fees: {
    renterServiceFeeRate: number;
    ownerCommissionRate: number;
    proOwnerCommissionRate: number;
    gstRate: number;
    protectionPlan: { enabled: boolean; type: "PERCENT" | "FLAT"; value: number; minFee: number; coverageCap: number };
    lateFee: { multiplier: number; platformShare: number; graceHours: number };
  };
  cancellationPolicies: Record<CancellationPolicy, { hoursBefore: number; refundPercent: number }[]>;
  booking: { requestExpiryHours: number; inspectionWindowHours: number; minLeadTimeHours: number; maxAdvanceDays: number };
  kycRequiredAboveAmount: number;
  prohibitedKeywords: string[];
  googleClientId: string | null;
  paymentProvider: "razorpay" | "mock";
}
