/**
 * Centralised, validated environment configuration.
 * The process fails fast on boot when a required variable is missing/invalid.
 */
import "dotenv/config";
import { z } from "zod";

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  PLATFORM_NAME: z.string().default("RentNest"),
  APP_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:4000"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  COUNTRY_CODE: z.string().default("IN"),
  CURRENCY: z.string().default("INR"),
  DEFAULT_TIMEZONE: z.string().default("Asia/Kolkata"),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  /** Disable Redis entirely (tests / constrained envs). Falls back to in-memory. */
  REDIS_DISABLED: bool.default(false),
  /** Run BullMQ workers in the API process (small deployments). */
  RUN_WORKERS_IN_API: bool.default(true),

  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me-please"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me-please"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  /** 32-byte hex key used for AES-256-GCM encryption of bank account numbers. */
  DATA_ENCRYPTION_KEY: z.string().default("0".repeat(64)),

  OTP_TTL_SECONDS: z.coerce.number().default(300),
  /** Return OTP codes in API responses (NEVER enable in production). */
  OTP_DEV_ECHO: bool.default(false),

  GOOGLE_CLIENT_ID: z.string().optional(),

  // Payments
  PAYMENT_PROVIDER: z.enum(["razorpay", "mock"]).default("mock"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_ACCOUNT_NUMBER: z.string().optional(),

  // Storage
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("ap-south-1"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(false),
  LOCAL_UPLOAD_DIR: z.string().default("uploads"),

  // Maps / geocoding
  GEOCODER: z.enum(["google", "mapbox", "nominatim", "offline"]).default("nominatim"),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  MAPBOX_TOKEN: z.string().optional(),
  IP_GEO_URL: z.string().default("http://ip-api.com/json"),

  // Notifications
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("RentNest <no-reply@rentnest.in>"),
  SMS_PROVIDER: z.enum(["console", "msg91", "twilio"]).default("console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@rentnest.in"),

  // Observability
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SENTRY_DSN: z.string().optional(),

  // Company info printed on invoices
  COMPANY_LEGAL_NAME: z.string().default("RentNest Technologies Pvt. Ltd."),
  COMPANY_GSTIN: z.string().default("29ABCDE1234F1Z5"),
  COMPANY_ADDRESS: z.string().default("Bengaluru, Karnataka, India"),
  SUPPORT_EMAIL: z.string().default("support@rentnest.in"),

  /** Serve built client from ./public with SEO meta injection (single-service deploy). */
  SERVE_CLIENT_DIR: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

if (isProd) {
  const insecure: string[] = [];
  if (env.JWT_ACCESS_SECRET.startsWith("dev-")) insecure.push("JWT_ACCESS_SECRET");
  if (env.JWT_REFRESH_SECRET.startsWith("dev-")) insecure.push("JWT_REFRESH_SECRET");
  if (/^0+$/.test(env.DATA_ENCRYPTION_KEY)) insecure.push("DATA_ENCRYPTION_KEY");
  if (env.OTP_DEV_ECHO) insecure.push("OTP_DEV_ECHO must be false");
  if (insecure.length) {
    // eslint-disable-next-line no-console
    console.error("❌ Insecure production configuration:", insecure.join(", "));
    process.exit(1);
  }
}
