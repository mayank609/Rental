/**
 * Loads admin-configurable settings from the DB (merged over defaults) with a
 * short in-process cache. Writes invalidate the cache and are audited.
 */
import { prisma } from "../../lib/prisma";
import { DEFAULT_SETTINGS, PlatformSettings, SettingsKey, SETTINGS_KEYS } from "./settings.defaults";
import { kv } from "../../lib/redis";

let cache: { value: PlatformSettings; at: number; version: string } | null = null;
const TTL_MS = 30_000;

function deepMerge<T>(base: T, override: unknown): T {
  if (Array.isArray(base) || typeof base !== "object" || base === null) {
    return (override ?? base) as T;
  }
  if (typeof override !== "object" || override === null || Array.isArray(override)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export async function getSettings(): Promise<PlatformSettings> {
  const version = (await kv.get("settings:version")) ?? "0";
  if (cache && cache.version === version && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await prisma.platformSetting.findMany();
  let value = structuredClone(DEFAULT_SETTINGS);
  for (const row of rows) {
    if ((SETTINGS_KEYS as string[]).includes(row.key)) {
      value = { ...value, [row.key]: deepMerge(value[row.key as SettingsKey], row.value) };
    }
  }
  cache = { value, at: Date.now(), version };
  return value;
}

export async function updateSetting<K extends SettingsKey>(key: K, value: PlatformSettings[K], actorId: string) {
  const before = await prisma.platformSetting.findUnique({ where: { key } });
  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: value as object, updatedById: actorId },
      update: { value: value as object, updatedById: actorId },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "settings.update",
        entityType: "PlatformSetting",
        entityId: key,
        before: (before?.value as object) ?? undefined,
        after: value as object,
      },
    }),
  ]);
  cache = null;
  await kv.incr("settings:version");
  return getSettings();
}

export function clearSettingsCache() {
  cache = null;
}
