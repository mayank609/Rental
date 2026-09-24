import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

/** Subscribe to a socket.io event for the component lifetime. */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event, handler]);
}
