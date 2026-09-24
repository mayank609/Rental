/**
 * Payments: order creation (idempotent), capture handling shared by the
 * client verify call, webhooks and reconciliation, refunds and ledger.
 *
 * Capture side-effects are dispatched to purpose handlers registered by
 * other modules (bookings, promotions, subscriptions) to avoid import cycles.
 */
import type { Payment, PaymentPurpose, LedgerAccount, Prisma as P } from "@prisma/client";
import { prisma, Tx } from "../../lib/prisma";
import { env } from "../../config/env";
import { paymentProvider } from "./provider";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { enqueue, registerJob } from "../../lib/queue";
import { randomToken } from "../../lib/crypto";
import { notify } from "../notifications/notifications.service";
import { formatMoney } from "../../lib/util";

type CaptureHandler = (payment: Payment) => Promise<void>;
const captureHandlers = new Map<PaymentPurpose, CaptureHandler>();
export const onPaymentCaptured = (purpose: PaymentPurpose, fn: CaptureHandler) => captureHandlers.set(purpose, fn);

export async function ledger(
  entries: { account: LedgerAccount; amount: number; description: string; bookingId?: string | null; paymentId?: string | null }[],
  tx: Tx = prisma,
) {
  const rows = entries.filter((e) => e.amount !== 0);
  if (rows.length) await tx.ledgerEntry.createMany({ data: rows });
}

/**
 * Create (or reuse) a gateway order. The idempotency key makes retries from
 * flaky networks return the same order instead of double-charging.
 */
export async function createOrder(input: {
  userId: string;
  purpose: PaymentPurpose;
  amount: number;
  bookingId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  receipt: string;
}) {
  if (input.amount <= 0) throw badRequest("Nothing to pay");
  const key = input.idempotencyKey ?? `${input.purpose}:${input.bookingId ?? input.metadata?.refId ?? randomToken(8)}:${input.amount}`;

  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    if (existing.userId !== input.userId) throw conflict("Idempotency key already used");
    if (existing.status === "CAPTURED") throw conflict("This has already been paid", "ALREADY_PAID");
    if (existing.status === "CREATED" && existing.amount === input.amount) return existing;
  }
  // A different amount or a failed attempt → fresh order with a derived key
  const finalKey = existing ? `${key}:${randomToken(4)}` : key;
  const { orderId } = await paymentProvider.createOrder({
    amount: input.amount,
    currency: env.CURRENCY,
    receipt: input.receipt,
    notes: { purpose: input.purpose, bookingId: input.bookingId ?? "", userId: input.userId },
  });
  return prisma.payment.create({
    data: {
      userId: input.userId,
      bookingId: input.bookingId,
      purpose: input.purpose,
      provider: paymentProvider.name,
      providerOrderId: orderId,
      amount: input.amount,
      currency: env.CURRENCY,
      idempotencyKey: finalKey,
      metadata: (input.metadata ?? {}) as object,
    },
  });
}

export const checkoutPayload = (p: Payment, user: { name: string; email?: string | null; phone?: string | null }) => ({
  paymentId: p.id,
  provider: p.provider,
  keyId: paymentProvider.publicKey,
  orderId: p.providerOrderId,
  amount: p.amount,
  currency: p.currency,
  name: env.PLATFORM_NAME,
  prefill: { name: user.name, email: user.email ?? undefined, contact: user.phone ?? undefined },
});

/**
 * Idempotent capture handler. Safe to call concurrently from the verify
 * endpoint, webhooks and reconciliation — a row lock serialises them.
 */
export async function markCaptured(input: { orderId: string; providerPaymentId: string; amount?: number; method?: string }) {
  const captured = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Payment" WHERE "providerOrderId" = ${input.orderId} FOR UPDATE`;
    if (!rows.length) throw notFound("Payment");
    const p = await tx.payment.findUniqueOrThrow({ where: { id: rows[0].id } });
    if (p.status === "CAPTURED" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED") return null; // already processed
    if (input.amount != null && input.amount !== p.amount) {
      logger.error({ paymentId: p.id, expected: p.amount, got: input.amount }, "payment amount mismatch");
      await tx.flag.create({ data: { type: "PAYMENT_ANOMALY", userId: p.userId, severity: 3, details: { paymentId: p.id, expected: p.amount, got: input.amount } } });
    }
    const updated = await tx.payment.update({
      where: { id: p.id },
      data: { status: "CAPTURED", providerPaymentId: input.providerPaymentId, method: input.method, capturedAt: new Date(), failureReason: null },
    });
    await ledger([{ account: "RENTER_PAYMENT", amount: p.amount, description: `${p.purpose} payment captured`, bookingId: p.bookingId, paymentId: p.id }], tx);
    return updated;
  });
  if (!captured) return prisma.payment.findUniqueOrThrow({ where: { providerOrderId: input.orderId } });

  const handler = captureHandlers.get(captured.purpose);
  try {
    if (handler) await handler(captured);
  } catch (err) {
    logger.error({ err, paymentId: captured.id }, "capture handler failed");
    throw err;
  }
  await notify(captured.userId, "payment.succeeded", {
    title: "Payment successful",
    body: `We received your payment of ${formatMoney(captured.amount)}.`,
    url: captured.bookingId ? `/dashboard/bookings/${captured.bookingId}` : "/dashboard",
  });
  return captured;
}

