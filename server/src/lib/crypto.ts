/** Hashing, token generation and field-level encryption helpers. */
import crypto from "node:crypto";
import { env } from "../config/env";

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString("base64url");
export const randomDigits = (len = 6) =>
  Array.from({ length: len }, () => crypto.randomInt(0, 10)).join("");

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

const key = () => Buffer.from(env.DATA_ENCRYPTION_KEY, "hex");

/** AES-256-GCM encrypt → base64(iv|tag|ciphertext) */
export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decrypt(payload: string) {
  const buf = Buffer.from(payload, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
