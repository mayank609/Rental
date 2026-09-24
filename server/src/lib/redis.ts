/**
 * Redis connection with a tiny in-memory fallback so the API still works
 * (without caching/queues) when Redis is disabled, e.g. in unit tests.
 */
import Redis from "ioredis";
import { env } from "../config/env";
import { logger } from "./logger";

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
}

class MemoryKV implements KV {
  private store = new Map<string, { v: string; exp?: number }>();
  private alive(key: string) {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.exp && e.exp < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }
  async get(key: string) {
    return this.alive(key)?.v ?? null;
  }
  async set(key: string, value: string, ttl?: number) {
    this.store.set(key, { v: value, exp: ttl ? Date.now() + ttl * 1000 : undefined });
  }
  async del(key: string) {
    this.store.delete(key);
  }
  async incr(key: string, ttl?: number) {
    const cur = Number(this.alive(key)?.v ?? 0) + 1;
    const existing = this.alive(key);
    this.store.set(key, { v: String(cur), exp: existing?.exp ?? (ttl ? Date.now() + ttl * 1000 : undefined) });
    return cur;
  }
}

class RedisKV implements KV {
  constructor(private r: Redis) {}
  async get(key: string) {
    return this.r.get(key);
  }
  async set(key: string, value: string, ttl?: number) {
    if (ttl) await this.r.set(key, value, "EX", ttl);
    else await this.r.set(key, value);
  }
  async del(key: string) {
    await this.r.del(key);
  }
  async incr(key: string, ttl?: number) {
    const v = await this.r.incr(key);
    if (v === 1 && ttl) await this.r.expire(key, ttl);
    return v;
  }
}

export const redis: Redis | null = env.REDIS_DISABLED
  ? null
  : new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });

redis?.on("error", (err) => logger.error({ err: err.message }, "redis error"));

export const kv: KV = redis ? new RedisKV(redis) : new MemoryKV();

/** Create a new dedicated connection (BullMQ / socket.io adapter need their own). */
export const newRedisConnection = () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
