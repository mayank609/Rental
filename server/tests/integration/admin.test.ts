import { beforeAll, describe, expect, it } from "vitest";
import { app, auth, request, resetDb, signup } from "../helpers";

describe("admin & RBAC", () => {
  let admin: Awaited<ReturnType<typeof signup>>;
  let support: Awaited<ReturnType<typeof signup>>;
  let user: Awaited<ReturnType<typeof signup>>;

  beforeAll(async () => {
    await resetDb();
    admin = await signup("Admin", { role: "ADMIN" });
    support = await signup("Support", { role: "SUPPORT" });
    user = await signup("User");
  });

  it("denies regular users", async () => {
    await request(app).get("/api/v1/admin/dashboard").set(auth(user.token)).expect(403);
  });

  it("lets support read but not change money settings", async () => {
    await request(app).get("/api/v1/admin/dashboard").set(auth(support.token)).expect(200);
    await request(app).put("/api/v1/admin/settings/pro").set(auth(support.token)).send({ price: 1, periodDays: 30, maxListingsFree: 5, maxListingsPro: 50 }).expect(403);
  });

  it("updates fee settings and exposes them publicly", async () => {
    const current = await request(app).get("/api/v1/admin/settings").set(auth(admin.token)).expect(200);
    const fees = { ...current.body.settings.fees, ownerCommissionRate: 0.12 };
    await request(app).put("/api/v1/admin/settings/fees").set(auth(admin.token)).send(fees).expect(200);
    const pub = await request(app).get("/api/v1/legal/config").expect(200);
    expect(pub.body.fees.ownerCommissionRate).toBe(0.12);
    // Validation
    await request(app).put("/api/v1/admin/settings/fees").set(auth(admin.token)).send({ ...fees, ownerCommissionRate: 5 }).expect(400);
  });

  it("suspends users and writes an audit log", async () => {
    await request(app).patch(`/api/v1/admin/users/${user.user.id}`).set(auth(support.token)).send({ status: "SUSPENDED", statusReason: "Spam" }).expect(200);
    await request(app).get("/api/v1/auth/me").set(auth(user.token)).expect(403);
    const logs = await request(app).get(`/api/v1/admin/audit-logs?entityId=${user.user.id}`).set(auth(admin.token)).expect(200);
    expect(logs.body.logs[0].action).toBe("user.update");
  });

  it("exports CSV", async () => {
    const res = await request(app).get("/api/v1/admin/export/users").set(auth(admin.token)).expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.split("\n")[0]).toContain("id,name,email");
  });

  it("serves the OpenAPI document", async () => {
    const res = await request(app).get("/api/docs/openapi.json").expect(200);
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(100);
  });
});
