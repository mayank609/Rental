/**
 * Axios client for /api/v1.
 * - Access token kept in memory only (never localStorage → XSS-resistant).
 * - On 401 the refresh cookie is exchanged for a new token once (single
 *   flight) and the request is retried transparently.
 */
import axios, { AxiosError, type AxiosRequestConfig } from "axios";

export const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;
let onTokenRefreshed: ((token: string, user: unknown) => void) | null = null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;
export const setAuthHandlers = (h: { lost: () => void; refreshed: (token: string, user: unknown) => void }) => {
  onAuthLost = h.lost;
  onTokenRefreshed = h.refreshed;
};

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "X-Requested-With": "XMLHttpRequest" },
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  refreshing ??= axios
    .post(`${API_BASE}/auth/refresh`, null, { withCredentials: true, headers: { "X-Requested-With": "XMLHttpRequest" } })
    .then((r) => {
      accessToken = r.data.accessToken;
      onTokenRefreshed?.(r.data.accessToken, r.data.user);
      return accessToken;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const url = original?.url ?? "";
    if (error.response?.status === 401 && original && !original._retried && !url.includes("/auth/")) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${token}` };
        return api.request(original);
      }
      onAuthLost?.();
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/** Human-readable message from any API error. */
export function apiError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return navigator.onLine ? "Can't reach the server. Please try again." : "You're offline. Check your connection.";
    const body = err.response.data as ApiErrorBody;
    const details = body?.error?.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
    const firstField = details?.fieldErrors && Object.values(details.fieldErrors).flat()[0];
    return firstField || body?.error?.message || fallback;
  }
  return (err as Error)?.message || fallback;
}

export const apiErrorCode = (err: unknown) => (axios.isAxiosError(err) ? (err.response?.data as ApiErrorBody)?.error?.code : undefined);

/** Build an absolute URL for server assets (uploads etc.). */
export const assetUrl = (u?: string | null) => u ?? "";
