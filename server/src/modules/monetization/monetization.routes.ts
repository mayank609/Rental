/**
 * /api/v1/monetization — featured listing boosts & Owner Pro subscription.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import { getSettings } from "../settings/settings.service";
import { createOrder, checkoutPayload, onPaymentCaptured } from "../payments/payments.service";
import { registerJob } from "../../lib/queue";
import { invalidate } from "../../lib/cache";
import { notify } from "../notifications/notifications.service";
import { generateSimpleInvoice } from "../invoices/invoices.service";
import { isProActive } from "../users/users.serializers";
import { DAY } from "../../lib/util";

export const monetizationRouter = Router();

monetizationRouter.get("/plans", async (_req, res) => {
  const s = await getSettings();
  res.json({
    featuredPlans: s.featuredPlans,
    pro: { ...s.pro, commissionRate: s.fees.proOwnerCommissionRate, standardCommissionRate: s.fees.ownerCommissionRate },
    gstRate: s.fees.gstRate,
  });
});

monetizationRouter.post("/promotions", requireAuth, validate({ body: z.object({ listingId: z.string(), planCode: z.string() }) }), async (req, res) => {
  const s = await getSettings();
  const plan = s.featuredPlans.find((p) => p.code === req.body.planCode);
  if (!plan) throw badRequest("Unknown plan");
  const listing = await prisma.listing.findFirst({ where: { id: req.body.listingId, ownerId: req.user!.id, deletedAt: null } });
  if (!listing) throw notFound("Listing");
  if (listing.status !== "ACTIVE") throw badRequest("Only active listings can be boosted");
  const promo = await prisma.promotion.create({ data: { listingId: listing.id, userId: req.user!.id, planCode: plan.code, amount: plan.price } });
  const payment = await createOrder({ userId: req.user!.id, purpose: "FEATURED", amount: plan.price, idempotencyKey: `promo:${promo.id}`, metadata: { promotionId: promo.id, refId: promo.id }, receipt: `PROMO-${promo.id.slice(-8)}` });
  await prisma.promotion.update({ where: { id: promo.id }, data: { paymentId: payment.id } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.status(201).json({ promotion: promo, checkout: checkoutPayload(payment, user) });
});

monetizationRouter.get("/promotions", requireAuth, async (req, res) => {
  const promotions = await prisma.promotion.findMany({ where: { userId: req.user!.id }, include: { listing: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" } });
  res.json({ promotions });
});

onPaymentCaptured("FEATURED", async (payment) => {
  const promotionId = (payment.metadata as { promotionId?: string }).promotionId;
  if (!promotionId) return;
  const s = await getSettings();
  const promo = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId }, include: { listing: true } });
  if (promo.status === "ACTIVE") return;
  const plan = s.featuredPlans.find((p) => p.code === promo.planCode) ?? { days: 7, name: promo.planCode };
  const startsAt = promo.listing.featuredUntil && promo.listing.featuredUntil > new Date() ? promo.listing.featuredUntil : new Date();
  const endsAt = new Date(startsAt.getTime() + plan.days * DAY);
  await prisma.$transaction([
    prisma.promotion.update({ where: { id: promo.id }, data: { status: "ACTIVE", startsAt, endsAt } }),
    prisma.listing.update({ where: { id: promo.listingId }, data: { featuredUntil: endsAt } }),
  ]);
  await invalidate("listings");
  await generateSimpleInvoice("PROMOTION", payment.id, `${plan.name} for "${promo.listing.title}"`);
  await notify(promo.userId, "system", { title: "Your listing is boosted 🚀", body: `"${promo.listing.title}" is featured until ${endsAt.toDateString()}.`, url: `/dashboard/listings` });
});

monetizationRouter.get("/subscription", requireAuth, async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { userId: req.user!.id } });
  res.json({ subscription: sub, active: isProActive(sub) });
});

monetizationRouter.post("/subscription/pro", requireAuth, async (req, res) => {
  const s = await getSettings();
  const sub = await prisma.subscription.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, status: "PENDING_PAYMENT" },
    update: {},
  });
  const payment = await createOrder({
    userId: req.user!.id,
    purpose: "SUBSCRIPTION",
    amount: s.pro.price,
    idempotencyKey: `pro:${sub.id}:${new Date().toISOString().slice(0, 10)}:${s.pro.price}`,
    metadata: { subscriptionId: sub.id, refId: sub.id },
    receipt: `PRO-${sub.id.slice(-8)}`,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.status(201).json({ checkout: checkoutPayload(payment, user) });
});

monetizationRouter.post("/subscription/cancel", requireAuth, async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { userId: req.user!.id } });
  if (!sub) throw notFound("Subscription");
  // Pro is prepaid per period; cancelling stops renewal reminders, access continues until period end.
  const updated = await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED" } });
  res.json({ subscription: updated });
});

onPaymentCaptured("SUBSCRIPTION", async (payment) => {
  const s = await getSettings();
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: payment.userId } });
  if (sub.paymentId === payment.id) return;
  const base = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
  const end = new Date(base.getTime() + s.pro.periodDays * DAY);
  await prisma.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE", currentPeriodEnd: end, paymentId: payment.id } });
  await generateSimpleInvoice("SUBSCRIPTION", payment.id, `Owner Pro — ${s.pro.periodDays} days`);
  await notify(payment.userId, "system", { title: "Welcome to Owner Pro ⭐", body: `Lower commission, more listings and analytics are active until ${end.toDateString()}.`, url: "/dashboard/pro" });
});

/** Expire boosts and Pro subscriptions. */
export async function expireMonetization() {
  const now = new Date();
  const promos = await prisma.promotion.updateMany({ where: { status: "ACTIVE", endsAt: { lt: now } }, data: { status: "EXPIRED" } });
  const subs = await prisma.subscription.updateMany({ where: { status: { in: ["ACTIVE", "CANCELLED"] }, currentPeriodEnd: { lt: now } }, data: { status: "EXPIRED" } });
  if (promos.count) await invalidate("listings");
  return { promotions: promos.count, subscriptions: subs.count };
}
registerJob("monetization.expire", expireMonetization);
