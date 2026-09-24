import { z } from "zod";

const money = z.coerce.number().int().min(0).max(100_000_000); // paise, up to ₹10 lakh
const optMoney = money.nullable().optional();

export const addressInput = z.object({
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  locality: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().max(120).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit pincode").optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const base = z.object({
  title: z.string().trim().min(5).max(100),
  description: z.string().trim().min(20).max(5000),
  categoryId: z.string().min(1),
  subcategoryId: z.string().min(1).nullable().optional(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR"]).default("GOOD"),
  priceHourly: optMoney,
  priceDaily: optMoney,
  priceWeekly: optMoney,
  priceMonthly: optMoney,
  securityDeposit: money.default(0),
  minRentalHours: z.coerce.number().int().min(1).max(24 * 365).default(24),
  maxRentalHours: z.coerce.number().int().min(1).max(24 * 365).nullable().optional(),
  instantBooking: z.boolean().default(false),
  pickupAvailable: z.boolean().default(true),
  deliveryAvailable: z.boolean().default(false),
  deliveryFee: optMoney,
  deliveryRadiusKm: z.coerce.number().int().min(1).max(100).nullable().optional(),
  rules: z.string().trim().max(2000).nullable().optional(),
  cancellationPolicy: z.enum(["FLEXIBLE", "MODERATE", "STRICT"]).default("MODERATE"),
  quantity: z.coerce.number().int().min(1).max(1).default(1),
  addressId: z.string().optional(),
  address: addressInput.optional(),
  imageIds: z.array(z.string()).max(10).default([]),
  publish: z.boolean().default(true),
});

const refinePrices = <T extends z.ZodTypeAny>(s: T) =>
  s
    .refine((v: any) => v.priceDaily || v.priceHourly || v.priceWeekly || v.priceMonthly || v.priceDaily === undefined, { // eslint-disable-line @typescript-eslint/no-explicit-any
      message: "Set at least one price",
      path: ["priceDaily"],
    })
    .refine((v: any) => !v.maxRentalHours || !v.minRentalHours || v.maxRentalHours >= v.minRentalHours, { // eslint-disable-line @typescript-eslint/no-explicit-any
      message: "Maximum rental period must be ≥ minimum",
      path: ["maxRentalHours"],
    })
    .refine((v: any) => !v.deliveryAvailable || v.deliveryFee != null, { // eslint-disable-line @typescript-eslint/no-explicit-any
      message: "Set a delivery fee (0 for free delivery)",
      path: ["deliveryFee"],
    });

export const createListingSchema = refinePrices(
  base.refine((v) => v.addressId || v.address, { message: "Address is required", path: ["address"] }).refine(
    (v) => v.priceDaily || v.priceHourly,
    { message: "Set a daily or hourly price", path: ["priceDaily"] },
  ),
);

export const updateListingSchema = refinePrices(base.partial().extend({ version: z.number().int().optional() }));

export const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  city: z.string().max(80).optional(), // city slug
  locality: z.string().max(80).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.5).max(200).optional(),
  category: z.string().max(80).optional(), // category slug
  minPrice: z.coerce.number().int().min(0).optional(), // paise per day
  maxPrice: z.coerce.number().int().min(0).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  delivery: z.coerce.boolean().optional(),
  instant: z.coerce.boolean().optional(),
  verified: z.coerce.boolean().optional(),
  ownerId: z.string().optional(),
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(), // minLng,minLat,maxLng,maxLat
  sort: z.enum(["recommended", "distance", "price_asc", "price_desc", "rating", "newest"]).default("recommended"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

export type SearchInput = z.infer<typeof searchSchema>;

export const blockSchema = z
  .object({ startAt: z.coerce.date(), endAt: z.coerce.date(), reason: z.string().max(200).optional() })
  .refine((v) => v.endAt > v.startAt, { message: "End must be after start", path: ["endAt"] });

export const quoteSchema = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  protectionPlan: z.coerce.boolean().default(false),
  fulfillment: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"),
});
