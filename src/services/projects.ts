import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { projects } from "@/db/schema";
import { requirePerm, type Ctx } from "@/lib/access";
import { audit } from "@/lib/audit";
import { assert } from "@/lib/errors";

/** CTO and Finance Officer can add projects to their own JV. Projects are never deleted, only deactivated. */
export async function addProject(db: DB, ctx: Ctx, name: string) {
  requirePerm(ctx, "manage_projects");
  const n = name?.trim() ?? "";
  assert(n.length >= 2 && n.length <= 80, "Enter a project name between 2 and 80 characters.");
  return db.transaction(async (tx) => {
    const [dupe] = await tx.select().from(projects).where(and(eq(projects.jvId, ctx.jv.id), sql`lower(${projects.name}) = lower(${n})`));
    assert(!dupe, dupe?.active ? `"${dupe?.name}" already exists.` : `"${dupe?.name}" already exists but is inactive. Reactivate it instead.`);
    const [p] = await tx.insert(projects).values({ jvId: ctx.jv.id, name: n }).returning();
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "project.create", entityType: "project", entityId: p.id, after: { name: n } });
    return p;
  });
}

export async function setProjectActive(db: DB, ctx: Ctx, id: string, active: boolean) {
  requirePerm(ctx, "manage_projects");
  assert(/^[0-9a-f-]{36}$/i.test(id), "Project not found.");
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(projects).where(and(eq(projects.id, id), eq(projects.jvId, ctx.jv.id)));
    assert(p, "Project not found.");
    await tx.update(projects).set({ active }).where(eq(projects.id, id));
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: active ? "project.activate" : "project.deactivate", entityType: "project", entityId: id, after: { name: p.name } });
  });
}
