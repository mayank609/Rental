/**
 * Registers all background job handlers and repeatable schedules.
 * Imported by the worker process (and the API when RUN_WORKERS_IN_API).
 */
import { Worker } from "bullmq";
import { queue, QUEUE_NAME, registerJob, getHandler } from "../lib/queue";
import { newRedisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import * as Sentry from "@sentry/node";

// Side-effect imports register their job handlers
import "../modules/notifications/notifications.service";
import "../modules/payments/payments.service";
import "../modules/payouts/payouts.service";
import "../modules/invoices/invoices.service";
import "../modules/monetization/monetization.routes";
import { expireStaleBookings, sendReminders, handleOverdue, autoCompleteInspections } from "../modules/bookings/bookings.service";

registerJob("bookings.expire", expireStaleBookings);
registerJob("bookings.reminders", sendReminders);
registerJob("bookings.overdue", handleOverdue);
registerJob("bookings.autocomplete", autoCompleteInspections);

/** Cron-like schedules (every N ms). */
export const SCHEDULES: { name: string; every: number }[] = [
  { name: "bookings.expire", every: 5 * 60_000 },
  { name: "bookings.reminders", every: 15 * 60_000 },
  { name: "bookings.overdue", every: 30 * 60_000 },
  { name: "bookings.autocomplete", every: 30 * 60_000 },
  { name: "payments.reconcile", every: 10 * 60_000 },
  { name: "payouts.process", every: 60 * 60_000 },
  { name: "monetization.expire", every: 60 * 60_000 },
];

export async function startWorkers() {
  if (!queue) {
    logger.warn("Redis disabled — using in-process timers for scheduled jobs");
    for (const s of SCHEDULES) {
      setInterval(() => getHandler(s.name)?.({}).catch((err) => logger.error({ err, job: s.name }, "job failed")), s.every).unref();
    }
    return null;
  }
  for (const s of SCHEDULES) {
    await queue.upsertJobScheduler(s.name, { every: s.every }, { name: s.name, data: {} });
  }
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const handler = getHandler(job.name);
      if (!handler) throw new Error(`No handler for job ${job.name}`);
      return handler(job.data);
    },
    { connection: newRedisConnection(), concurrency: 8 },
  );
  worker.on("failed", (job, err) => {
    logger.error({ job: job?.name, id: job?.id, err: err.message }, "job failed");
    Sentry.captureException(err, { tags: { job: job?.name } });
  });
  worker.on("completed", (job, result) => logger.debug({ job: job.name, result }, "job completed"));
  logger.info({ schedules: SCHEDULES.length }, "background workers started");
  return worker;
}
