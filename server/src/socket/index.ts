/**
 * socket.io server: authenticated with the same JWT access token, one room
 * per user and per conversation. Uses the Redis adapter so events reach
 * users connected to any API instance (horizontal scaling).
 */
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { verifyAccessToken } from "../middleware/auth";
import { allowedOrigins } from "../middleware/security";
import { newRedisConnection, redis } from "../lib/redis";
import { logger } from "../lib/logger";
import { setIo, userRoom, conversationRoom } from "./emitter";
import { getConversationForUser, sendMessage, markRead } from "../modules/chat/chat.service";
import { assetUrlSchema } from "../lib/assets";

export function initSocket(server: HttpServer) {
  const io = new Server(server, {
    cors: { origin: allowedOrigins, credentials: true },
    path: "/socket.io",
    pingInterval: 25_000,
  });
  if (redis) io.adapter(createAdapter(newRedisConnection(), newRedisConnection()));

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? (socket.handshake.headers.authorization as string | undefined)?.replace(/^Bearer /, "");
    if (!token) return next(new Error("unauthorized"));
    try {
      socket.data.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { id: string };
    socket.join(userRoom(user.id));

    socket.on("chat:join", async (conversationId: string, ack?: (r: unknown) => void) => {
      try {
        await getConversationForUser(conversationId, user.id);
        socket.join(conversationRoom(conversationId));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });
    socket.on("chat:leave", (conversationId: string) => socket.leave(conversationRoom(conversationId)));

    socket.on("chat:send", async (p: { conversationId: string; body: string; attachments?: string[] }, ack?: (r: unknown) => void) => {
      try {
        const attachments = (p.attachments ?? []).slice(0, 5).map((a) => assetUrlSchema.parse(a));
        const message = await sendMessage(p.conversationId, user.id, String(p.body ?? ""), attachments);
        ack?.({ ok: true, message });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });
    socket.on("chat:typing", (conversationId: string) => {
      socket.to(conversationRoom(conversationId)).emit("chat:typing", { conversationId, userId: user.id });
    });
    socket.on("chat:read", async (conversationId: string) => {
      await markRead(conversationId, user.id).catch(() => undefined);
    });
  });

  setIo(io);
  logger.info("socket.io ready");
  return io;
}
