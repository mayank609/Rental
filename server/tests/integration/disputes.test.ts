/** Damage claim at inspection → admin resolves → deposit split & payouts. */
import { beforeAll, describe, expect, it } from "vitest";
import { app, auth, createListing, payBooking, request, resetDb, seedCategory, signup, prisma, window } from "../helpers";

const photo = { url: "https://example.com/p.webp" };

describe("disputes", () => {
  it("resolves a damage claim with a partial deposit deduction", async () => {
    await resetDb();
    const cat = await seedCategory();
    const owner = await signup("Owner", { kyc: true });
    const renter = await signup("Renter");
    const admin = await signup("Admin", { role: "ADMIN" });
    const l = await createListing(owner.token, cat.parent.id);

    const w = window(0.2, 1);
    const b = await request(app).post("/api/v1/bookings").set(auth(renter.token)).send({ listingId: l.id, ...w, agreementAccepted: true }).expect(201);
    const id = b.body.booking.id;
    await request(app).post(`/api/v1/bookings/${id}/accept`).set(auth(owner.token)).expect(200);
    await payBooking(renter.token, id);
    for (const t of [owner, renter]) await request(app).post(`/api/v1/bookings/${id}/checklists`).set(auth(t.token)).send({ type: "HANDOVER", photos: [photo] }).expect(200);
    for (const t of [renter, owner]) await request(app).post(`/api/v1/bookings/${id}/checklists`).set(auth(t.token)).send({ type: "RETURN", photos: [photo] }).expect(200);

    const claim = await request(app)
      .post(`/api/v1/bookings/${id}/inspection`)
      .set(auth(owner.token))
      .send({ ok: false, type: "DAMAGE", description: "Lens has a deep scratch that was not there before.", claimAmount: 300000, evidenceUrls: ["https://example.com/scratch.webp"] })
      .expect(200);
    expect(claim.body.booking.status).toBe("DISPUTED");
    const dispute = await prisma.dispute.findFirstOrThrow({ where: { bookingId: id } });
    expect((await prisma.payout.findFirstOrThrow({ where: { bookingId: id } })).status).toBe("ON_HOLD");

    // Renter adds their side; users can't resolve
    await request(app).post(`/api/v1/disputes/${dispute.id}/evidence`).set(auth(renter.token)).send({ note: "The scratch was already visible in the handover photos." }).expect(201);
    await request(app).post(`/api/v1/admin/disputes/${dispute.id}/resolve`).set(auth(renter.token)).send({}).expect(403);

    const res = await request(app)
      .post(`/api/v1/admin/disputes/${dispute.id}/resolve`)
      .set(auth(admin.token))
      .send({ decision: "RESOLVED", resolution: "Partial damage confirmed from photos.", depositDeduction: 200000, refundAmount: 0 })
      .expect(200);
    expect(res.body.dispute.status).toBe("RESOLVED");

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(booking.status).toBe("COMPLETED");
    expect(booking.depositDeduction).toBe(200000);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    expect(payment.refundedAmount).toBe(500000 - 200000); // deposit remainder
    const payout = await prisma.payout.findFirstOrThrow({ where: { bookingId: id } });
    expect(payout.status).toBe("SCHEDULED");
    expect(payout.amount).toBe(100000 - 15000 - 2700 + 200000); // rent share + damage compensation
  });
});
