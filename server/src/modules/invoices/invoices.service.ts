/**
 * GST-compliant invoices / receipts rendered to PDF with pdfkit.
 * Numbering is gap-free per Indian financial year (Apr–Mar):
 *   RN/2026-27/000123
 */
import PDFDocument from "pdfkit";
import type { InvoiceType, Invoice } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { storage } from "../../lib/storage";
import { registerJob } from "../../lib/queue";
import { logger } from "../../lib/logger";

export function financialYear(d = new Date()) {
  // Indian FY runs 1 April → 31 March (computed in IST)
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function nextInvoiceNumber() {
  const fy = financialYear();
  const rows = await prisma.$queryRaw<{ last: number }[]>`
    INSERT INTO "InvoiceSequence" ("fy", "last") VALUES (${fy}, 1)
    ON CONFLICT ("fy") DO UPDATE SET "last" = "InvoiceSequence"."last" + 1
    RETURNING "last"`;
  return `RN/${fy}/${String(rows[0].last).padStart(6, "0")}`;
}

export interface InvoiceLine {
  label: string;
  amount: number;
  taxable?: boolean;
}

export interface InvoiceData {
  title: string;
  billedTo: { name: string; email?: string | null; phone?: string | null };
  reference: string;
  period?: string;
  lines: InvoiceLine[];
  taxLines: InvoiceLine[];
  total: number;
  notes?: string[];
}

export async function createInvoice(input: { type: InvoiceType; userId: string; bookingId?: string; paymentId?: string; data: InvoiceData; taxAmount: number }) {
  // One invoice per (type, booking/payment, user)
  const existing = await prisma.invoice.findFirst({
    where: { type: input.type, userId: input.userId, bookingId: input.bookingId ?? undefined, paymentId: input.paymentId ?? undefined },
  });
  if (existing) return existing;
  const number = await nextInvoiceNumber();
  const inv = await prisma.invoice.create({
    data: {
      number,
      type: input.type,
      userId: input.userId,
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      amount: input.data.total,
      taxAmount: input.taxAmount,
      data: input.data as unknown as object,
    },
  });
  try {
    const pdf = await renderInvoicePdf(inv);
    const key = `invoices/${inv.userId}/${inv.id}.pdf`;
    await storage.put(key, pdf, "application/pdf", true);
    return prisma.invoice.update({ where: { id: inv.id }, data: { fileKey: key } });
  } catch (err) {
    logger.error({ err, invoiceId: inv.id }, "invoice pdf render/store failed (will render on demand)");
    return inv;
  }
}

const rs = (paise: number) => `Rs. ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function renderInvoicePdf(inv: Invoice): Promise<Buffer> {
  const data = inv.data as unknown as InvoiceData;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `${data.title} ${inv.number}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor("#4f46e5").fontSize(22).text(env.PLATFORM_NAME, { continued: false });
    doc.fillColor("#111").fontSize(9).text(env.COMPANY_LEGAL_NAME).text(env.COMPANY_ADDRESS).text(`GSTIN: ${env.COMPANY_GSTIN}`).text(env.SUPPORT_EMAIL);
    doc.moveUp(4).fontSize(16).text(data.title, 300, 50, { align: "right" });
    doc.fontSize(9).text(`Invoice no: ${inv.number}`, { align: "right" }).text(`Date: ${inv.createdAt.toISOString().slice(0, 10)}`, { align: "right" }).text(`Reference: ${data.reference}`, { align: "right" });
    doc.moveDown(3).x = 50;

    doc.fontSize(11).fillColor("#111").text("Billed to", 50, 150);
    doc.fontSize(9).fillColor("#374151").text(data.billedTo.name);
    if (data.billedTo.email) doc.text(data.billedTo.email);
    if (data.billedTo.phone) doc.text(data.billedTo.phone);
    if (data.period) doc.moveDown(0.5).text(`Rental period: ${data.period}`);

    let y = 240;
    const row = (label: string, amount: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("#111").text(label, 50, y, { width: 360 }).text(amount, 400, y, { width: 145, align: "right" });
      y += 20;
    };
    doc.rect(50, y - 6, 495, 22).fill("#f3f4f6");
    doc.fillColor("#111");
    row("Description", "Amount", true);
    for (const l of data.lines) row(l.label, rs(l.amount));
    for (const l of data.taxLines) row(l.label, rs(l.amount));
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e5e7eb").stroke();
    y += 8;
    row("Total", rs(data.total), true);

    y += 20;
    doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
    for (const n of data.notes ?? []) {
      doc.text(n, 50, y, { width: 495 });
      y = doc.y + 4;
    }
    doc.text("This is a computer-generated document and does not require a signature.", 50, 760, { width: 495, align: "center" });
    doc.end();
  });
}

