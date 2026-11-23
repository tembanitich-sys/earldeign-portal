import type { Executor } from "@/db";
import { documentEvents } from "@/db/schema";
import type { Ctx } from "./access";

export async function recordEvent(db: Executor, ctx: Ctx, docType: string, docId: string, action: string, role: string | null, comment?: string | null) {
  await db.insert(documentEvents).values({
    jvId: ctx.jv.id, docType, docId, actorId: ctx.userId, actorRole: role, action, comment: comment || null,
  });
}
