/**
 * /api/v1/legal — versioned rental agreement accepted at every booking.
 * (Terms, Privacy and Refund pages are rendered by the client.)
 */
import { Router } from "express";
import { env } from "../../config/env";
import { getSettings } from "../settings/settings.service";

export const legalRouter = Router();

export function rentalAgreementText(version: string) {
  return `${env.PLATFORM_NAME} RENTAL AGREEMENT (v${version})

This Rental Agreement is entered into between the Owner and the Renter identified in the booking, facilitated by ${env.COMPANY_LEGAL_NAME} ("Platform"), which acts solely as an intermediary under the Information Technology Act, 2000.

1. ITEM & PERIOD. The Owner agrees to rent the item described in the listing to the Renter for the booked period. Ownership remains with the Owner at all times.
2. PAYMENT. The Renter pays rent, platform fees, applicable GST and a refundable security deposit to the Platform, which holds the funds until the rental completes.
3. HANDOVER & RETURN. Both parties must complete the in-app handover and return checklists with timestamped photos. These records are the primary evidence in any dispute.
4. CARE OF ITEM. The Renter shall use the item with reasonable care, only for lawful purposes, and in accordance with the Owner's rules. Sub-renting is prohibited.
5. LATE RETURN. Returns after the end time (plus grace period) incur a late fee per extra day as displayed at checkout, which may be deducted from the deposit.
6. DAMAGE, LOSS & THEFT. The Renter is liable for damage beyond normal wear and tear, loss or theft, up to the item's fair market value. The deposit and any protection plan will be applied first. Unreturned items may be reported to law enforcement.
7. CANCELLATION. Cancellations and refunds follow the listing's cancellation policy (Flexible / Moderate / Strict) shown at booking. Owners cancelling a paid booking incur a penalty.
8. DISPUTES. Either party may raise a dispute within the time limits in the Refund & Cancellation Policy. The Platform's resolution regarding deposit deductions and refunds is binding for the purposes of funds held by the Platform, without prejudice to statutory remedies.
9. OFF-PLATFORM DEALINGS. Payments outside the Platform are not protected and may lead to account suspension.
10. PERSONAL DATA. Personal data is processed per the Privacy Policy in compliance with the Digital Personal Data Protection Act, 2023.
11. GOVERNING LAW. This agreement is governed by the laws of India; courts at ${env.COMPANY_ADDRESS.split(",")[0]} have jurisdiction.

By confirming a booking, both parties accept this agreement electronically under Section 10A of the IT Act, 2000.`;
}

legalRouter.get("/rental-agreement", async (_req, res) => {
  const { legal } = await getSettings();
  res.json({ version: legal.rentalAgreementVersion, text: rentalAgreementText(legal.rentalAgreementVersion) });
});

legalRouter.get("/versions", async (_req, res) => {
  const { legal } = await getSettings();
  res.json(legal);
});

legalRouter.get("/config", async (_req, res) => {
  const s = await getSettings();
  res.json({
    platformName: env.PLATFORM_NAME,
    currency: env.CURRENCY,
    country: env.COUNTRY_CODE,
    timezone: env.DEFAULT_TIMEZONE,
    supportEmail: env.SUPPORT_EMAIL,
    companyName: env.COMPANY_LEGAL_NAME,
    fees: { ownerCancellationPenaltyRate: s.fees.ownerCancellationPenaltyRate, ownerCancellationPenaltyMin: s.fees.ownerCancellationPenaltyMin, renterServiceFeeRate: s.fees.renterServiceFeeRate, ownerCommissionRate: s.fees.ownerCommissionRate, proOwnerCommissionRate: s.fees.proOwnerCommissionRate, gstRate: s.fees.gstRate, protectionPlan: s.fees.protectionPlan, lateFee: s.fees.lateFee },
    cancellationPolicies: s.cancellationPolicies,
    booking: { requestExpiryHours: s.booking.requestExpiryHours, inspectionWindowHours: s.booking.inspectionWindowHours, minLeadTimeHours: s.booking.minLeadTimeHours, maxAdvanceDays: s.booking.maxAdvanceDays },
    kycRequiredAboveAmount: s.trust.kycRequiredAboveAmount,
    prohibitedKeywords: s.trust.prohibitedKeywords,
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
    paymentProvider: env.PAYMENT_PROVIDER,
  });
});
