/**
 * Authentication: sessions with rotating refresh tokens.
 *
 * - Access token: JWT, 15 min, sent as Bearer header.
 * - Refresh token: opaque random string, stored hashed, httpOnly cookie.
 *   Each refresh rotates the token; presenting an already-rotated token is
 *   treated as theft and revokes the whole token family.
 */
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { randomToken, sha256 } from "../../lib/crypto";
import { signAccessToken } from "../../middleware/auth";
import { badRequest, conflict, forbidden, unauthorized } from "../../lib/errors";
import { DAY } from "../../lib/util";
import { notify } from "../notifications/notifications.service";

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export async function issueSession(user: User, meta: SessionMeta, family?: string) {
  if (user.status === "BANNED" || user.status === "SUSPENDED") {
    throw forbidden("Your account is restricted. Contact support.", "ACCOUNT_RESTRICTED");
  }
  if (user.status === "DELETED") throw unauthorized("Account not found");
  const refreshToken = randomToken();
  const rt = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      family: family ?? randomToken(12),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 250),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { accessToken: signAccessToken({ id: user.id, role: user.role }), refreshToken, refreshTokenId: rt.id };
}

export async function rotateRefreshToken(token: string, meta: SessionMeta) {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!existing) throw unauthorized("Invalid session");
  if (existing.revokedAt) {
    // Reuse detected → revoke the entire family (possible token theft)
    await prisma.refreshToken.updateMany({ where: { family: existing.family, revokedAt: null }, data: { revokedAt: new Date() } });
    await notify(existing.userId, "account.security", {
      title: "Suspicious sign-in activity",
      body: "We detected reuse of an old session token and signed you out everywhere. If this wasn't you, change your password.",
    });
    throw unauthorized("Session expired, please sign in again");
  }
  if (existing.expiresAt < new Date()) throw unauthorized("Session expired, please sign in again");

  const session = await issueSession(existing.user, meta, existing.family);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedById: session.refreshTokenId },
  });
  return { ...session, user: existing.user };
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function registerWithEmail(input: { name: string; email: string; password: string; phone?: string; marketingOptIn?: boolean }) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw conflict("An account with this email already exists", "EMAIL_TAKEN");
  if (input.phone && (await prisma.user.findUnique({ where: { phone: input.phone } }))) {
    throw conflict("This phone number is already registered", "PHONE_TAKEN");
  }
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await bcrypt.hash(input.password, 12),
      consentAt: new Date(),
      marketingOptIn: input.marketingOptIn ?? false,
    },
  });
}

// Pre-computed hash so login timing is identical for unknown accounts.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always run bcrypt to keep timing constant and avoid user enumeration
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok || user.status === "DELETED") throw unauthorized("Incorrect email or password");
  return user;
}

/** OTP login: finds or creates the account for a verified phone / email. */
export async function loginWithOtpTarget(target: { phone?: string; email?: string }, name?: string) {
  const where = target.phone ? { phone: target.phone } : { email: target.email! };
  let user = await prisma.user.findUnique({ where });
  const now = new Date();
  if (!user) {
    user = await prisma.user.create({
      data: {
        ...where,
        name: name ?? (target.phone ? `User ${target.phone.slice(-4)}` : target.email!.split("@")[0]),
        phoneVerifiedAt: target.phone ? now : null,
        emailVerifiedAt: target.email ? now : null,
        consentAt: now,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: target.phone ? { phoneVerifiedAt: user.phoneVerifiedAt ?? now } : { emailVerifiedAt: user.emailVerifiedAt ?? now },
    });
  }
  return user;
}

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

export async function loginWithGoogle(idToken: string) {
  if (!googleClient) throw badRequest("Google sign-in is not configured");
  const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email || !p.email_verified) throw unauthorized("Google account email is not verified");
  const email = p.email.toLowerCase();
  let user = await prisma.user.findFirst({ where: { OR: [{ googleId: p.sub }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: { googleId: p.sub, email, name: p.name ?? email.split("@")[0], avatarUrl: p.picture, emailVerifiedAt: new Date(), consentAt: new Date() },
    });
  } else if (!user.googleId) {
    user = await prisma.user.update({ where: { id: user.id }, data: { googleId: p.sub, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
  }
  return user;
}

export async function setPassword(userId: string, newPassword: string) {
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  await revokeAllSessions(userId);
}

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
