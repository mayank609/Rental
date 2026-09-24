/**
 * Versioned read-through cache. Listing-page caches are invalidated in O(1)
 * by bumping a namespace version instead of scanning keys.
 */
import { kv } from "./redis";
import { logger } from "./logger";

async function nsVersion(ns: string) {
  return (await kv.get(`cachev:${ns}`)) ?? "0";
}

export async function cached<T>(ns: string, key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  try {
    const v = await nsVersion(ns);
    const full = `cache:${ns}:${v}:${key}`;
    const hit = await kv.get(full);
    if (hit) return JSON.parse(hit) as T;
    const value = await fn();
    await kv.set(full, JSON.stringify(value), ttlSeconds);
    return value;
  } catch (err) {
    logger.warn({ err }, "cache failure, falling through");
    return fn();
  }
}

export async function invalidate(ns: string) {
  try {
    await kv.incr(`cachev:${ns}`);
  } catch (err) {
    logger.warn({ err }, "cache invalidate failed");
  }
}