export async function markFailed(orderId: string, reason?: string) {
  const p = await prisma.payment.findUnique({ where: { providerOrderId: orderId } });
  if (!p || p.status !== "CREATED") return;
  await prisma.payment.update({ where: { id: p.id }, data: { status: "FAILED", failureReason: reason?.slice(0, 500) } });
  await notify(p.userId, "payment.failed", {
    title: "Payment failed",
    body: `Your payment of ${formatMoney(p.amount)} didn't go through${reason ? `: ${reason}` : ""}. You can retry from your booking.`,
    url: p.bookingId ? `/dashboard/bookings/${p.bookingId}` : "/dashboard",
  });
}

/** Verify Checkout's signature from the client and capture. */
export async function verifyClientPayment(userId: string, input: { orderId: string; paymentId: string; signature: string }) {
  const p = await prisma.payment.findUnique({ where: { providerOrderId: input.orderId } });
  if (!p || p.userId !== userId) throw notFound("Payment");
  if (!paymentProvider.verifyPaymentSignature(input)) throw badRequest("Payment verification failed");
  return markCaptured({ orderId: input.orderId, providerPaymentId: input.paymentId });
}

/**
 * Refund (full or partial) with idempotency. The Refund row is written
 * first so a crash mid-call is retried by the reconciliation job.
 */
