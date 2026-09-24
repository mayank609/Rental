/** /api/v1/disputes — raise & follow disputes (resolution lives in /admin). */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { prisma } from "../../lib/prisma";
import { notFound } from "../../lib/errors";
import { addEvidence, openDispute } from "./disputes.service";

export const disputesRouter = Router();
disputesRouter.use(requireAuth);

disputesRouter.post(
  "/",
  validate({
    body: z.object({
      bookingId: z.string(),
      type: z.enum(["DAMAGE", "NOT_RETURNED", "NOT_AS_DESCRIBED", "NO_SHOW", "LATE_RETURN", "PAYMENT", "OTHER"]),
      description: z.string().trim().min(10).max(4000),
      claimAmount: z.coerce.number().int().min(0).default(0),
      evidenceUrls: z.array(z.string().url()).max(12).default([]),
    }),
  }),
  async (req, res) => {
    const d = await openDispute(req.user!.id, req.body);
    res.status(201).json({ dispute: d });
  },
);

disputesRouter.get("/", async (req, res) => {
  const uid = req.user!.id;
  const disputes = await prisma.dispute.findMany({
    where: { OR: [{ raisedById: uid }, { againstId: uid }] },
    include: { booking: { select: { id: true, code: true, listing: { select: { title: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ disputes });
});

disputesRouter.get("/:id", async (req, res) => {
  const uid = req.user!.id;
  const staff = req.user!.role !== "USER";
  const d = await prisma.dispute.findUnique({
    where: { id: req.params.id },
    include: {
      evidence: { include: { uploadedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      booking: { include: { listing: { select: { id: true, title: true } }, checklists: true } },
      raisedBy: { select: { id: true, name: true } },
      against: { select: { id: true, name: true } },
    },
  });
  if (!d || (!staff && d.raisedById !== uid && d.againstId !== uid)) throw notFound("Dispute");
  res.json({ dispute: d });
});

disputesRouter.post("/:id/evidence", validate({ body: z.object({ url: z.string().url().optional(), note: z.string().max(2000).optional() }) }), async (req, res) => {
  const ev = await addEvidence(req.params.id, req.user!.id, req.body, req.user!.role !== "USER");
  res.status(201).json({ evidence: ev });
});
