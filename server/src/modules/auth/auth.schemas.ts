import { z } from "zod";

/** Normalise Indian numbers to E.164 (+91XXXXXXXXXX); accepts other E.164 too. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-()]/g, ""))
  .transform((v) => (/^[6-9]\d{9}$/.test(v) ? `+91${v}` : /^91[6-9]\d{9}$/.test(v) ? `+${v}` : v))
  .refine((v) => /^\+[1-9]\d{7,14}$/.test(v), "Enter a valid mobile number");

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

export const otpRequestSchema = z
  .object({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    purpose: z.enum(["login", "verify_phone", "verify_email", "reset_password"]).default("login"),
  })
  .refine((v) => v.phone || v.email, "Phone or email is required");

export const otpVerifySchema = z
  .object({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    code: z.string().regex(/^\d{6}$/),
    name: z.string().trim().min(2).max(80).optional(),
    consent: z.boolean().optional(),
  })
  .refine((v) => v.phone || v.email, "Phone or email is required");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms and Privacy Policy" }) }),
  marketingOptIn: z.boolean().optional(),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const googleSchema = z.object({ idToken: z.string().min(10), consent: z.boolean().optional() });
export const resetPasswordSchema = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/), password: passwordSchema });
export const changePasswordSchema = z.object({ currentPassword: z.string().optional(), newPassword: passwordSchema });
