import { z } from "zod";
import { assetUrlSchema } from "../../lib/assets";

export const createBookingSchema = z
  .object({
    listingId: z.string().min(1),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    fulfillment: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"),
    deliveryAddress: z
      .object({
        line1: z.string().min(3).max(200),
        line2: z.string().max(200).optional(),
        locality: z.string().max(120).optional(),
        city: z.string().min(2).max(120),
        pincode: z.string().regex(/^\d{6}$/),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .optional(),
    protectionPlan: z.boolean().default(false),
    message: z.string().trim().max(1000).optional(),
    agreementAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the rental agreement" }) }),
    agreementVersion: z.string().optional(),
  })
  .refine((v) => v.fulfillment !== "DELIVERY" || v.deliveryAddress, { message: "Delivery address is required", path: ["deliveryAddress"] });

export const checklistSchema = z.object({
  type: z.enum(["HANDOVER", "RETURN"]),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR"]).optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(z.object({ label: z.string().max(120), ok: z.boolean() })).max(30).default([]),
  photos: z
    .array(z.object({ url: assetUrlSchema, takenAt: z.coerce.date().optional(), lat: z.number().optional(), lng: z.number().optional() }))
    .min(1, "Add at least one photo as evidence")
    .max(12),
});

export const inspectionSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), notes: z.string().max(2000).optional() }),
  z.object({
    ok: z.literal(false),
    type: z.enum(["DAMAGE", "NOT_AS_DESCRIBED", "LATE_RETURN", "OTHER"]).default("DAMAGE"),
    description: z.string().trim().min(10).max(4000),
    claimAmount: z.coerce.number().int().min(0),
    evidenceUrls: z.array(assetUrlSchema).max(12).default([]),
  }),
]);

export const listBookingsSchema = z.object({
  role: z.enum(["renter", "owner"]).default("renter"),
  status: z.string().optional(), // comma separated
  scope: z.enum(["upcoming", "active", "past", "all", "action"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
