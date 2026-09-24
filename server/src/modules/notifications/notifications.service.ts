/**
 * notify() is the single entry point for user notifications:
 *   1. persists an in-app notification
 *   2. pushes it over socket.io in real time
 *   3. fans out email / SMS / WhatsApp / web-push via the job queue,
 *      honouring the user's per-channel preferences.
 */
import { prisma } from "../../lib/prisma";
import { enqueue, registerJob } from "../../lib/queue";
import { emitToUser } from "../../socket/emitter";
import { env } from "../../config/env";
import { emailTemplate, sendEmail, sendPush, sendSms } from "./channels";

export type Channel = "email" | "sms" | "whatsapp" | "push";

export type NotificationType =
  | "booking.requested"
  | "booking.accepted"
  | "booking.declined"
  | "booking.expired"
  | "booking.cancelled"
  | "booking.confirmed"
  | "booking.handover"
  | "booking.returned"
  | "booking.completed"
  | "booking.reminder"
  | "booking.overdue"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded"
  | "payout.scheduled"
  | "payout.paid"
  | "payout.failed"
  | "message.new"
  | "review.new"
  | "dispute.opened"
  | "dispute.updated"
  | "listing.approved"
  | "listing.rejected"
  | "kyc.updated"
  | "account.security"
  | "system";

/** Default channels per notification type (users can switch channels off). */
const DEFAULT_CHANNELS: Partial<Record<NotificationType, Channel[]>> = {
  "booking.requested": ["email", "sms", "push"],
  "booking.accepted": ["email", "sms", "push"],
  "booking.confirmed": ["email", "whatsapp", "push"],
  "booking.cancelled": ["email", "sms", "push"],
  "booking.reminder": ["sms", "push", "whatsapp"],
  "booking.overdue": ["email", "sms", "whatsapp", "push"],
  "payment.succeeded": ["email"],
  "payment.refunded": ["email"],
  "payout.paid": ["email", "push"],
  "payout.failed": ["email"],
  "message.new": ["push"],
  "dispute.opened": ["email", "push"],
  "dispute.updated": ["email", "push"],
  "listing.rejected": ["email"],
  "account.security": ["email"],
};

export interface NotifyInput {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  url?: string; // Deep link path in the web app
  channels?: Channel[];
}

export async function notify(userId: string, type: NotificationType, input: NotifyInput) {
  const n = await prisma.notification.create({
    data: { userId, type, title: input.title, body: input.body, data: { ...(input.data ?? {}), url: input.url } as object },
  });
  emitToUser(userId, "notification", n);
  const channels = input.channels ?? DEFAULT_CHANNELS[type] ?? [];
  if (channels.length) await enqueue("notification.deliver", { notificationId: n.id, channels });
  return n;
}

registerJob("notification.deliver", async ({ notificationId, channels }: { notificationId: string; channels: Channel[] }) => {
  const n = await prisma.notification.findUnique({ where: { id: notificationId }, include: { user: true } });
  if (!n || n.user.status === "DELETED") return;
  const prefs = (n.user.notificationPrefs ?? {}) as Partial<Record<Channel, boolean>>;
  const url = `${env.APP_URL}${(n.data as { url?: string }).url ?? "/dashboard/notifications"}`;
  const on = (c: Channel) => channels.includes(c) && prefs[c] !== false;

  const tasks: Promise<unknown>[] = [];
  if (on("email") && n.user.email) {
    tasks.push(sendEmail(n.user.email, n.title, `${n.body}\n\n${url}`, emailTemplate(n.title, n.body, { label: "Open", url })));
  }
  if (on("sms") && n.user.phone) tasks.push(sendSms(n.user.phone, `${env.PLATFORM_NAME}: ${n.body}`));
  if (on("whatsapp") && n.user.phone) tasks.push(sendSms(n.user.phone, `${n.title}\n${n.body}\n${url}`, { whatsapp: true }));
  if (on("push")) tasks.push(sendPush(n.userId, { title: n.title, body: n.body, url }));
  await Promise.all(tasks);
});
