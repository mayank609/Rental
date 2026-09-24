/** Append-only audit trail helper for sensitive/admin actions. */
import { prisma, Tx } from "./prisma";

export async function audit(
  data: { actorId?: string | null; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; ip?: string },
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      actorId: data.actorId ?? null,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      before: (data.before as object) ?? undefined,
      after: (data.after as object) ?? undefined,
      ip: data.ip,
    },
  });
}
