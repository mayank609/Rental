/**
 * /api/v1/auth — phone OTP, email/password, Google sign-in, refresh rotation.
 */
import { Router, type Request, type Response, type CookieOptions } from "express";
import { validate } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";
import { authLimiter, otpLimiter } from "../../middleware/rateLimit";
import { csrfGuard, clientIp } from "../../middleware/security";
import { env, isProd } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { conflict, unauthorized, badRequest } from "../../lib/errors";
import { issueOtp, verifyOtp } from "./otp.service";
import * as svc from "./auth.service";
import {
  changePasswordSchema, emailSchema, googleSchema, loginSchema, otpRequestSchema, otpVerifySchema,
  phoneSchema, registerSchema, resetPasswordSchema,
} from "./auth.schemas";
import { selfUser } from "../users/users.serializers";
import { z } from "zod";
import type { User } from "@prisma/client";

export const authRouter = Router();

const REFRESH_COOKIE = "rn_rt";
const cookieOpts = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd || env.COOKIE_SAMESITE === "none",
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN,
  path: "/api/v1/auth",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000,
});

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: req.headers["user-agent"] });

async function respondWithSession(req: Request, res: Response, user: User, status = 200) {
  const s = await svc.issueSession(user, meta(req));
  res.cookie(REFRESH_COOKIE, s.refreshToken, cookieOpts());
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { subscription: true } });
  res.status(status).json({ accessToken: s.accessToken, user: selfUser(full) });
}

/** Request an OTP by SMS (phone) or email. */
authRouter.post("/otp/request", otpLimiter, validate({ body: otpRequestSchema }), async (req, res) => {
  const { phone, email, purpose } = req.body as z.infer<typeof otpRequestSchema>;
  const result = await issueOtp(purpose, (phone ?? email)!, phone ? "sms" : "email");
  res.json({ sent: true, ...result });
});

/** Verify OTP and sign in (creates the account on first login). */
authRouter.post("/otp/verify", authLimiter, validate({ body: otpVerifySchema }), async (req, res) => {
  const { phone, email, code, name } = req.body as z.infer<typeof otpVerifySchema>;
  await verifyOtp("login", (phone ?? email)!, code);
  const user = await svc.loginWithOtpTarget({ phone, email }, name);
  await respondWithSession(req, res, user);
});

authRouter.post("/register", authLimiter, validate({ body: registerSchema }), async (req, res) => {
  const user = await svc.registerWithEmail(req.body);
  await respondWithSession(req, res, user, 201);
});

authRouter.post("/login", authLimiter, validate({ body: loginSchema }), async (req, res) => {
  const user = await svc.loginWithPassword(req.body.email, req.body.password);
  await respondWithSession(req, res, user);
});

authRouter.post("/google", authLimiter, validate({ body: googleSchema }), async (req, res) => {
  const user = await svc.loginWithGoogle(req.body.idToken);
  await respondWithSession(req, res, user);
});

/** Rotate refresh token (cookie) → new access token. CSRF-guarded. */
authRouter.post("/refresh", csrfGuard, async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized("No session");
  try {
    const s = await svc.rotateRefreshToken(token, meta(req));
    res.cookie(REFRESH_COOKIE, s.refreshToken, cookieOpts());
    const full = await prisma.user.findUniqueOrThrow({ where: { id: s.user.id }, include: { subscription: true } });
    res.json({ accessToken: s.accessToken, user: selfUser(full) });
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
    throw err;
  }
});

authRouter.post("/logout", csrfGuard, async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await svc.revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.post("/logout-all", requireAuth, async (req, res) => {
  await svc.revokeAllSessions(req.user!.id);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: { subscription: true } });
  res.json({ user: selfUser(user) });
});

/** Link + verify a phone number on an existing account (mandatory before booking/listing). */
authRouter.post("/phone/request", requireAuth, otpLimiter, validate({ body: z.object({ phone: phoneSchema }) }), async (req, res) => {
  const taken = await prisma.user.findFirst({ where: { phone: req.body.phone, NOT: { id: req.user!.id } } });
  if (taken) throw conflict("This phone number is linked to another account", "PHONE_TAKEN");
  res.json({ sent: true, ...(await issueOtp("verify_phone", req.body.phone, "sms")) });
});

authRouter.post(
  "/phone/verify",
  requireAuth,
  authLimiter,
  validate({ body: z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }) }),
  async (req, res) => {
    await verifyOtp("verify_phone", req.body.phone, req.body.code);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { phone: req.body.phone, phoneVerifiedAt: new Date() },
      include: { subscription: true },
    });
    res.json({ user: selfUser(user) });
  },
);

authRouter.post("/email/request", requireAuth, otpLimiter, async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!u.email) throw badRequest("Add an email address first");
  res.json({ sent: true, ...(await issueOtp("verify_email", u.email, "email")) });
});

authRouter.post("/email/verify", requireAuth, validate({ body: z.object({ code: z.string().regex(/^\d{6}$/) }) }), async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!u.email) throw badRequest("Add an email address first");
  await verifyOtp("verify_email", u.email, req.body.code);
  const user = await prisma.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() }, include: { subscription: true } });
  res.json({ user: selfUser(user) });
});

authRouter.post("/password/forgot", otpLimiter, validate({ body: z.object({ email: emailSchema }) }), async (req, res) => {
  const u = await prisma.user.findUnique({ where: { email: req.body.email } });
  // Respond identically whether the account exists (no enumeration)
  if (u && u.status === "ACTIVE") await issueOtp("reset_password", req.body.email, "email").catch(() => undefined);
  res.json({ sent: true });
});

authRouter.post("/password/reset", authLimiter, validate({ body: resetPasswordSchema }), async (req, res) => {
  await verifyOtp("reset_password", req.body.email, req.body.code);
  const u = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!u) throw unauthorized();
  await svc.setPassword(u.id, req.body.password);
  res.json({ ok: true });
});

authRouter.post("/password/change", requireAuth, validate({ body: changePasswordSchema }), async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (u.passwordHash) {
    if (!req.body.currentPassword || !(await svc.verifyPassword(req.body.currentPassword, u.passwordHash))) {
      throw unauthorized("Current password is incorrect");
    }
  }
  await svc.setPassword(u.id, req.body.newPassword);
  res.json({ ok: true });
});
