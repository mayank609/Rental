/** /api/v1/payouts — owner payout onboarding & earnings. */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePhoneVerified } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { prisma } from "../../lib/prisma";
import { encrypt } from "../../lib/crypto";
import { pageMeta, paginate } from "../../lib/util";
import { ownerEarningsSummary, releaseHeldPayouts } from "./payouts.service";

export const payoutsRouter = Router();
payoutsRouter.use(requireAuth);

const accountSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("BANK"),
    accountHolderName: z.string().trim().min(2).max(120),
    accountNumber: z.string().regex(/^\d{9,18}$/, "Enter a valid account number"),
    ifsc: z.string().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC"),
    pan: z.string().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN").optional(),
  }),
  z.object({
    method: z.literal("UPI"),
    accountHolderName: z.string().trim().min(2).max(120),
    upiId: z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, "Enter a valid UPI ID"),
    pan: z.string().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN").optional(),
  }),
]);

const serialize = (a: Awaited<ReturnType<typeof prisma.payoutAccount.findUnique>>) =>
  a && {
    method: a.method,
    accountHolderName: a.accountHolderName,
    accountNumberLast4: a.accountNumberLast4,
    ifsc: a.ifsc,
    upiId: a.upiId ? a.upiId.replace(/^(.{2}).*(@.*)$/, "$1***$2") : null,
    panLast4: a.panLast4,
    status: a.status,
    updatedAt: a.updatedAt,
  };

payoutsRouter.get("/account", async (req, res) => {
  const a = await prisma.payoutAccount.findUnique({ where: { userId: req.user!.id } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { kycStatus: true } });
  res.json({ account: serialize(a), kycStatus: user.kycStatus });
});

/**
 * Save bank/UPI details. The account becomes VERIFIED once the user's KYC
 * is verified (bank penny-drop / Route KYC happens on the gateway side).
 */
payoutsRouter.put("/account", requirePhoneVerified, validate({ body: accountSchema }), async (req, res) => {
  const b = req.body as z.infer<typeof accountSchema>;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const data = {
    method: b.method,
    accountHolderName: b.accountHolderName,
    accountNumberEnc: b.method === "BANK" ? encrypt(b.accountNumber) : null,
    accountNumberLast4: b.method === "BANK" ? b.accountNumber.slice(-4) : null,
    ifsc: b.method === "BANK" ? b.ifsc : null,
    upiId: b.method === "UPI" ? b.upiId : null,
    panLast4: b.pan ? b.pan.slice(-4) : undefined,
    providerAccountId: null, // details changed → re-create linked account
    status: user.kycStatus === "VERIFIED" ? ("VERIFIED" as const) : ("PENDING" as const),
  };
  const a = await prisma.payoutAccount.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  if (a.status === "VERIFIED") await releaseHeldPayouts(user.id);
  res.json({ account: serialize(a) });
});

payoutsRouter.get("/", validate({ query: z.object({ page: z.coerce.number().optional() }) }), async (req, res) => {
  const { skip, take, page, limit } = paginate((req.query as { page?: number }).page, 20);
  const where = { ownerId: req.user!.id };
  const [payouts, total, summary] = await Promise.all([
    prisma.payout.findMany({ where, include: { booking: { select: { id: true, code: true, listing: { select: { title: true } } } } }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.payout.count({ where }),
    ownerEarningsSummary(req.user!.id),
  ]);
  res.json({ payouts, summary, meta: pageMeta(total, page, limit) });
});
