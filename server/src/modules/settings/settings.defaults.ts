/**
 * Default platform configuration. Every value here can be overridden from the
 * admin panel (stored in PlatformSetting rows, one row per top-level key).
 * Rates are fractions (0.15 = 15%). Money is in paise.
 */
export type RefundTier = { hoursBefore: number; refundPercent: number };

export const DEFAULT_SETTINGS = {
  fees: {
    ownerCommissionRate: 0.15,
    proOwnerCommissionRate: 0.1,
    renterServiceFeeRate: 0.05,
    /** GST applied on platform fees (service fee, commission, protection). */
    gstRate: 0.18,
    protectionPlan: {
      enabled: true,
      type: "PERCENT" as "PERCENT" | "FLAT",
      value: 0.08, // 8% of rent, or flat paise when type = FLAT
      minFee: 4900,
      coverageCap: 5_000_000, // ₹50,000 max damage covered
    },
    /** Margin the platform keeps on platform-operated delivery. */
    deliveryMarginRate: 0.2,
    platformDeliveryBaseFee: 9900,
    platformDeliveryPerKm: 1200,
    lateFee: {
      /** Late fee per extra day = daily price × multiplier. */
      multiplier: 1.5,
      /** Share of the late fee kept by the platform (rest goes to owner). */
      platformShare: 0.3,
      graceHours: 2,
    },
    /** Penalty charged to owners that cancel a paid booking (fraction of rent). */
    ownerCancellationPenaltyRate: 0.1,
    ownerCancellationPenaltyMin: 20000,
  },
  cancellationPolicies: {
    FLEXIBLE: [
      { hoursBefore: 24, refundPercent: 100 },
      { hoursBefore: 0, refundPercent: 50 },
    ] as RefundTier[],
    MODERATE: [
      { hoursBefore: 72, refundPercent: 100 },
      { hoursBefore: 24, refundPercent: 50 },
      { hoursBefore: 0, refundPercent: 0 },
    ] as RefundTier[],
    STRICT: [
      { hoursBefore: 168, refundPercent: 50 },
      { hoursBefore: 0, refundPercent: 0 },
    ] as RefundTier[],
  },
  booking: {
    requestExpiryHours: 24,
    paymentWindowHours: 12,
    instantPaymentWindowMinutes: 30,
    inspectionWindowHours: 48,
    payoutDelayHours: 24,
    overdueAutoDisputeDays: 3,
    maxAdvanceDays: 180,
    minLeadTimeHours: 1,
  },
  trust: {
    /** Renters must complete KYC when the booking total exceeds this (paise). */
    kycRequiredAboveAmount: 2_500_000,
    /** When true new listings go to the moderation queue. */
    listingModeration: false,
    cancellationFlagThreshold: 3,
    offPlatformFlagThreshold: 3,
    instantBookingRequiresKyc: true,
    prohibitedKeywords: [
      "gun", "pistol", "rifle", "ammunition", "explosive", "firework", "drugs", "cannabis", "weed",
      "narcotic", "alcohol", "liquor", "tobacco", "counterfeit", "fake currency", "human", "organ",
      "wildlife", "ivory", "prescription medicine", "stolen", "adult service", "escort",
    ],
  },
  featuredPlans: [
    { code: "BOOST_7D", name: "7-day boost", days: 7, price: 19900 },
    { code: "BOOST_30D", name: "30-day boost", days: 30, price: 59900 },
  ],
  pro: {
    price: 49900,
    periodDays: 30,
    maxListingsFree: 10,
    maxListingsPro: 200,
  },
  legal: {
    rentalAgreementVersion: "2026.1",
    termsVersion: "2026.1",
    privacyVersion: "2026.1",
  },
};

export type PlatformSettings = typeof DEFAULT_SETTINGS;
export type SettingsKey = keyof PlatformSettings;
export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingsKey[];
