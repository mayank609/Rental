/**
 * Trust & safety primitives:
 *  - prohibited item detection at listing time
 *  - contact-detail masking in chat before a booking is confirmed
 *  - automatic suspicious-behaviour flags
 */
import type { FlagType } from "@prisma/client";
import { prisma, Tx } from "../../lib/prisma";
import { getSettings } from "../settings/settings.service";
import { logger } from "../../lib/logger";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Returns the first prohibited keyword found in the given texts, if any. */
export async function findProhibited(...texts: (string | null | undefined)[]) {
  const { trust } = await getSettings();
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  for (const kw of trust.prohibitedKeywords) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(kw.toLowerCase())}(s|es)?([^a-z0-9]|$)`, "i");
    if (re.test(hay)) return kw;
  }
  return null;
}

// Phone numbers (Indian + intl, with separators / spelled out digits),
// emails, UPI handles, URLs and "whatsapp me" style solicitations.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "email", re: /[A-Z0-9._%+-]+\s*(@|\(at\)|\[at\]| at )\s*[A-Z0-9.-]+\s*(\.|\(dot\)| dot )\s*[A-Z]{2,}/gi },
  { name: "upi", re: /\b[\w.-]{2,}@(ok\w+|ybl|ibl|axl|paytm|upi|apl|icici|sbi|hdfcbank|axisbank|kotak)\b/gi },
  { name: "phone", re: /(\+?\d[\d\s\-().]{8,}\d)/g },
  { name: "spelled_phone", re: /\b((zero|one|two|three|four|five|six|seven|eight|nine)[\s,-]*){6,}\b/gi },
  { name: "url", re: /\b(https?:\/\/|www\.)\S+/gi },
  { name: "social", re: /\b(whats\s*app|telegram|insta(gram)?|signal)\s*(me|at|on|no|number|id)?\b/gi },
];

export function maskContactInfo(text: string) {
  let masked = text;
  const hits: string[] = [];
  for (const { name, re } of PATTERNS) {
    masked = masked.replace(re, (m) => {
      // Ignore short numbers (prices, dates) for the phone pattern
      if (name === "phone" && m.replace(/\D/g, "").length < 10) return m;
      hits.push(name);
      return "[hidden until booking is confirmed]";
    });
  }
  return { masked, wasMasked: hits.length > 0, hits };
}

export async function raiseFlag(
  input: { type: FlagType; userId?: string; listingId?: string; severity?: number; details?: Record<string, unknown> },
  tx: Tx = prisma,
) {
  // Avoid duplicate open flags of the same type for the same subject
  const existing = await tx.flag.findFirst({
    where: { type: input.type, userId: input.userId, listingId: input.listingId, status: "OPEN" },
  });
  if (existing) {
    return tx.flag.update({
      where: { id: existing.id },
      data: { severity: Math.min(3, Math.max(existing.severity, input.severity ?? 1)), details: { ...(existing.details as object), ...(input.details ?? {}), repeatedAt: new Date().toISOString() } },
    });
  }
  logger.warn({ ...input }, "trust flag raised");
  return tx.flag.create({
    data: { type: input.type, userId: input.userId, listingId: input.listingId, severity: input.severity ?? 1, details: (input.details ?? {}) as object },
  });
}

/** Called after every cancellation by a user. */
export async function checkCancellationAbuse(userId: string) {
  const { trust } = await getSettings();
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const count = await prisma.booking.count({ where: { cancelledById: userId, cancelledAt: { gte: since } } });
  if (count >= trust.cancellationFlagThreshold) {
    await raiseFlag({ type: "HIGH_CANCELLATIONS", userId, severity: count >= trust.cancellationFlagThreshold * 2 ? 3 : 2, details: { last30Days: count } });
  }
}

/** Called when chat masking triggers. */
export async function recordOffPlatformAttempt(userId: string, hits: string[]) {
  const u = await prisma.user.update({ where: { id: userId }, data: { offPlatformAttempts: { increment: 1 } } });
  const { trust } = await getSettings();
  if (u.offPlatformAttempts >= trust.offPlatformFlagThreshold) {
    await raiseFlag({ type: "OFF_PLATFORM_ATTEMPT", userId, severity: 2, details: { attempts: u.offPlatformAttempts, lastHits: hits } });
  }
}

/**
 * Heuristic fake-review detection: the same two accounts completing many
 * very short rentals together, or reviews from brand-new accounts.
 */
export async function checkReviewAbuse(authorId: string, subjectId: string) {
  const since = new Date(Date.now() - 14 * 24 * 3600_000);
  const pairCount = await prisma.review.count({
    where: { authorId, subjectId, createdAt: { gte: since } },
  });
  const author = await prisma.user.findUnique({ where: { id: authorId }, select: { createdAt: true } });
  const newAccount = author && Date.now() - author.createdAt.getTime() < 2 * 24 * 3600_000;
  if (pairCount >= 3 || (newAccount && pairCount >= 2)) {
    await raiseFlag({ type: "SUSPICIOUS_REVIEWS", userId: subjectId, severity: 2, details: { authorId, pairCount, newAccount } });
  }
}

/** True if either user has blocked the other. */
export async function isBlockedBetween(a: string, b: string) {
  const n = await prisma.userBlock.count({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  return n > 0;
}
