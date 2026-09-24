/**
 * Response shapes for dashboard-only endpoints (the shared ones live in
 * lib/types.ts). Money is always integer paise; dates are ISO UTC strings.
 */
import type { BookingStatus, ChecklistPhoto, Checklist, Condition, PageMeta } from "@/lib/types";

export interface EarningsSummary {
  paid: number;
  upcoming: number;
  pending: number;
  onHold: number;
  failed: number;
  currency: string;
}

export interface DashboardSummary {
  listings: { total: number; active: number };
  rentals: { active: number; upcoming: number; completed: number };
  ownerBookings: { active: number; upcoming: number; completed: number; pendingRequests: number };
  earnings: EarningsSummary;
  unreadNotifications: number;
  upcoming: {
    id: string;
    code: string;
    status: BookingStatus;
    startAt: string;
    endAt: string;
    role: "OWNER" | "RENTER";
    listing: { id: string; title: string; image: string | null };
  }[];
}

export type PayoutStatus = "PENDING" | "ON_HOLD" | "SCHEDULED" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED";

export interface PayoutRow {
  id: string;
  amount: number;
  status: PayoutStatus;
  scheduledFor: string | null;
  paidAt: string | null;
  failureReason: string | null;
  note: string | null;
  createdAt: string;
  booking: { id: string; code: string; listing: { title: string } } | null;
}

export interface PayoutAccount {
  method: "BANK" | "UPI";
  accountHolderName: string;
  accountNumberLast4: string | null;
  ifsc: string | null;
  upiId: string | null;
  panLast4: string | null;
  status: "PENDING" | "VERIFIED" | "FAILED" | string;
  updatedAt: string;
}

export interface InvoiceRow {
  id: string;
  number: string;
  type: string;
  amount: number;
  taxAmount?: number;
  bookingId?: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  listing: { id: string; title: string; image: string | null } | null;
  counterparty: { id: string; name: string; avatarUrl: string | null };
  viewerRole: "RENTER" | "OWNER";
  lastMessage: { id: string; body: string; senderId: string; createdAt: string; wasMasked: boolean } | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface ConversationDetail {
  conversation: {
    id: string;
    listingId: string | null;
    renterId: string;
    ownerId: string;
    listing: { id: string; title: string; images: { thumbUrl: string }[] } | null;
    renter: { id: string; name: string; avatarUrl: string | null };
    owner: { id: string; name: string; avatarUrl: string | null };
    viewerRole: "RENTER" | "OWNER";
    contactSharingAllowed: boolean;
  };
  bookings: { id: string; code: string; status: BookingStatus; startAt: string; endAt: string }[];
}

export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";
export type DisputeType = "DAMAGE" | "NOT_RETURNED" | "NOT_AS_DESCRIBED" | "NO_SHOW" | "LATE_RETURN" | "PAYMENT" | "OTHER";

export interface DisputeSummary {
  id: string;
  bookingId: string;
  raisedById: string;
  againstId: string;
  type: DisputeType;
  description: string;
  claimAmount: number;
  status: DisputeStatus;
  resolution: string | null;
  depositDeduction: number;
  refundAmount: number;
  resolvedAt: string | null;
  createdAt: string;
  booking: { id: string; code: string; listing: { title: string } };
}

export interface DisputeDetail extends Omit<DisputeSummary, "booking"> {
  evidence: { id: string; url: string | null; note: string | null; createdAt: string; uploadedById: string; uploadedBy: { id: string; name: string } }[];
  booking: {
    id: string;
    code: string;
    status: BookingStatus;
    renterId: string;
    ownerId: string;
    startAt: string;
    endAt: string;
    listing: { id: string; title: string };
    checklists: (Omit<Checklist, "photos"> & { photos: ChecklistPhoto[] })[];
  };
  raisedBy: { id: string; name: string };
  against: { id: string; name: string };
}

export interface KycInfo {
  status: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
  documents: { id: string; docType: string; docNumberMasked: string; status: string; rejectionReason: string | null; createdAt: string }[];
}

export interface SavedAddress {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  locality: string;
  city: string;
  state: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface FeaturedPlan {
  code: string;
  name: string;
  days: number;
  price: number;
}

export interface PlansResponse {
  featuredPlans: FeaturedPlan[];
  pro: { price: number; periodDays: number; maxListingsFree: number; maxListingsPro: number; commissionRate: number; standardCommissionRate: number };
  gstRate: number;
}

export interface SubscriptionResponse {
  subscription: { id: string; plan: string; status: "PENDING_PAYMENT" | "ACTIVE" | "CANCELLED" | "EXPIRED" | string; currentPeriodEnd: string | null } | null;
  active: boolean;
}

export interface AnalyticsResponse {
  days: number;
  daily: { date: string; bookings: number; earnings: number }[];
  perListing: {
    id: string;
    title: string;
    status: string;
    viewCount: number;
    bookingCount: number;
    ratingAvg: number;
    wishlists: number;
    requests: number;
    paidBookings: number;
    earnings: number;
    conversionRate: number;
  }[];
}

export interface CancellationPreview {
  outcome: { refundPercent: number; refundAmount: number; ownerPayout: number; platformRetained: number; ownerPenalty: number };
  policy: string;
  tiers: { hoursBefore: number; refundPercent: number }[];
}

export interface Paged<T> {
  meta: PageMeta;
  items: T[];
}

export type { Condition };
