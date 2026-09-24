/**
 * Delivery channels: email (SMTP), SMS / WhatsApp (MSG91 or Twilio) and
 * Web Push (VAPID). Every channel degrades to logging when unconfigured so
 * development works without third-party accounts.
 */
import nodemailer from "nodemailer";
import webpush from "web-push";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";

const mailer = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  if (!mailer) {
    logger.info({ to, subject }, "📧 [email:console] " + text.slice(0, 200));
    return;
  }
  await mailer.sendMail({ from: env.EMAIL_FROM, to, subject, text, html: html ?? emailTemplate(subject, text) });
}

export function emailTemplate(title: string, body: string, cta?: { label: string; url: string }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:24px">
  <table width="100%" style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:28px">
  <tr><td><h2 style="color:#4f46e5;margin:0 0 4px">${esc(env.PLATFORM_NAME)}</h2>
  <h3 style="margin:16px 0 8px;color:#111">${esc(title)}</h3>
  <p style="color:#374151;line-height:1.6;white-space:pre-line">${esc(body)}</p>
  ${cta ? `<p><a href="${esc(cta.url)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${esc(cta.label)}</a></p>` : ""}
  <p style="color:#9ca3af;font-size:12px;margin-top:24px">${esc(env.COMPANY_LEGAL_NAME)} · ${esc(env.COMPANY_ADDRESS)}</p>
  </td></tr></table></body></html>`;
}

export async function sendSms(phone: string, text: string, opts: { whatsapp?: boolean; otp?: string } = {}) {
  try {
    if (env.SMS_PROVIDER === "msg91" && env.MSG91_AUTH_KEY) {
      // MSG91 Flow API (DLT-approved template required in India)
      await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { authkey: env.MSG91_AUTH_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          template_id: env.MSG91_TEMPLATE_ID,
          recipients: [{ mobiles: phone.replace(/^\+/, ""), message: text, otp: opts.otp }],
        }),
      });
      return;
    }
    if (env.SMS_PROVIDER === "twilio" && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      const from = opts.whatsapp ? `whatsapp:${env.TWILIO_WHATSAPP_FROM}` : env.TWILIO_FROM!;
      const to = opts.whatsapp ? `whatsapp:${phone}` : phone;
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: from, To: to, Body: text }),
      });
      return;
    }
  } catch (err) {
    logger.error({ err }, "sms send failed");
    throw err;
  }
  logger.info({ phone: phone.replace(/.(?=.{4})/g, "*") }, `📱 [${opts.whatsapp ? "whatsapp" : "sms"}:console] ${text}`);
}

const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (pushEnabled) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

export async function sendPush(userId: string, payload: { title: string; body: string; url?: string }) {
  if (!pushEnabled) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      }
    }),
  );
}