export async function refundPayment(input: { paymentId: string; amount: number; reason: string; actorId?: string | null; key: string; bookingId?: string | null }) {
  if (input.amount <= 0) return null;
  const existing = await prisma.refund.findUnique({ where: { idempotencyKey: input.key } });
  if (existing) return existing;

  const refund = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${input.paymentId} FOR UPDATE`;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
    if (!["CAPTURED", "PARTIALLY_REFUNDED"].includes(p.status)) throw badRequest("Payment is not refundable");
    const refundable = p.amount - p.refundedAmount;
    const amount = Math.min(input.amount, refundable);
    if (amount <= 0) return null;
    const r = await tx.refund.create({
      data: { paymentId: p.id, amount, reason: input.reason.slice(0, 500), idempotencyKey: input.key, initiatedById: input.actorId ?? null },
    });
    const refunded = p.refundedAmount + amount;
    await tx.payment.update({
      where: { id: p.id },
      data: { refundedAmount: refunded, status: refunded >= p.amount ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });
    await ledger([{ account: "REFUND", amount: -amount, description: input.reason, bookingId: input.bookingId ?? p.bookingId, paymentId: p.id }], tx);
    return r;
  });
  if (!refund) return null;
  await executeRefund(refund.id);
  return prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
}

/** Push a PENDING/FAILED refund to the gateway (retry-safe). */
export async function executeRefund(refundId: string) {
  const r = await prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  if (r.status === "PROCESSED" || r.providerRefundId) return r;
  try {
    if (!r.payment.providerPaymentId) throw new Error("Missing provider payment id");
    const out = await paymentProvider.refund({ paymentId: r.payment.providerPaymentId, amount: r.amount, idempotencyKey: r.idempotencyKey, notes: { reason: r.reason.slice(0, 200) } });
    const updated = await prisma.refund.update({
      where: { id: r.id },
      data: { providerRefundId: out.refundId, status: out.status === "failed" ? "FAILED" : out.status === "processed" ? "PROCESSED" : "PENDING", failureReason: null },
    });
    if (updated.status !== "FAILED") {
      await notify(r.payment.userId, "payment.refunded", {
        title: "Refund initiated",
        body: `${formatMoney(r.amount)} is being refunded to your original payment method (${r.reason}). It usually takes 5–7 working days.`,
        url: r.payment.bookingId ? `/dashboard/bookings/${r.payment.bookingId}` : "/dashboard",
      });
    }
    return updated;
  } catch (err) {
    logger.error({ err, refundId }, "refund failed, will retry");
    return prisma.refund.update({ where: { id: r.id }, data: { status: "FAILED", failureReason: (err as Error).message.slice(0, 500) } });
  }
}

/** The captured booking payment (there is at most one). */
export const bookingPayment = (bookingId: string, tx: Tx = prisma) =>
  tx.payment.findFirst({ where: { bookingId, purpose: "BOOKING", status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] } } });

// ------------------------------------------------------------- webhooks --
export async function ingestWebhook(provider: string, eventId: string, type: string, payload: P.InputJsonValue) {
  try {
    const ev = await prisma.webhookEvent.create({ data: { provider, eventId, type, payload } });
    await processWebhook(ev.id);
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return; // duplicate delivery → already handled
    throw err;
  }
}

export async function processWebhook(eventRowId: string) {
  const ev = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventRowId } });
  if (ev.status === "PROCESSED") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = ev.payload as any;
  try {
    const pay = body?.payload?.payment?.entity;
    const refundEntity = body?.payload?.refund?.entity;
    switch (ev.type) {
      case "payment.captured":
      case "order.paid":
        if (pay?.order_id) await markCaptured({ orderId: pay.order_id, providerPaymentId: pay.id, amount: pay.amount, method: pay.method });
        break;
      case "payment.failed":
        if (pay?.order_id) await markFailed(pay.order_id, pay.error_description);
        break;
      case "refund.processed":
      case "refund.failed":
        if (refundEntity?.id) {
          await prisma.refund.updateMany({
            where: { providerRefundId: refundEntity.id },
            data: { status: ev.type === "refund.processed" ? "PROCESSED" : "FAILED" },
          });
        }
        break;
      case "transfer.processed":
      case "transfer.failed": {
        const t = body?.payload?.transfer?.entity;
        if (t?.id) {
          await prisma.payout.updateMany({
            where: { providerTransferId: t.id },
            data: ev.type === "transfer.processed" ? { status: "PAID", paidAt: new Date() } : { status: "FAILED", failureReason: t.error?.description },
          });
        }
        break;
      }
      default:
        break;
    }
    await prisma.webhookEvent.update({ where: { id: ev.id }, data: { status: "PROCESSED", processedAt: new Date(), attempts: { increment: 1 }, error: null } });
  } catch (err) {
    logger.error({ err, eventId: ev.eventId }, "webhook processing failed");
    await prisma.webhookEvent.update({ where: { id: ev.id }, data: { status: "FAILED", attempts: { increment: 1 }, error: (err as Error).message.slice(0, 1000) } });
  }
}

// ------------------------------------------------------- reconciliation --
/**
 * Catches "payment succeeded but webhook/verify never arrived" by polling
 * the gateway for recent un-captured orders, retries failed webhooks and
 * failed refunds.
 */
export async function reconcilePayments() {
  const stale = await prisma.payment.findMany({
    where: { status: { in: ["CREATED", "AUTHORIZED", "FAILED"] }, createdAt: { lt: new Date(Date.now() - 5 * 60_000), gt: new Date(Date.now() - 3 * 24 * 3600_000) } },
    take: 100,
  });
  let recovered = 0;
  for (const p of stale) {
    try {
      const payments = await paymentProvider.fetchOrderPayments(p.providerOrderId);
      const ok = payments.find((x) => x.status === "captured");
      if (ok) {
        await markCaptured({ orderId: p.providerOrderId, providerPaymentId: ok.id, amount: ok.amount, method: ok.method });
        recovered++;
      }
    } catch (err) {
      logger.warn({ err, paymentId: p.id }, "reconcile fetch failed");
    }
  }
  const failedHooks = await prisma.webhookEvent.findMany({ where: { status: "FAILED", attempts: { lt: 10 } }, take: 50 });
  for (const h of failedHooks) await processWebhook(h.id);
  const failedRefunds = await prisma.refund.findMany({ where: { status: "FAILED", providerRefundId: null }, take: 50 });
  for (const r of failedRefunds) await executeRefund(r.id);
  return { checked: stale.length, recovered, webhooksRetried: failedHooks.length, refundsRetried: failedRefunds.length };
}

registerJob("payments.reconcile", reconcilePayments);
registerJob("payments.refund.execute", ({ refundId }: { refundId: string }) => executeRefund(refundId));

/** Reconciliation report for admins: gateway payments vs ledger vs payouts. */
export async function reconciliationReport(from: Date, to: Date) {
  const range = { gte: from, lt: to };
  const [payments, refunds, payouts, ledgerRows] = await Promise.all([
    prisma.payment.groupBy({ by: ["status", "purpose"], where: { createdAt: range }, _sum: { amount: true, refundedAmount: true }, _count: true }),
    prisma.refund.groupBy({ by: ["status"], where: { createdAt: range }, _sum: { amount: true }, _count: true }),
    prisma.payout.groupBy({ by: ["status"], where: { createdAt: range }, _sum: { amount: true }, _count: true }),
    prisma.ledgerEntry.groupBy({ by: ["account"], where: { createdAt: range }, _sum: { amount: true } }),
  ]);
  const capturedTotal = payments.filter((p) => p.status !== "CREATED" && p.status !== "FAILED").reduce((s, p) => s + (p._sum.amount ?? 0), 0);
  const ledgerReceived = ledgerRows.find((l) => l.account === "RENTER_PAYMENT")?._sum.amount ?? 0;
  const mismatchedPayments = await prisma.payment.findMany({
    where: { createdAt: range, status: "CAPTURED", ledger: { none: { account: "RENTER_PAYMENT" } } },
    select: { id: true, providerOrderId: true, amount: true },
  });
  return {
    period: { from, to },
    payments,
    refunds,
    payouts,
    ledger: ledgerRows,
    checks: {
      capturedTotal,
      ledgerReceived,
      balanced: capturedTotal === ledgerReceived && mismatchedPayments.length === 0,
      mismatchedPayments,
      pendingRefunds: await prisma.refund.count({ where: { status: { in: ["PENDING", "FAILED"] } } }),
      failedWebhooks: await prisma.webhookEvent.count({ where: { status: "FAILED" } }),
    },
  };
}

export { enqueue };
