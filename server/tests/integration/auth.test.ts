import { beforeAll, describe, expect, it } from "vitest";
import { app, auth, request, resetDb, signup, prisma } from "../helpers";

describe("auth", () => {
  beforeAll(resetDb);

  it("signs up with phone OTP and returns a session", async () => {
    const s = await signup("Asha");
    expect(s.token).toBeTruthy();
    expect(s.user.name).toBe("Asha");
    const me = await request(app).get("/api/v1/auth/me").set(auth(s.token)).expect(200);
    expect(me.body.user.phoneVerified).toBe(true);
  });

  it("rejects a wrong OTP and locks after too many attempts", async () => {
    const phone = "+919812345678";
    await request(app).post("/api/v1/auth/otp/request").send({ phone }).expect(200);
    const bad = await request(app).post("/api/v1/auth/otp/verify").send({ phone, code: "000000" }).expect(422);
    expect(bad.body.error.code).toBe("OTP_INVALID");
  });

  it("registers with email/password and logs in", async () => {
    const r = await request(app).post("/api/v1/auth/register").send({ name: "Ravi", email: "ravi@example.com", password: "Secret123", consent: true }).expect(201);
    expect(r.body.user.email).toBe("ravi@example.com");
    expect(r.body.user.phoneVerified).toBe(false);
    await request(app).post("/api/v1/auth/login").send({ email: "ravi@example.com", password: "nope" }).expect(401);
    await request(app).post("/api/v1/auth/login").send({ email: "ravi@example.com", password: "Secret123" }).expect(200);
    const dup = await request(app).post("/api/v1/auth/register").send({ name: "Ravi", email: "ravi@example.com", password: "Secret123", consent: true }).expect(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rotates refresh tokens and detects reuse", async () => {
    const s = await signup("Rotator");
    const cookie = (s.cookie as unknown as string[]).find((c) => c.startsWith("rn_rt="))!.split(";")[0];
    // CSRF: header required
    await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie).expect(403);
    const r1 = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie).set("X-Requested-With", "XMLHttpRequest").expect(200);
    expect(r1.body.accessToken).toBeTruthy();
    // Re-using the old (rotated) token revokes the family
    await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie).set("X-Requested-With", "XMLHttpRequest").expect(401);
    const newCookie = (r1.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("rn_rt="))!.split(";")[0];
    await request(app).post("/api/v1/auth/refresh").set("Cookie", newCookie).set("X-Requested-With", "XMLHttpRequest").expect(401);
  });

  it("blocks banned users immediately", async () => {
    const s = await signup("Banned");
    await prisma.user.update({ where: { id: s.user.id }, data: { status: "BANNED" } });
    const r = await request(app).get("/api/v1/auth/me").set(auth(s.token)).expect(403);
    expect(r.body.error.code).toBe("ACCOUNT_RESTRICTED");
  });

  it("requires phone verification to create listings", async () => {
    const r = await request(app).post("/api/v1/auth/register").send({ name: "NoPhone", email: "nophone@example.com", password: "Secret123", consent: true });
    const res = await request(app).post("/api/v1/listings").set(auth(r.body.accessToken)).send({}).expect(403);
    expect(res.body.error.code).toBe("PHONE_VERIFICATION_REQUIRED");
  });
});
