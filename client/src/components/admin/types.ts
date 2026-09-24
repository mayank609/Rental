/**
 * Response types for the /admin API (mirrors server/src/modules/admin).
 * Money values are integers in paise; dates are ISO strings in UTC.
 */
import type { BookingDetail, BookingStatus, Checklist, Listing, PageMeta, User } from "@/lib/types";

export type { PageMeta };

// ------------------------------------------------------------------ dashboard
export interface DashboardResponse {
  period: { days: number; since: string };
  kpis: {
    gmv: number;
    gmvChange: number | null;
    revenue: number;
    revenueChange: number | null;
    bookings: number;
    bookingsChange: number | null;
    avgBookingValue: number;
    activeUsers: number;
    newUsers: number;
    totalUsers: number;
    activeListings: number;
  };
  queues: { pendingListings: number; openDisputes: number; openFlags: number; openReports: number; pendingKyc: number };
  revenueBreakdown: { bookingFees: number; promotionsAndSubscriptions: number; lateFees: number };
  daily: { date: string; gmv: number; revenue: number; bookings: number }[];
  bookingsPerCity: { city: string; slug: string; bookings: number; gmv: number }[];
  topCategories: { category: string; bookings: number; gmv: number }[];
  funnel: { stage: string; count: number }[];
}

export interface CityAnalyticsRow {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  supply: number;
  searches: number;
  zeroResultSearches: number;
  requests: number;
  gmv: number;
  /** null = demand with zero supply (infinitely undersupplied). */
  demandSupplyRatio: number | null;
}

export interface HeatPoint {
  lat: number;
  lng: number;
  weight: number;
}
export interface HeatmapResponse {
  city: { id: string; name: string; slug: string; lat: number; lng: number } | null;
  supply: HeatPoint[];
  demand: HeatPoint[];
}

// ---------------------------------------------------------------------- users
export type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED" | "DELETED";

export interface AdminUserRow extends User {
  counts: { listings: number; rentals: number; flags: number };
  cancellationCount: number;
  offPlatformAttempts: number;
  lastLoginAt: string | null;
}

export interface KycDocumentSummary {
  id: string;
  docType: string;
  docNumberMasked: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  rejectionReason: string | null;
  createdAt: string;
}

export interface FlagRow {
  id: string;
  userId: string | null;
  listingId: string | null;
  type: string;
  severity: number;
  details: Record<string, unknown>;
  status: "OPEN" | "ACTIONED" | "DISMISSED";
  createdAt: string;
  user?: { id: string; name: string; status: string } | null;
  listing?: { id: string; title: string } | null;
}

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
  actor?: { id: string; name: string } | null;
}

export interface AdminUserDetail {
  user: User & { statusReason: string | null; cancellationCount: number; offPlatformAttempts: number; lastLoginAt: string | null; deletedAt: string | null };
  payoutAccount: { method: string; status: string; last4: string | null; ifsc: string | null; upiId: string | null } | null;
  kycDocuments: KycDocumentSummary[];
  flags: FlagRow[];
  bookings: { id: string; code: string; status: BookingStatus; totalAmount: number; renterId: string; createdAt: string }[];
  listings: { id: string; title: string; status: string; createdAt: string; deletedAt: string | null }[];
  audits: AuditLogRow[];
}

// ------------------------------------------------------------------------ KYC
export interface KycQueueDoc extends KycDocumentSummary {
  userId: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  hasFile: boolean;
  user: { id: string; name: string; email: string | null; phone: string | null };
}

// ------------------------------------------------------------------- listings
export interface AdminListing extends Listing {
  openFlags: number;
}

// ------------------------------------------------------------------- bookings
export interface AdminBookingRow {
  id: string;
  code: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  totalAmount: number;
  rentAmount: number;
  platformRevenue: number;
  createdAt: string;
  listing: { id: string; title: string; city: { name: string } };
  renter: { id: string; name: string };
  owner: { id: string; name: string };
}

export type AdminBookingDetail = BookingDetail & {
  disputes: (BookingDetail["disputes"][number] & { evidence?: EvidenceRow[] })[];
};

export interface CancelOutcome {
  refundPercent: number;
  refundAmount: number;
  ownerPayout: number;
  platformRetained: number;
  ownerPenalty: number;
}

// ------------------------------------------------------------------- disputes
export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";

export interface AdminDisputeRow {
  id: string;
  bookingId: string;
  type: string;
  status: DisputeStatus;
  description: string;
  claimAmount: number;
  resolution: string | null;
  depositDeduction: number;
  refundAmount: number;
  createdAt: string;
  resolvedAt: string | null;
  booking: { id: string; code: string; depositAmount: number; rentAmount: number; listing: { title: string } };
  raisedBy: { id: string; name: string };
  against: { id: string; name: string };
  _count: { evidence: number };
}

export interface EvidenceRow {
  id: string;
  disputeId: string;
  uploadedById: string;
  url: string | null;
  note: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string };
}

