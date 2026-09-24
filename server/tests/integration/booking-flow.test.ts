/**
 * End-to-end booking lifecycle through the HTTP API:
 * request → accept → pay → handover → return → inspection → complete →
 * deposit refund → payout → reviews. Plus concurrency and cancellations.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { app, auth, createListing, payBooking, request, resetDb, seedCategory, signup, prisma, window } from "../helpers";
import { processDuePayouts } from "../../src/modules/payouts/payouts.service";
import { expireStaleBookings, handleOverdue } from "../../src/modules/bookings/bookings.service";
import { reconcilePayments } from "../../src/modules/payments/payments.service";
import crypto from "node:crypto";

const photo = { url: "https://example.com/photo.webp" };
const book = (token: string, listingId: string, w: { startAt: string; endAt: string }, extra: Record<string, unknown> = {}) =>
  request(app).post("/api/v1/bookings").set(auth(token)).send({ listingId, ...w, agreementAccepted: true, ...extra });

describe("booking lifecycle", () => {
  let owner: Awaited<ReturnType<typeof signup>>;
  let renter: Awaited<ReturnType<typeof signup>>;
  let renter2: Awaited<ReturnType<typeof signup>>;
  let listingId: string;
  let instantId: string;

  beforeAll(async () => {
    await resetDb();
    const cat = await seedCategory();
    owner = await signup("Owner", { kyc: true });
    renter = await signup("Renter");
    renter2 = await signup("Renter Two");
    listingId = (await createListing(owner.token, cat.parent.id)).id;
    instantId = (await createListing(owner.token, cat.parent.id, { title: "GoPro Hero 11 action camera", instantBooking: true })).id;
    await prisma.payoutAccount.create({ data: { userId: owner.user.id, method: "UPI", accountHolderName: "Owner", upiId: "owner@okicici", status: "VERIFIED" } });
  });

  it("runs the full happy path", async () => {
    const w = window(0.2, 2); // starts in ~5h (handover window open)
    const created = await book(renter.token, listingId, w, { message: "Hi! Can I rent this?" }).expect(201);
    const id = created.body.booking.id;
    expect(created.body.booking.status).toBe("REQUESTED");
    expect(created.body.booking.owner.phone).toBeUndefined(); // no contact reveal yet

    // Renter can't accept, owner can
    await request(app).post(`/api/v1/bookings/${id}/accept`).set(auth(renter.token)).expect(404);
    const accepted = await request(app).post(`/api/v1/bookings/${id}/accept`).set(auth(owner.token)).expect(200);
    expect(accepted.body.booking.status).toBe("ACCEPTED");
    expect(accepted.body.booking.actions).toEqual(["cancel"]); // owner can only cancel while awaiting payment

    await payBooking(renter.token, id);
    const confirmed = await request(app).get(`/api/v1/bookings/${id}`).set(auth(renter.token)).expect(200);
    expect(confirmed.body.booking.status).toBe("CONFIRMED");
    expect(confirmed.body.booking.owner.phone).toBeTruthy(); // revealed after payment
    expect(confirmed.body.booking.listing.pickupAddress.line1).toBe("12 Linking Road");
    const payout = await prisma.payout.findFirstOrThrow({ where: { bookingId: id } });
    expect(payout.status).toBe("PENDING");

    // Handover: needs both parties
    await request(app).post(`/api/v1/bookings/${id}/checklists`).set(auth(owner.token)).send({ type: "HANDOVER", photos: [photo], items: [{ label: "Works", ok: true }] }).expect(200);
    const afterOne = await request(app).get(`/api/v1/bookings/${id}`).set(auth(owner.token));
    expect(afterOne.body.booking.status).toBe("CONFIRMED");
    const active = await request(app).post(`/api/v1/bookings/${id}/checklists`).set(auth(renter.token)).send({ type: "HANDOVER", photos: [photo] }).expect(200);
    expect(active.body.booking.status).toBe("ACTIVE");

    // Return
    await request(app).post(`/api/v1/bookings/${id}/checklists`).set(auth(renter.token)).send({ type: "RETURN", photos: [photo] }).expect(200);
    const returned = await request(app).post(`/api/v1/bookings/${id}/checklists`).set(auth(owner.token)).send({ type: "RETURN", photos: [photo] }).expect(200);
    expect(returned.body.booking.status).toBe("RETURNED");
    expect(returned.body.booking.lateFeeAmount).toBe(0);

    // Inspection OK → complete, deposit refunded, payout scheduled
    const done = await request(app).post(`/api/v1/bookings/${id}/inspection`).set(auth(owner.token)).send({ ok: true }).expect(200);
    expect(done.body.booking.status).toBe("COMPLETED");
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    expect(payment.refundedAmount).toBe(500000);
    expect(payment.status).toBe("PARTIALLY_REFUNDED");
    const sched = await prisma.payout.findFirstOrThrow({ where: { bookingId: id } });
    expect(sched.status).toBe("SCHEDULED");
    expect(sched.amount).toBe(200000 - 30000 - 5400);

    // Payout job (make it due now)
    await prisma.payout.update({ where: { id: sched.id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    await processDuePayouts();
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: sched.id } })).status).toBe("PAID");

    // Two-way reviews, once each
    await request(app).post("/api/v1/reviews").set(auth(renter.token)).send({ bookingId: id, rating: 5, comment: "Great!" }).expect(201);
    await request(app).post("/api/v1/reviews").set(auth(renter.token)).send({ bookingId: id, rating: 4 }).expect(409);
    await request(app).post("/api/v1/reviews").set(auth(owner.token)).send({ bookingId: id, rating: 5 }).expect(201);
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.ratingAvg).toBe(5);
    expect(listing.ratingCount).toBe(1);

    // Invoices generated (inline job)
    await new Promise((r) => setTimeout(r, 300));
    const invoices = await prisma.invoice.findMany({ where: { bookingId: id } });
    expect(invoices.map((i) => i.type).sort()).toEqual(["OWNER_STATEMENT", "RENTER_RECEIPT"]);
    const pdf = await request(app).get(`/api/v1/invoices/${invoices.find((i) => i.type === "RENTER_RECEIPT")!.id}/pdf`).set(auth(renter.token)).expect(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    await request(app).get(`/api/v1/invoices/${invoices[0].id}/pdf`).set(auth(renter2.token)).expect(404);
  });

  it("prevents double booking under concurrency", async () => {
    const w = window(20, 2);
    const results = await Promise.all([book(renter.token, instantId, w), book(renter2.token, instantId, w)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.error.code).toBe("DATES_UNAVAILABLE");
    expect(await prisma.booking.count({ where: { listingId: instantId, status: { in: ["ACCEPTED", "CONFIRMED"] } } })).toBe(1);
  });

  it("the DB exclusion constraint rejects overlaps even if app checks are bypassed", async () => {
    const existing = await prisma.booking.findFirstOrThrow({ where: { listingId: instantId, status: "ACCEPTED" } });
    const { id: _id, code: _code, createdAt: _c, updatedAt: _u, ...rest } = existing;
    void _id; void _code; void _c; void _u;
    await expect(
      prisma.booking.create({ data: { ...rest, code: `RN-${crypto.randomBytes(3).toString("hex")}`, renterId: renter2.user.id, priceBreakdown: {}, deliveryAddress: undefined, remindersSent: [] } }),
    ).rejects.toThrow(/Booking_no_overlap|exclusion|23P01/);
  });

  it("auto-declines overlapping requests when one is paid", async () => {
    const w = window(30, 3);
    const a = await book(renter.token, listingId, w).expect(201);
    const b = await book(renter2.token, listingId, w).expect(201);
    await request(app).post(`/api/v1/bookings/${a.body.booking.id}/accept`).set(auth(owner.token)).expect(200);
    // Owner can't accept an overlapping request while one is accepted
    const clash = await request(app).post(`/api/v1/bookings/${b.body.booking.id}/accept`).set(auth(owner.token)).expect(409);
    expect(clash.body.error.code).toBe("DATES_UNAVAILABLE");
    await payBooking(renter.token, a.body.booking.id);
    const other = await prisma.booking.findUniqueOrThrow({ where: { id: b.body.booking.id } });
    expect(other.status).toBe("DECLINED");
  });

  it("refunds per policy when the renter cancels a paid booking", async () => {
    const w = window(40, 2); // > 72h → full refund under MODERATE
    const r = await book(renter.token, listingId, w).expect(201);
    const id = r.body.booking.id;
    await request(app).post(`/api/v1/bookings/${id}/accept`).set(auth(owner.token)).expect(200);
    await payBooking(renter.token, id);
    const preview = await request(app).get(`/api/v1/bookings/${id}/cancellation-preview`).set(auth(renter.token)).expect(200);
    expect(preview.body.outcome.refundPercent).toBe(100);
    const res = await request(app).post(`/api/v1/bookings/${id}/cancel`).set(auth(renter.token)).send({ reason: "Plans changed" }).expect(200);
    expect(res.body.booking.status).toBe("CANCELLED");
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    expect(payment.status).toBe("REFUNDED");
    expect(payment.refundedAmount).toBe(payment.amount);
  });

  it("fully refunds and penalises the owner when the owner cancels after payment", async () => {
    const w = window(50, 2);
    const r = await book(renter.token, listingId, w).expect(201);
    const id = r.body.booking.id;
    await request(app).post(`/api/v1/bookings/${id}/accept`).set(auth(owner.token)).expect(200);
    await payBooking(renter.token, id);
    const res = await request(app).post(`/api/v1/bookings/${id}/cancel`).set(auth(owner.token)).send({ reason: "Item broke" }).expect(200);
    expect(res.body.outcome.ownerPenalty).toBeGreaterThan(0);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    expect(payment.refundedAmount).toBe(payment.amount);
    const penalty = await prisma.payout.findFirstOrThrow({ where: { bookingId: id, amount: { lt: 0 } } });
    expect(penalty.amount).toBe(-res.body.outcome.ownerPenalty);
  });

  it("expires unanswered requests", async () => {
    const r = await book(renter.token, listingId, window(60, 1)).expect(201);
    await prisma.booking.update({ where: { id: r.body.booking.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expireStaleBookings();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: r.body.booking.id } })).status).toBe("EXPIRED");
  });

  it("marks overdue rentals, then auto-opens a dispute and holds the payout", async () => {
    const b = await prisma.booking.findFirstOrThrow({ where: { listingId, status: "CONFIRMED" } });
    // Simulate: rental ended 4 days ago and was never returned
    await prisma.booking.update({ where: { id: b.id }, data: { status: "ACTIVE", startAt: new Date(Date.now() - 7 * 86400_000), endAt: new Date(Date.now() - 4 * 86400_000) } });
    await handleOverdue();
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.status).toBe("DISPUTED");
    const dispute = await prisma.dispute.findFirstOrThrow({ where: { bookingId: b.id } });
    expect(dispute.type).toBe("NOT_RETURNED");
    expect((await prisma.payout.findFirstOrThrow({ where: { bookingId: b.id } })).status).toBe("ON_HOLD");
  });

  it("recovers a captured payment when verify/webhook never arrived", async () => {
    const r = await book(renter2.token, listingId, window(70, 2)).expect(201);
    const id = r.body.booking.id;
    await request(app).post(`/api/v1/bookings/${id}/accept`).set(auth(owner.token)).expect(200);
    const pay = await request(app).post(`/api/v1/bookings/${id}/pay`).set(auth(renter2.token)).send({}).expect(200);
    // Idempotent: same order returned on retry
    const again = await request(app).post(`/api/v1/bookings/${id}/pay`).set(auth(renter2.token)).send({}).expect(200);
    expect(again.body.checkout.orderId).toBe(pay.body.checkout.orderId);
    await request(app).post("/api/v1/payments/mock/pay").set(auth(renter2.token)).send({ orderId: pay.body.checkout.orderId }).expect(200);
    await prisma.payment.updateMany({ where: { providerOrderId: pay.body.checkout.orderId }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
    const result = await reconcilePayments();
    expect(result.recovered).toBeGreaterThanOrEqual(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe("CONFIRMED");
  });

  it("processes webhooks idempotently and rejects bad signatures", async () => {
    const body = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_x", order_id: "order_unknown" } } } });
    await request(app).post("/api/v1/webhooks/razorpay").set("x-razorpay-signature", "bad").set("content-type", "application/json").send(body).expect(400);
    const sig = crypto.createHmac("sha256", "mock_payment_secret").update(body).digest("hex");
    await request(app).post("/api/v1/webhooks/razorpay").set("x-razorpay-signature", sig).set("x-razorpay-event-id", "evt_1").set("content-type", "application/json").send(body).expect(200);
    await request(app).post("/api/v1/webhooks/razorpay").set("x-razorpay-signature", sig).set("x-razorpay-event-id", "evt_1").set("content-type", "application/json").send(body).expect(200);
    expect(await prisma.webhookEvent.count({ where: { eventId: "evt_1" } })).toBe(1);
  });

  it("masks contact details in chat until a booking is confirmed", async () => {
    const stranger = await signup("Stranger");
    const conv = await request(app).post("/api/v1/chat/conversations").set(auth(stranger.token)).send({ listingId: instantId }).expect(201);
    const m = await request(app).post(`/api/v1/chat/conversations/${conv.body.conversation.id}/messages`).set(auth(stranger.token)).send({ body: "call me 9876543210" }).expect(201);
    expect(m.body.message.wasMasked).toBe(true);
    expect(m.body.message.body).not.toContain("9876543210");
  });

  it("blocks account deletion while rentals are active", async () => {
    const res = await request(app).delete("/api/v1/users/me").set(auth(renter.token)).send({ confirm: "DELETE" }).expect(409);
    expect(res.body.error.code).toBe("ACCOUNT_HAS_ACTIVE_ITEMS");
  });

  it("locks critical listing fields while bookings exist", async () => {
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    const res = await request(app).patch(`/api/v1/listings/${listingId}`).set(auth(owner.token)).send({ securityDeposit: 1, version: l.version }).expect(409);
    expect(res.body.error.code).toBe("FIELDS_LOCKED");
    await request(app).patch(`/api/v1/listings/${listingId}`).set(auth(owner.token)).send({ description: "Updated description with more details about the camera.", version: l.version }).expect(200);
  });
});
