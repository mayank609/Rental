/**
 * CSRF defence for cookie-authenticated endpoints (refresh/logout).
 * API calls use bearer tokens (immune to CSRF); only the refresh cookie is
 * ambient, so we require a trusted Origin + a custom header that browsers
 * never attach to cross-site form posts.
 */
import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { env } from "../config/env";
import { forbidden } from "../lib/errors";

export const allowedOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  const origin = req.headers.origin ?? (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
  if (origin && !allowedOrigins.includes(origin)) return next(forbidden("Origin not allowed", "CSRF"));
  if (req.headers["x-requested-with"] !== "XMLHttpRequest") return next(forbidden("Missing CSRF header", "CSRF"));
  next();
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

/** Client IP — relies on `app.set("trust proxy", …)` so X-Forwarded-For can't be spoofed. */
export const clientIp = (req: Request) => req.ip || req.socket.remoteAddress || "";