const fmtDate = (d: Date) => d.toLocaleString("en-IN", { timeZone: env.DEFAULT_TIMEZONE, dateStyle: "medium", timeStyle: "short" });

/** Renter receipt for a paid booking + owner statement for commission. */
export async function generateBookingInvoices(bookingId: string) {
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { renter: true, owner: true, listing: true } });
  const payment = await prisma.payment.findFirst({ where: { bookingId, purpose: "BOOKING", status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] } } });
  const gstPct = Math.round(((b.priceBreakdown as { rates?: { gstRate?: number } }).rates?.gstRate ?? 0.18) * 100);
  const period = `${fmtDate(b.startAt)} → ${fmtDate(b.endAt)}`;

  await createInvoice({
    type: "RENTER_RECEIPT",
    userId: b.renterId,
    bookingId: b.id,
    paymentId: payment?.id,
    taxAmount: b.taxAmount,
    data: {
      title: "Payment Receipt",
      billedTo: { name: b.renter.name, email: b.renter.email, phone: b.renter.phone },
      reference: `Booking ${b.code} · ${b.listing.title}`,
      period,
      lines: [
        { label: `Rent (${b.pricingUnits} ${b.pricingUnit}${b.pricingUnits > 1 ? "s" : ""}) — collected on behalf of owner`, amount: b.rentAmount },
        ...(b.deliveryFee ? [{ label: "Delivery fee", amount: b.deliveryFee }] : []),
        { label: "Platform service fee", amount: b.serviceFee, taxable: true },
        ...(b.protectionFee ? [{ label: "Damage protection plan", amount: b.protectionFee, taxable: true }] : []),
        { label: "Refundable security deposit (held by platform)", amount: b.depositAmount },
      ],
      taxLines: [
        { label: `IGST @ ${gstPct}% on platform fees`, amount: b.taxAmount },
      ],
      total: b.totalAmount,
      notes: [
        "Rent is collected by the platform as a payment facilitator on behalf of the owner.",
        "The security deposit is refundable and will be released after the item is returned and inspected, less any approved deductions.",
        "SAC 998599 — Other support services. Place of supply as per billing address.",
      ],
    },
  });

  await createInvoice({
    type: "OWNER_STATEMENT",
    userId: b.ownerId,
    bookingId: b.id,
    taxAmount: b.ownerCommissionTax,
    data: {
      title: "Commission Tax Invoice",
      billedTo: { name: b.owner.name, email: b.owner.email, phone: b.owner.phone },
      reference: `Booking ${b.code} · ${b.listing.title}`,
      period,
      lines: [
        { label: "Rental income collected on your behalf", amount: b.rentAmount },
        ...(b.deliveryFee ? [{ label: "Delivery fee", amount: b.deliveryFee }] : []),
        { label: "Less: platform commission", amount: -b.ownerCommission, taxable: true },
      ],
      taxLines: [{ label: `Less: GST @ ${gstPct}% on commission`, amount: -b.ownerCommissionTax }],
      total: b.ownerPayoutAmount,
      notes: ["Net amount is paid out after the rental completes. TDS/TCS, if applicable, will be reflected in your annual statement."],
    },
  });
}

registerJob("invoice.booking", ({ bookingId }: { bookingId: string }) => generateBookingInvoices(bookingId));

export async function generateSimpleInvoice(type: "PROMOTION" | "SUBSCRIPTION", paymentId: string, label: string) {
  const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { user: true } });
  const { getSettings } = await import("../settings/settings.service");
  const { fees } = await getSettings();
  const base = Math.round(p.amount / (1 + fees.gstRate));
  return createInvoice({
    type,
    userId: p.userId,
    paymentId: p.id,
    taxAmount: p.amount - base,
    data: {
      title: "Tax Invoice",
      billedTo: { name: p.user.name, email: p.user.email, phone: p.user.phone },
      reference: label,
      lines: [{ label, amount: base, taxable: true }],
      taxLines: [{ label: `IGST @ ${Math.round(fees.gstRate * 100)}%`, amount: p.amount - base }],
      total: p.amount,
    },
  });
}
