/** Lazily-connected socket.io client authenticated with the access token. */
import { io, type Socket } from "socket.io-client";
import { getAccessToken, refreshAccessToken } from "./api";

let socket: Socket | null = null;

export function getSocket() {
  if (socket) return socket;
  socket = io(import.meta.env.VITE_API_URL ?? "", {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: false,
    auth: (cb) => cb({ token: getAccessToken() }),
  });
  socket.on("connect_error", async (err) => {
    if (err.message === "unauthorized") {
      const t = await refreshAccessToken();
      if (t) setTimeout(() => socket?.connect(), 500);
    }
  });
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
