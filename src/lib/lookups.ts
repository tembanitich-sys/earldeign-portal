import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, clients, documentEvents, projects, supplierInvoices, users } from "@/db/schema";
import type { Ctx } from "./access";
import { CURRENCY_LABEL } from "./money";

export const ccyLabels = CURRENCY_LABEL;

export async function projectsOf(ctx: Ctx, activeOnly = true) {
  const rows = await db.select().from(projects).where(eq(projects.jvId, ctx.jv.id)).orderBy(asc(projects.name));
  return activeOnly ? rows.filter((r) => r.active) : rows;
}
export async function categoriesOf(ctx: Ctx, activeOnly = true) {
  const rows = await db.select().from(categories).where(eq(categories.jvId, ctx.jv.id)).orderBy(asc(categories.name));
  return activeOnly ? rows.filter((r) => r.active) : rows;
}
export async function clientsOf(ctx: Ctx) {
  return db.select().from(clients).where(eq(clients.jvId, ctx.jv.id)).orderBy(asc(clients.name));
}
export async function supplierInvoicesOf(ctx: Ctx) {
  return db.select().from(supplierInvoices).where(eq(supplierInvoices.jvId, ctx.jv.id)).orderBy(asc(supplierInvoices.supplier));
}
export async function eventsOf(ctx: Ctx, docType: string, docId: string) {
  return db.select({ e: documentEvents, who: users.name }).from(documentEvents).innerJoin(users, eq(users.id, documentEvents.actorId))
    .where(and(eq(documentEvents.jvId, ctx.jv.id), eq(documentEvents.docType, docType), eq(documentEvents.docId, docId))).orderBy(asc(documentEvents.at));
}
export async function userName(id: string | null | undefined) {
  if (!id) return null;
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
  return u?.name ?? null;
}
