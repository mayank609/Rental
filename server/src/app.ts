/**
 * Express application factory (no network listeners — used by tests too).
 */
import path from "node:path";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env, isProd } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { localUploadRoot } from "./lib/storage";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { globalLimiter } from "./middleware/rateLimit";
import { allowedOrigins, requestId } from "./middleware/security";
import { buildOpenApi } from "./docs/openapi";

import { authRouter } from "./modules/auth/auth.routes";
import { locationsRouter } from "./modules/locations/locations.routes";
import { categoriesRouter } from "./modules/categories/categories.routes";
import { listingsRouter } from "./modules/listings/listings.routes";
import { uploadsRouter } from "./modules/uploads/uploads.routes";
import { bookingsRouter } from "./modules/bookings/bookings.routes";
import { paymentsRouter, webhookRouter } from "./modules/payments/payments.routes";
import { payoutsRouter } from "./modules/payouts/payouts.routes";
import { invoicesRouter } from "./modules/invoices/invoices.routes";
import { monetizationRouter } from "./modules/monetization/monetization.routes";
import { reviewsRouter } from "./modules/reviews/reviews.routes";
import { chatRouter } from "./modules/chat/chat.routes";
import { disputesRouter } from "./modules/disputes/disputes.routes";
import { reportsRouter } from "./modules/trust/reports.routes";
import { usersRouter } from "./modules/users/users.routes";
import { legalRouter } from "./modules/legal/legal.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { seoRouter, spaWithSeo } from "./modules/seo/seo";

// Register background job handlers (inline execution when Redis is off)
import "./jobs/scheduler";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", isProd ? 1 : "loopback");

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId ?? "",
      autoLogging: { ignore: (req) => req.url === "/health" },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    }),
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }, // images served to the SPA on another origin
      contentSecurityPolicy: env.SERVE_CLIENT_DIR
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "https://checkout.razorpay.com", "https://accounts.google.com"],
              frameSrc: ["https://api.razorpay.com", "https://checkout.razorpay.com", "https://accounts.google.com"],
              imgSrc: ["'self'", "data:", "blob:", "https:"],
              connectSrc: ["'self'", "https:", "wss:"],
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
            },
          }
        : undefined,
    }),
  );
  app.use(cors({ origin: allowedOrigins, credentials: true, exposedHeaders: ["x-request-id"] }));
  app.use(compression());

  // Webhooks need the raw body → mounted before the JSON parser
  app.use("/api/v1/webhooks", webhookRouter);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", async (_req, res) => {
    const checks: Record<string, string> = {};
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = "ok";
    } catch {
      checks.db = "down";
    }
    checks.redis = redis ? (redis.status === "ready" ? "ok" : redis.status) : "disabled";
    const ok = checks.db === "ok";
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks, time: new Date().toISOString() });
  });

  // Locally stored uploads (dev). Private files (KYC/invoices) are never served.
  app.use("/uploads", (req, res, next) => (req.path.startsWith("/private") ? res.status(404).end() : next()), express.static(localUploadRoot, { maxAge: "30d", immutable: true }));

  const openapi = buildOpenApi();
  app.get("/api/docs/openapi.json", (_req, res) => res.json(openapi));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: `${env.PLATFORM_NAME} API` }));

  const v1 = express.Router();
  v1.use(globalLimiter);
  v1.use("/auth", authRouter);
  v1.use("/locations", locationsRouter);
  v1.use("/categories", categoriesRouter);
  v1.use("/listings", listingsRouter);
  v1.use("/uploads", uploadsRouter);
  v1.use("/bookings", bookingsRouter);
  v1.use("/payments", paymentsRouter);
  v1.use("/payouts", payoutsRouter);
  v1.use("/invoices", invoicesRouter);
  v1.use("/monetization", monetizationRouter);
  v1.use("/reviews", reviewsRouter);
  v1.use("/chat", chatRouter);
  v1.use("/disputes", disputesRouter);
  v1.use("/reports", reportsRouter);
  v1.use("/users", usersRouter);
  v1.use("/legal", legalRouter);
  v1.use("/admin", adminRouter);
  app.use("/api/v1", v1);

  app.use(seoRouter);

  if (env.SERVE_CLIENT_DIR) {
    const dir = path.resolve(env.SERVE_CLIENT_DIR);
    app.use(spaWithSeo(dir));
    app.use(express.static(dir, { maxAge: "1y", index: false }));
    app.use(spaWithSeo(dir));
  }

  app.use("/api", notFoundHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
