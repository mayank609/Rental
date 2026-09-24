/** /api/v1/reports — users report listings, users, messages or reviews. */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { prisma } from "../../lib/prisma";
import { conflict } from "../../lib/errors";

export const reportsRouter = Router();

reportsRouter.post(
  "/",
  requireAuth,
  validate({
    body: z.object({
      targetType: z.enum(["LISTING", "USER", "MESSAGE", "REVIEW"]),
      targetId: z.string().min(1),
      reason: z.enum(["PROHIBITED_ITEM", "SCAM", "FAKE_LISTING", "INAPPROPRIATE", "HARASSMENT", "OFF_PLATFORM_PAYMENT", "SPAM", "OTHER"]),
      details: z.string().trim().max(2000).optional(),
    }),
  }),
  async (req, res) => {
    const dup = await prisma.report.findFirst({ where: { reporterId: req.user!.id, targetType: req.body.targetType, targetId: req.body.targetId, status: "OPEN" } });
    if (dup) throw conflict("You've already reported this. Our team is reviewing it.");
    const report = await prisma.report.create({ data: { ...req.body, reporterId: req.user!.id } });
    // Auto-pause listings that collect many independent reports
    if (req.body.targetType === "LISTING") {
      const n = await prisma.report.count({ where: { targetType: "LISTING", targetId: req.body.targetId, status: "OPEN" } });
      if (n >= 5) await prisma.listing.updateMany({ where: { id: req.body.targetId, status: "ACTIVE" }, data: { status: "PENDING_REVIEW" } });
    }
    res.status(201).json({ report: { id: report.id, status: report.status } });
  },
);
