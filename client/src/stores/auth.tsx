/**
 * Auth context: restores the session from the refresh cookie on load,
 * exposes the signed-in user and login/logout helpers.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, refreshAccessToken, setAccessToken, setAuthHandlers } from "@/lib/api";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  setSession: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const setSession = useCallback((token: string, u: User) => {
    setAccessToken(token);
    setUserState(u);
    connectSocket();
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUserState(null);
    disconnectSocket();
    qc.clear();
  }, [qc]);

  const refreshUser = useCallback(async () => {
    const r = await api.get("/auth/me");
    setUserState(r.data.user);
  }, []);

  useEffect(() => {
    setAuthHandlers({
      lost: () => {
        setAccessToken(null);
        setUserState(null);
        disconnectSocket();
      },
      refreshed: (_t, u) => u && setUserState(u as User),
    });
    refreshAccessToken()
      .then((t) => {
        if (t) connectSocket();
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAdmin: user?.role === "ADMIN",
      isStaff: user?.role === "ADMIN" || user?.role === "SUPPORT",
      setSession,
      setUser: setUserState,
      logout,
      refreshUser,
    }),
    [user, loading, setSession, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
