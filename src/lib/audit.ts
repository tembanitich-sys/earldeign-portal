import type { Executor } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(db: Executor, entry: {
  actorId?: string | null; jvId?: string | null; action: string; entityType?: string; entityId?: string;
  before?: unknown; after?: unknown; ip?: string | null;
}) {
  await db.insert(auditLog).values({
    actorId: entry.actorId ?? null,
    jvId: entry.jvId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before === undefined ? null : (JSON.parse(JSON.stringify(entry.before)) as object),
    after: entry.after === undefined ? null : (JSON.parse(JSON.stringify(entry.after)) as object),
    ip: entry.ip ?? null,
  });
}
