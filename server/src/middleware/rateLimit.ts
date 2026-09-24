/** Redis-backed rate limiters (memory store when Redis disabled). */
import rateLimit, { Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../lib/redis";
import { isTest } from "../config/env";

function make(prefix: string, opts: Partial<Options>) {
  return rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => isTest,
    message: { error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" } },
    store: redis
      ? new RedisStore({
          prefix: `rl:${prefix}:`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sendCommand: (...args: string[]) => (redis as any).call(...args),
        })
      : undefined,
    ...opts,
  });
}

export const globalLimiter = make("global", { windowMs: 60_000, limit: 300 });
export const authLimiter = make("auth", { windowMs: 15 * 60_000, limit: 30 });
export const otpLimiter = make("otp", { windowMs: 60 * 60_000, limit: 8 });
export const writeLimiter = make("write", { windowMs: 60_000, limit: 60 });
export const uploadLimiter = make("upload", { windowMs: 60_000, limit: 40 });
