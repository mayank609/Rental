/** Zod request validation. Parsed values replace the raw input. */
import type { NextFunction, Request, Response } from "express";
import { z, ZodSchema } from "zod";

type Schemas = { body?: ZodSchema; query?: ZodSchema; params?: ZodSchema };

export const validate = (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query) {
      // Express 5 exposes req.query as a getter; redefine with parsed value.
      const parsed = schemas.query.parse(req.query);
      Object.defineProperty(req, "query", { value: parsed, writable: true, configurable: true });
    }
    if (schemas.body) req.body = schemas.body.parse(req.body);
    next();
  } catch (err) {
    next(err);
  }
};

/** Query-string boolean: "true"/"1"/"yes"/"on" → true, "false"/"0"/"no"/"off"/"" → false. */
export const queryBool = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "1", "yes", "on"].includes(v.toLowerCase());
  return v;
}, z.boolean());
