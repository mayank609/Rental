/** Standalone background worker process (scale separately from the API). */
import { initSentry } from "./lib/sentry";
initSentry();
import { startWorkers } from "./jobs/scheduler";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";

startWorkers()
  .then(() => logger.info("worker running"))
  .catch((err) => {
    logger.fatal({ err }, "worker failed to start");
    process.exit(1);
  });

const shutdown = async () => {
  logger.info("worker shutting down");
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
