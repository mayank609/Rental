/** Central error → JSON response mapping. */
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import multer from "multer";
import * as Sentry from "@sentry/node";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { isProd } from "../config/env";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid input", details: err.flatten() },
    });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message: err.message } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: { code: "DUPLICATE", message: "Resource already exists" } });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
    }
  }
  const e = err as { type?: string; status?: number; message?: string };
  if (e?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "Malformed JSON body" } });
  }
  logger.error({ err, path: req.path, requestId: req.requestId }, "unhandled error");
  Sentry.captureException(err);
  res.status(500).json({
    error: {
      code: "INTERNAL",
      message: "Something went wrong. Please try again.",
      ...(isProd ? {} : { debug: e?.message }),
    },
  });
}
