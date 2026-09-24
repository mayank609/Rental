/** /api/v1/chat — conversations & messages (real-time via socket.io). */
import { Router } from "express";
import { z } from "zod";
import { assetUrlSchema } from "../../lib/assets";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { prisma } from "../../lib/prisma";
import * as svc from "./chat.service";

export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.get("/conversations", async (req, res) => {
  const uid = req.user!.id;
  const convs = await prisma.conversation.findMany({
    where: { OR: [{ renterId: uid }, { ownerId: uid }] },
    include: {
      listing: { select: { id: true, title: true, images: { select: { thumbUrl: true }, take: 1, orderBy: { sortOrder: "asc" } } } },
      renter: { select: { id: true, name: true, avatarUrl: true } },
      owner: { select: { id: true, name: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  const unread = await prisma.message.groupBy({
    by: ["conversationId"],
    where: { conversationId: { in: convs.map((c) => c.id) }, senderId: { not: uid }, readAt: null },
    _count: true,
  });
  const unreadMap = new Map(unread.map((u) => [u.conversationId, u._count]));
  res.json({
    conversations: convs.map((c) => ({
      id: c.id,
      listing: c.listing ? { id: c.listing.id, title: c.listing.title, image: c.listing.images[0]?.thumbUrl ?? null } : null,
      counterparty: c.renterId === uid ? c.owner : c.renter,
      viewerRole: c.renterId === uid ? "RENTER" : "OWNER",
      lastMessage: c.messages[0] ?? null,
      lastMessageAt: c.lastMessageAt,
      unread: unreadMap.get(c.id) ?? 0,
    })),
  });
});

chatRouter.post("/conversations", validate({ body: z.object({ listingId: z.string() }) }), async (req, res) => {
  const c = await svc.startConversation(req.user!.id, req.body.listingId);
  res.status(201).json({ conversation: c });
});

chatRouter.get("/conversations/:id", async (req, res) => {
  const c = await svc.getConversationForUser(req.params.id, req.user!.id);
  const full = await prisma.conversation.findUniqueOrThrow({
    where: { id: c.id },
    include: {
      listing: { select: { id: true, title: true, images: { select: { thumbUrl: true }, take: 1 } } },
      renter: { select: { id: true, name: true, avatarUrl: true } },
      owner: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
  const bookings = await prisma.booking.findMany({
    where: { renterId: c.renterId, ownerId: c.ownerId, listingId: c.listingId ?? undefined },
    select: { id: true, code: true, status: true, startAt: true, endAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  res.json({
    conversation: { ...full, viewerRole: c.renterId === req.user!.id ? "RENTER" : "OWNER", contactSharingAllowed: await svc.hasConfirmedBooking(c.renterId, c.ownerId) },
    bookings,
  });
});

chatRouter.get(
  "/conversations/:id/messages",
  validate({ query: z.object({ before: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }) }),
  async (req, res) => {
    await svc.getConversationForUser(req.params.id, req.user!.id);
    const q = req.query as unknown as { before?: string; limit: number };
    const cursor = q.before ? await prisma.message.findUnique({ where: { id: q.before } }) : null;
    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id, ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}) },
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: q.limit,
    });
    res.json({ messages: messages.reverse(), hasMore: messages.length === q.limit });
  },
);

chatRouter.post(
  "/conversations/:id/messages",
  validate({ body: z.object({ body: z.string().max(2000).default(""), attachments: z.array(assetUrlSchema).max(5).default([]) }) }),
  async (req, res) => {
    const m = await svc.sendMessage(req.params.id, req.user!.id, req.body.body, req.body.attachments);
    res.status(201).json({ message: m });
  },
);

chatRouter.post("/conversations/:id/read", async (req, res) => {
  res.json({ marked: await svc.markRead(req.params.id, req.user!.id) });
});

chatRouter.get("/unread-count", async (req, res) => {
  const uid = req.user!.id;
  const count = await prisma.message.count({
    where: { senderId: { not: uid }, readAt: null, conversation: { OR: [{ renterId: uid }, { ownerId: uid }] } },
  });
  res.json({ count });
});