export interface DisputeDetail {
  id: string;
  bookingId: string;
  raisedById: string;
  againstId: string;
  type: string;
  status: DisputeStatus;
  description: string;
  claimAmount: number;
  resolution: string | null;
  depositDeduction: number;
  refundAmount: number;
  resolvedAt: string | null;
  createdAt: string;
  evidence: EvidenceRow[];
  raisedBy: { id: string; name: string };
  against: { id: string; name: string };
  booking: {
    id: string;
    code: string;
    status: BookingStatus;
    renterId: string;
    ownerId: string;
    startAt: string;
    endAt: string;
    rentAmount: number;
    depositAmount: number;
    depositDeduction: number;
    totalAmount: number;
    ownerPayoutAmount: number;
    protectionPlan: boolean;
    listing: { id: string; title: string };
    checklists: (Omit<Checklist, "photos" | "items"> & { photos: unknown; items: unknown })[];
  };
}

// ------------------------------------------------------------------- payments
export interface RefundRow {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
  providerRefundId: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  userId: string;
  bookingId: string | null;
  purpose: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amount: number;
  status: string;
  method: string | null;
  failureReason: string | null;
  refundedAmount: number;
  capturedAt: string | null;
  createdAt: string;
  user: { id: string; name: string };
  refunds: RefundRow[];
  booking: { id: string; code: string } | null;
}

export interface WebhookRow {
  id: string;
  provider: string;
  eventId: string;
  type: string;
  status: "RECEIVED" | "PROCESSED" | "FAILED";
  attempts: number;
  error: string | null;
  createdAt: string;
  processedAt: string | null;
}

// -------------------------------------------------------------------- payouts
export interface PayoutRow {
  id: string;
  ownerId: string;
  bookingId: string | null;
  amount: number;
  status: string;
  scheduledFor: string | null;
  providerTransferId: string | null;
  failureReason: string | null;
  attempts: number;
  note: string | null;
  paidAt: string | null;
  createdAt: string;
  owner: { id: string; name: string; kycStatus: string };
  booking: { id: string; code: string } | null;
}

export interface GroupTotal {
  status: string;
  _sum: { amount: number | null };
  _count: number;
}

// ---------------------------------------------------------------------- trust
export interface ReportRow {
  id: string;
  reporterId: string;
  targetType: "LISTING" | "USER" | "MESSAGE" | "REVIEW";
  targetId: string;
  reason: string;
  details: string | null;
  status: "OPEN" | "ACTIONED" | "DISMISSED";
  handledAt: string | null;
  createdAt: string;
  reporter: { id: string; name: string };
}

// ------------------------------------------------------------------- settings
export interface RefundTier {
  hoursBefore: number;
  refundPercent: number;
}
export type PolicyName = "FLEXIBLE" | "MODERATE" | "STRICT";

export interface PlatformSettings {
  fees: {
    ownerCommissionRate: number;
    proOwnerCommissionRate: number;
    renterServiceFeeRate: number;
    gstRate: number;
    protectionPlan: { enabled: boolean; type: "PERCENT" | "FLAT"; value: number; minFee: number; coverageCap: number };
    deliveryMarginRate: number;
    platformDeliveryBaseFee: number;
    platformDeliveryPerKm: number;
    lateFee: { multiplier: number; platformShare: number; graceHours: number };
    ownerCancellationPenaltyRate: number;
    ownerCancellationPenaltyMin: number;
  };
  cancellationPolicies: Record<PolicyName, RefundTier[]>;
  booking: {
    requestExpiryHours: number;
    paymentWindowHours: number;
    instantPaymentWindowMinutes: number;
    inspectionWindowHours: number;
    payoutDelayHours: number;
    overdueAutoDisputeDays: number;
    maxAdvanceDays: number;
    minLeadTimeHours: number;
  };
  trust: {
    kycRequiredAboveAmount: number;
    listingModeration: boolean;
    cancellationFlagThreshold: number;
    offPlatformFlagThreshold: number;
    instantBookingRequiresKyc: boolean;
    prohibitedKeywords: string[];
  };
  featuredPlans: { code: string; name: string; days: number; price: number }[];
  pro: { price: number; periodDays: number; maxListingsFree: number; maxListingsPro: number };
  legal: { rentalAgreementVersion: string; termsVersion: string; privacyVersion: string };
}
export type SettingsKey = keyof PlatformSettings;

// ----------------------------------------------------------------- catalogue
export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  icon: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  _count: { listings: number };
}

export interface AdminCity {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  lat: number;
  lng: number;
  listingCount: number;
  isActive: boolean;
  createdAt: string;
  _count: { localities: number };
}

// ------------------------------------------------------------ reconciliation
export interface ReconciliationReport {
  period: { from: string; to: string };
  payments: { status: string; purpose: string; _sum: { amount: number | null; refundedAmount: number | null }; _count: number }[];
  refunds: GroupTotal[];
  payouts: GroupTotal[];
  ledger: { account: string; _sum: { amount: number | null } }[];
  checks: {
    capturedTotal: number;
    ledgerReceived: number;
    balanced: boolean;
    mismatchedPayments: { id: string; providerOrderId: string; amount: number }[];
    pendingRefunds: number;
    failedWebhooks: number;
  };
}

export interface ReconcileRunResult {
  checked: number;
  recovered: number;
  webhooksRetried: number;
  refundsRetried: number;
}
