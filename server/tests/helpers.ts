/** Integration-test helpers: DB reset, user factory, authenticated agents. */
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { slugify } from "../src/lib/util";

export const app = createApp();

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function seedCategory() {
  const parent = await prisma.category.create({ data: { name: "Cameras", slug: "cameras" } });
  const child = await prisma.category.create({ data: { name: "DSLR", slug: "dslr", parentId: parent.id } });
  return { parent, child };
}

let phoneSeq = 0;
/** Sign up via phone OTP (test OTP is always 123456) and return token + user. */
export async function signup(name = "Test User", opts: { kyc?: boolean; role?: "ADMIN" | "SUPPORT" } = {}) {
  const phone = `+9198${String(Date.now()).slice(-6)}${String(phoneSeq++).padStart(2, "0")}`;
  await request(app).post("/api/v1/auth/otp/request").send({ phone }).expect(200);
  const res = await request(app).post("/api/v1/auth/otp/verify").send({ phone, code: "123456", name }).expect(200);
  if (opts.kyc || opts.role) {
    await prisma.user.update({ where: { id: res.body.user.id }, data: { ...(opts.kyc ? { kycStatus: "VERIFIED" } : {}), ...(opts.role ? { role: opts.role } : {}) } });
  }
  const cookie = res.headers["set-cookie"];
  return { token: res.body.accessToken as string, user: res.body.user as { id: string; name: string }, cookie, phone };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function uploadTestImage(token: string) {
  const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 80, g: 70, b: 229 } } }).png().toBuffer();
  const res = await request(app).post("/api/v1/uploads/images?purpose=listing").set(auth(token)).attach("files", png, "photo.png").expect(201);
  return res.body.images[0].id as string;
}

export async function createListing(token: string, categoryId: string, overrides: Record<string, unknown> = {}) {
  const imageId = await uploadTestImage(token);
  const res = await request(app)
    .post("/api/v1/listings")
    .set(auth(token))
    .send({
      title: "Canon EOS 90D DSLR Camera",
      description: "Excellent condition DSLR with kit lens, battery and charger included.",
      categoryId,
      priceDaily: 100000,
      priceWeekly: 550000,
      securityDeposit: 500000,
      minRentalHours: 24,
      cancellationPolicy: "MODERATE",
      address: { line1: "12 Linking Road", locality: "Bandra", city: "Mumbai", pincode: "400050" },
      imageIds: [imageId],
      ...overrides,
    });
  if (res.status !== 201) throw new Error(`createListing failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.listing as { id: string; slug: string; status: string; location: { lat: number; lng: number } };
}

/** A future window aligned to the hour. */
export function window(startInDays: number, days: number) {
  const start = new Date(Math.ceil((Date.now() + startInDays * 86_400_000) / 3_600_000) * 3_600_000);
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + days * 86_400_000).toISOString() };
}

/** Run the mock checkout for a booking and verify the payment. */
export async function payBooking(token: string, bookingId: string) {
  const pay = await request(app).post(`/api/v1/bookings/${bookingId}/pay`).set(auth(token)).send({}).expect(200);
  const sim = await request(app).post("/api/v1/payments/mock/pay").set(auth(token)).send({ orderId: pay.body.checkout.orderId }).expect(200);
  await request(app).post("/api/v1/payments/verify").set(auth(token)).send(sim.body).expect(200);
  return pay.body.checkout;
}

export { request, prisma, slugify };
