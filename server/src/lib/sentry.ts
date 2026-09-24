/** Sentry error tracking (no-op when SENTRY_DSN is unset). */
import * as Sentry from "@sentry/node";
import { env } from "../config/env";

export function initSentry() {
  if (!env.SENTRY_DSN) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });
}
