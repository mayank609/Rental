/**
 * JWT authentication & role-based access control.
 * Access tokens are short-lived bearer tokens; refresh tokens live in an
 * httpOnly cookie and are rotated on every use (see auth.service.ts).
 */
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env";
import { forbidden, unauthorized } from "../lib/errors";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export interface AccessPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, role: user.role } satisfies AccessPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    issuer: "rentnest",
  });
}

export function verifyAccessToken(token: string): AuthUser {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "rentnest" }) as AccessPayload;
  return { id: payload.sub, role: payload.role };
}

function extractToken(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

/** Populate req.user when a valid token is present; never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      /* ignore invalid token for optional routes */
    }
  }
  next();
}

/** Require a valid access token and an ACTIVE account. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(unauthorized());
  try {
    req.user = verifyAccessToken(token);
  } catch {
    return next(unauthorized("Session expired, please sign in again"));
  }
  // Cheap status check so bans take effect immediately (not after token expiry).
  const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { status: true, role: true } });
  if (!u || u.status === "DELETED") return next(unauthorized());
  if (u.status === "BANNED" || u.status === "SUSPENDED") {
    return next(forbidden("Your account is restricted. Contact support.", "ACCOUNT_RESTRICTED"));
  }
  req.user.role = u.role;
  next();
}

/** Restrict a route to specific roles (ADMIN always passes). */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === "ADMIN" || roles.includes(req.user.role)) return next();
    next(forbidden());
  };

/** Mandatory phone verification before listing or booking. */
export async function requirePhoneVerified(req: Request, _res: Response, next: NextFunction) {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { phoneVerifiedAt: true } });
  if (!u?.phoneVerifiedAt) {
    return next(forbidden("Please verify your phone number to continue", "PHONE_VERIFICATION_REQUIRED"));
  }
  next();
}
