/** /api/v1/invoices — list & download invoice PDFs. */
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { notFound } from "../../lib/errors";
import { storage } from "../../lib/storage";
import { renderInvoicePdf } from "./invoices.service";

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

invoicesRouter.get("/", async (req, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { userId: req.user!.id },
    select: { id: true, number: true, type: true, amount: true, taxAmount: true, bookingId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ invoices });
});

invoicesRouter.get("/:id/pdf", async (req, res) => {
  const inv = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  const staff = req.user!.role !== "USER";
  if (!inv || (inv.userId !== req.user!.id && !staff)) throw notFound("Invoice");
  let pdf: Buffer;
  try {
    pdf = inv.fileKey ? await storage.get(inv.fileKey) : await renderInvoicePdf(inv);
  } catch {
    pdf = await renderInvoicePdf(inv);
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${inv.number.replace(/\//g, "-")}.pdf"`);
  res.send(pdf);
});
