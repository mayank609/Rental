/**
 * One-time passwords stored (hashed) in Redis with TTL, attempt limits and
 * resend cool-down. Never persisted in the database.
 */
import { kv } from "../../lib/redis";
import { randomDigits, sha256, safeEqual } from "../../lib/crypto";
import { env, isProd } from "../../config/env";
import { tooMany, unprocessable } from "../../lib/errors";
import { sendEmail, sendSms } from "../notifications/channels";

export type OtpPurpose = "login" | "verify_phone" | "verify_email" | "reset_password";
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN = 30;

const key = (purpose: OtpPurpose, target: string) => `otp:${purpose}:${target.toLowerCase()}`;

export async function issueOtp(purpose: OtpPurpose, target: string, channel: "sms" | "email") {
  const cooldownKey = `${key(purpose, target)}:cd`;
  if (await kv.get(cooldownKey)) throw tooMany("Please wait before requesting another code");
  const code = env.NODE_ENV === "test" ? "123456" : randomDigits(6);
  await kv.set(key(purpose, target), JSON.stringify({ h: sha256(code), a: 0 }), env.OTP_TTL_SECONDS);
  await kv.set(cooldownKey, "1", RESEND_COOLDOWN);

  const msg = `${code} is your ${env.PLATFORM_NAME} verification code. It expires in ${Math.round(env.OTP_TTL_SECONDS / 60)} minutes. Never share it with anyone.`;
  if (channel === "sms") await sendSms(target, msg, { otp: code });
  else await sendEmail(target, `${env.PLATFORM_NAME} verification code`, msg);

  return { expiresIn: env.OTP_TTL_SECONDS, ...(env.OTP_DEV_ECHO && !isProd ? { devCode: code } : {}) };
}

export async function verifyOtp(purpose: OtpPurpose, target: string, code: string) {
  const k = key(purpose, target);
  const raw = await kv.get(k);
  if (!raw) throw unprocessable("Code expired or not requested", "OTP_EXPIRED");
  const rec = JSON.parse(raw) as { h: string; a: number };
  if (rec.a >= MAX_ATTEMPTS) {
    await kv.del(k);
    throw tooMany("Too many incorrect attempts. Request a new code.");
  }
  if (!safeEqual(rec.h, sha256(code))) {
    rec.a += 1;
    await kv.set(k, JSON.stringify(rec), env.OTP_TTL_SECONDS);
    throw unprocessable("Incorrect code", "OTP_INVALID");
  }
  await kv.del(k);
  return true;
}
