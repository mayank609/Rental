/**
 * In-app chat between renter and owner. Until a booking between the two is
 * confirmed (paid), phone numbers / emails / UPI IDs / links are masked to
 * keep payments on-platform; repeated attempts raise a trust flag.
 */
import { prisma } from "../../lib/prisma";
import { forbidden, notFound, badRequest } from "../../lib/errors";
import { emitToRoom, emitToUser, conversationRoom } from "../../socket/emitter";
import { isBlockedBetween, maskContactInfo, recordOffPlatformAttempt } from "../trust/trust.service";
import { notify } from "../notifications/notifications.service";
import { kv } from "../../lib/redis";

export async function getConversationForUser(conversationId: string, userId: string) {
  const c = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!c || (c.renterId !== userId && c.ownerId !== userId)) throw notFound("Conversation");
  return c;
}

export async function hasConfirmedBooking(renterId: string, ownerId: string) {
  const n = await prisma.booking.count({
    where: { renterId, ownerId, status: { in: ["CONFIRMED", "ACTIVE", "OVERDUE", "RETURNED", "COMPLETED", "DISPUTED"] } },
  });
  return n > 0;
}

export async function startConversation(userId: string, listingId: string) {
  const listing = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } });
  if (!listing) throw notFound("Listing");
  if (listing.ownerId === userId) throw badRequest("You can't message yourself");
  if (await isBlockedBetween(userId, listing.ownerId)) throw forbidden("You can't message this user");
  return prisma.conversation.upsert({
    where: { listingId_renterId: { listingId, renterId: userId } },
    create: { listingId, renterId: userId, ownerId: listing.ownerId },
    update: {},
  });
}

export async function sendMessage(conversationId: string, senderId: string, body: string, attachments: string[] = []) {
  const text = body.trim();
  if (!text && !attachments.length) throw badRequest("Message is empty");
  if (text.length > 2000) throw badRequest("Message is too long");
  const c = await getConversationForUser(conversationId, senderId);
  if (await isBlockedBetween(c.renterId, c.ownerId)) throw forbidden("You can't message this user");

  // Basic flood protection: 20 messages / minute / user
  if ((await kv.incr(`chatrate:${senderId}`, 60)) > 20) throw badRequest("You're sending messages too quickly");

  let finalBody = text;
  let wasMasked = false;
  if (!(await hasConfirmedBooking(c.renterId, c.ownerId))) {
    const m = maskContactInfo(text);
    if (m.wasMasked) {
      finalBody = m.masked;
      wasMasked = true;
      await recordOffPlatformAttempt(senderId, m.hits);
    }
  }
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, senderId, body: finalBody, wasMasked, attachments },
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
  ]);
  const recipient = senderId === c.renterId ? c.ownerId : c.renterId;
  emitToRoom(conversationRoom(conversationId), "chat:message", message);
  emitToUser(recipient, "chat:message", message);

  // Push notification only if the recipient hasn't been active in the thread
  const recentlyNotified = await kv.get(`chatnotify:${conversationId}:${recipient}`);
  if (!recentlyNotified) {
    await kv.set(`chatnotify:${conversationId}:${recipient}`, "1", 300);
    await notify(recipient, "message.new", {
      title: `New message from ${message.sender.name}`,
      body: finalBody.slice(0, 120),
      url: `/dashboard/messages/${conversationId}`,
      data: { conversationId },
    });
  }
  return message;
}

export async function markRead(conversationId: string, userId: string) {
  await getConversationForUser(conversationId, userId);
  const res = await prisma.message.updateMany({ where: { conversationId, senderId: { not: userId }, readAt: null }, data: { readAt: new Date() } });
  if (res.count) emitToRoom(conversationRoom(conversationId), "chat:read", { conversationId, userId, at: new Date() });
  return res.count;
}
