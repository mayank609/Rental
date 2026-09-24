/**
 * /api/v1/payments — client verification, gateway webhooks, history.
 */
import { Router, raw } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { prisma } from "../../lib/prisma";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { isProd } from "../../config/env";
import { paymentProvider, mockSign, mockRecordPayment } from "./provider";
import { ingestWebhook, verifyClientPayment, markFailed } from "./payments.service";
import { logger } from "../../lib/logger";

export const paymentsRouter = Router();

/**
 * Razorpay webhook. Mounted with a raw body parser so the HMAC signature
 * can be verified over the exact bytes. Idempotent by event id.
 */
export const webhookRouter = Router();
webhookRouter.post("/razorpay", raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  const sig = req.headers["x-razorpay-signature"] as string | undefined;
  const body = req.body as Buffer;
  if (!sig || !Buffer.isBuffer(body) || !paymentProvider.verifyWebhookSignature(body, sig)) {
    logger.warn("rejected webhook with invalid signature");
    return res.status(400).json({ error: { code: "INVALID_SIGNATURE", message: "Invalid signature" } });
  }
  const json = JSON.parse(body.toString("utf8"));
  const eventId = (req.headers["x-razorpay-event-id"] as string) || `${json.event}:${json.payload?.payment?.entity?.id ?? json.created_at}`;
  await ingestWebhook("razorpay", eventId, json.event, json);
  res.json({ ok: true });
});

paymentsRouter.post(
  "/verify",
  requireAuth,
  validate({ body: z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() }) }),
  async (req, res) => {
    const p = await verifyClientPayment(req.user!.id, req.body);
    res.json({ payment: { id: p.id, status: p.status, bookingId: p.bookingId, purpose: p.purpose } });
  },
);

/** Checkout was dismissed or failed on the client. */
paymentsRouter.post("/failed", requireAuth, validate({ body: z.object({ orderId: z.string(), reason: z.string().max(500).optional() }) }), async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { providerOrderId: req.body.orderId } });
  if (!p || p.userId !== req.user!.id) throw notFound("Payment");
  await markFailed(req.body.orderId, req.body.reason);
  res.json({ ok: true });
});

/** DEV ONLY: simulate a successful gateway payment for mock checkout. */
paymentsRouter.post("/mock/pay", requireAuth, validate({ body: z.object({ orderId: z.string(), fail: z.boolean().optional() }) }), async (req, res) => {
  if (paymentProvider.name !== "mock" || isProd) throw forbidden("Mock payments are disabled");
  const p = await prisma.payment.findUnique({ where: { providerOrderId: req.body.orderId } });
  if (!p || p.userId !== req.user!.id) throw notFound("Payment");
  if (req.body.fail) throw badRequest("Simulated payment failure");
  const paymentId = `pay_mock_${Date.now().toString(36)}`;
  mockRecordPayment(p.providerOrderId, { id: paymentId, status: "captured", amount: p.amount, method: "upi" });
  res.json({ orderId: p.providerOrderId, paymentId, signature: mockSign(p.providerOrderId, paymentId) });
});

paymentsRouter.get("/", requireAuth, async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { userId: req.user!.id },
    include: { refunds: true, booking: { select: { id: true, code: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ payments });
});

paymentsRouter.get("/:id", requireAuth, async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { refunds: true } });
  if (!p || (p.userId !== req.user!.id && req.user!.role === "USER")) throw notFound("Payment");
  res.json({ payment: p });
});
