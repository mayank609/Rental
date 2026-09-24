/**
 * Owner payouts (escrow release).
 *
 * A PENDING payout is created when a booking is paid. On completion it is
 * SCHEDULED (after a configurable delay), disputes put it ON_HOLD, and the
 * payout job transfers the net amount (including negative adjustments such
 * as owner cancellation penalties) to the owner's linked account.
 */
import { prisma, Tx } from "../../lib/prisma";
import { registerJob } from "../../lib/queue";
import { logger } from "../../lib/logger";
import { env } from "../../config/env";
import { paymentProvider } from "../payments/provider";
import { ledger } from "../payments/payments.service";
import { notify } from "../notifications/notifications.service";
import { formatMoney } from "../../lib/util";
import { decrypt } from "../../lib/crypto";
import { getSettings } from "../settings/settings.service";

export async function createPendingPayout(bookingId: string, ownerId: string, amount: number, tx: Tx = prisma) {
  const existing = await tx.payout.findFirst({ where: { bookingId, status: { notIn: ["CANCELLED"] }, amount: { gt: 0 } } });
  if (existing) return existing;
  return tx.payout.create({ data: { bookingId, ownerId, amount, status: "PENDING" } });
}

/** Release the booking's payout after completion (optionally adjusting amount). */
export async function scheduleBookingPayout(bookingId: string, amount: number, note?: string, tx: Tx = prisma) {
  const { booking } = await getSettings();
  const scheduledFor = new Date(Date.now() + booking.payoutDelayHours * 3600_000);
  const p = await tx.payout.findFirst({ where: { bookingId, status: { in: ["PENDING", "ON_HOLD"] }, amount: { gte: 0 } } });
  const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (p) {
    return tx.payout.update({ where: { id: p.id }, data: { amount, status: amount > 0 ? "SCHEDULED" : "CANCELLED", scheduledFor, note } });
  }
  if (amount <= 0) return null;
  return tx.payout.create({ data: { bookingId, ownerId: b.ownerId, amount, status: "SCHEDULED", scheduledFor, note } });
}

export async function holdBookingPayout(bookingId: string, reason: string, tx: Tx = prisma) {
  await tx.payout.updateMany({ where: { bookingId, status: { in: ["PENDING", "SCHEDULED"] } }, data: { status: "ON_HOLD", note: reason } });
}

export async function cancelBookingPayout(bookingId: string, tx: Tx = prisma) {
  await tx.payout.updateMany({ where: { bookingId, status: { in: ["PENDING", "SCHEDULED", "ON_HOLD"] } }, data: { status: "CANCELLED" } });
}

/** Negative adjustment netted against the owner's next payout. */
export async function addOwnerPenalty(ownerId: string, bookingId: string, amount: number, note: string, tx: Tx = prisma) {
  if (amount <= 0) return;
  await tx.payout.create({ data: { ownerId, bookingId, amount: -amount, status: "SCHEDULED", scheduledFor: new Date(), note } });
  await ledger([{ account: "PENALTY", amount, description: note, bookingId }], tx);
}

/**
 * Transfer all due payouts, netted per owner. Owners without a verified
 * payout account stay ON_HOLD until onboarding completes.
 */
export async function processDuePayouts() {
  const due = await prisma.payout.findMany({
    where: { status: { in: ["SCHEDULED", "FAILED"] }, scheduledFor: { lte: new Date() }, attempts: { lt: 5 } },
    orderBy: { createdAt: "asc" },
  });
  const byOwner = new Map<string, typeof due>();
  for (const p of due) byOwner.set(p.ownerId, [...(byOwner.get(p.ownerId) ?? []), p]);

  let paid = 0;
  for (const [ownerId, items] of byOwner) {
    const net = items.reduce((s, p) => s + p.amount, 0);
    if (net <= 0) continue; // carry forward until earnings exceed penalties
    const account = await prisma.payoutAccount.findUnique({ where: { userId: ownerId } });
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    if (!account || account.status !== "VERIFIED" || owner.status === "BANNED") {
      await prisma.payout.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { status: "ON_HOLD", note: "Complete payout onboarding (KYC & bank details) to receive payouts" } });
      continue;
    }
    const ids = items.map((i) => i.id);
    await prisma.payout.updateMany({ where: { id: { in: ids } }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    try {
      let accountId = account.providerAccountId;
      if (!accountId) {
        const created = await paymentProvider.createLinkedAccount({
          email: owner.email,
          phone: owner.phone,
          name: account.accountHolderName,
          ifsc: account.ifsc,
          accountNumber: account.accountNumberEnc ? decrypt(account.accountNumberEnc) : null,
          upiId: account.upiId,
          referenceId: ownerId,
        });
        accountId = created.accountId;
        await prisma.payoutAccount.update({ where: { id: account.id }, data: { providerAccountId: accountId } });
      }
      const { transferId } = await paymentProvider.transfer({ accountId, amount: net, currency: env.CURRENCY, idempotencyKey: `payout:${ids.join(",")}`.slice(0, 60), notes: { ownerId } });
      const done = paymentProvider.name === "mock";
      await prisma.payout.updateMany({
        where: { id: { in: ids } },
        data: { status: done ? "PAID" : "PROCESSING", providerTransferId: transferId, paidAt: done ? new Date() : null, failureReason: null },
      });
      await ledger([{ account: "PAYOUT", amount: -net, description: `Payout to owner ${ownerId} (${transferId})` }]);
      await notify(ownerId, "payout.paid", { title: "Payout sent", body: `${formatMoney(net)} has been sent to your ${account.method === "UPI" ? "UPI ID" : "bank account"}.`, url: "/dashboard/earnings" });
      paid++;
    } catch (err) {
      logger.error({ err, ownerId }, "payout transfer failed");
      await prisma.payout.updateMany({ where: { id: { in: ids } }, data: { status: "FAILED", failureReason: (err as Error).message.slice(0, 500) } });
      await notify(ownerId, "payout.failed", { title: "Payout failed", body: "We couldn't send your payout. We'll retry automatically — please check your payout details.", url: "/dashboard/earnings" });
    }
  }
  return { owners: byOwner.size, paid };
}

registerJob("payouts.process", processDuePayouts);

/** When an owner completes onboarding, release payouts that were on hold. */
export async function releaseHeldPayouts(ownerId: string) {
  await prisma.payout.updateMany({
    where: { ownerId, status: "ON_HOLD", note: { startsWith: "Complete payout onboarding" } },
    data: { status: "SCHEDULED", scheduledFor: new Date() },
  });
}

export async function ownerEarningsSummary(ownerId: string) {
  const groups = await prisma.payout.groupBy({ by: ["status"], where: { ownerId }, _sum: { amount: true }, _count: true });
  const sum = (...s: string[]) => groups.filter((g) => s.includes(g.status)).reduce((a, g) => a + (g._sum.amount ?? 0), 0);
  return {
    paid: sum("PAID"),
    upcoming: sum("SCHEDULED", "PROCESSING"),
    pending: sum("PENDING"),
    onHold: sum("ON_HOLD"),
    failed: sum("FAILED"),
    currency: env.CURRENCY,
  };
}
