/** Structured JSON logging with pino (pretty-printed in development). */
import pino from "pino";
import { env, isProd } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.passwordHash", "*.code", "*.token"],
    censor: "[redacted]",
  },
  transport: isProd || env.NODE_ENV === "test" ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
