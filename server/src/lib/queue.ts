/**
 * Background jobs via BullMQ. When Redis is disabled (tests), jobs run
 * in-process on the next tick so behaviour stays identical.
 */
import { Queue, JobsOptions } from "bullmq";
import { redis, newRedisConnection } from "./redis";
import { logger } from "./logger";

export type JobHandler = (data: any) => Promise<unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any

const handlers = new Map<string, JobHandler>();
export const QUEUE_NAME = "rentnest";

export const queue: Queue | null = redis ? new Queue(QUEUE_NAME, { connection: newRedisConnection() }) : null;

export function registerJob(name: string, handler: JobHandler) {
  handlers.set(name, handler);
}

export function getHandler(name: string) {
  return handlers.get(name);
}

export async function enqueue(name: string, data: unknown = {}, opts: JobsOptions = {}) {
  if (queue) {
    await queue.add(name, data, {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
      ...opts,
    });
    return;
  }
  const h = handlers.get(name);
  if (!h) return;
  setImmediate(() => {
    h(data).catch((err) => logger.error({ err, job: name }, "inline job failed"));
  });
}
