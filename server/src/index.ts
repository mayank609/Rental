/** API process entrypoint: HTTP + socket.io (+ workers for small deploys). */
import { initSentry } from "./lib/sentry";
initSentry();
import http from "node:http";
import { env } from "./config/env";
import { createApp } from "./app";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { startWorkers } from "./jobs/scheduler";

const app = createApp();
const server = http.createServer(app);
initSocket(server);

server.listen(env.PORT, async () => {
  logger.info(`🚀 ${env.PLATFORM_NAME} API listening on :${env.PORT} (${env.NODE_ENV})`);
  logger.info(`📚 API docs at ${env.API_URL}/api/docs`);
  if (env.RUN_WORKERS_IN_API) await startWorkers();
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "shutting down");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => logger.error({ err }, "unhandled rejection"));
