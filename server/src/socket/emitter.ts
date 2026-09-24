/**
 * Emit real-time events to users from anywhere (API or worker process).
 * In the API process we use the live socket.io server; in the worker we use
 * the Redis emitter which publishes through the socket.io Redis adapter.
 */
import type { Server } from "socket.io";
import { Emitter } from "@socket.io/redis-emitter";
import { newRedisConnection, redis } from "../lib/redis";

let io: Server | null = null;
let emitter: Emitter | null = null;

export function setIo(server: Server) {
  io = server;
}

function target() {
  if (io) return io;
  if (!emitter && redis) emitter = new Emitter(newRedisConnection());
  return emitter;
}

export const userRoom = (id: string) => `user:${id}`;
export const conversationRoom = (id: string) => `conversation:${id}`;

export function emitToUser(userId: string, event: string, payload: unknown) {
  target()?.to(userRoom(userId)).emit(event, payload);
}

export function emitToRoom(room: string, event: string, payload: unknown) {
  target()?.to(room).emit(event, payload);
}
