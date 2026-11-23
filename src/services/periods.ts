import { and, desc, eq } from "drizzle-orm";
import type { DB, Executor } from "@/db";
import { periods, users } from "@/db/schema";
import { requirePerm, type Ctx } from "@/lib/access";
import { audit } from "@/lib/audit";
import { todayIso } from "@/lib/dates";
import { assert } from "@/lib/errors";

export async function closePeriod(db: DB, ctx: Ctx, ym: string) {
  requirePerm(ctx, "close_period");
  assert(/^\d{4}-\d{2}$/.test(ym), "Choose a month.");
  assert(ym < todayIso().slice(0, 7), "Only past months can be closed.");
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(periods).where(and(eq(periods.jvId, ctx.jv.id), eq(periods.yearMonth, ym)));
    assert(!existing, "That month is already closed.");
    await tx.insert(periods).values({ jvId: ctx.jv.id, yearMonth: ym, closedById: ctx.userId });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "period.close", entityType: "period", entityId: ym });
  });
}

export async function listPeriods(db: Executor, ctx: Ctx) {
  return db.select({ p: periods, by: users.name }).from(periods).innerJoin(users, eq(users.id, periods.closedById))
    .where(eq(periods.jvId, ctx.jv.id)).orderBy(desc(periods.yearMonth));
}
