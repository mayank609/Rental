/** Singleton Prisma client. */
import { PrismaClient, Prisma } from "@prisma/client";
import { isProd } from "../config/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: isProd ? ["error"] : ["error", "warn"] });

if (!isProd) globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;
export { Prisma };
