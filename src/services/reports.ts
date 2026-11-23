import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import {
  budgets, changeRequests, clients, importBatches, invoiceRequests, invoices, jvs, memberships, requisitions,
} from "@/db/schema";
import { can, type Ctx } from "@/lib/access";
import { addDays, daysBetween, todayIso } from "@/lib/dates";
import { balances } from "@/lib/ledger";
import { invoiceSettlement, openInvoices } from "./income";
import { listSupplierInvoices } from "./suppliers";

export type CurrencySummary = {
  currency: string; loan: number; incomeHeld: number; net: number; receivables: number; payables: number;
  monthSpend: number; monthBudget: number | null;
};

export async function currencySummaries(db: Executor, ctx: Ctx): Promise<CurrencySummary[]> {
  const bal = await balances(db, ctx.jv.id, ctx.jv.currencies);
  const open = await openInvoices(db, ctx);
  const sup = await listSupplierInvoices(db, ctx);
  const monthStart = todayIso().slice(0, 7) + "-01";
  const spend = await db.select({ c: requisitions.currency, v: sql<string>`coalesce(sum(${requisitions.total}),0)` }).from(requisitions)
    .where(and(eq(requisitions.jvId, ctx.jv.id), eq(requisitions.isHistorical, false), inArray(requisitions.status, ["acquittal_pending", "closed"]), gte(requisitions.disbursedAt, monthStart)))
    .groupBy(requisitions.currency);
  const bud = await db.select().from(budgets).where(eq(budgets.jvId, ctx.jv.id));
  return bal.map((b) => ({
    ...b,
    receivables: open.filter((o) => o.inv.currency === b.currency).reduce((s, o) => s + o.outstanding, 0),
    payables: sup.filter((s) => s.si.currency === b.currency).reduce((s, x) => s + x.outstanding, 0),
    monthSpend: Number(spend.find((s) => s.c === b.currency)?.v ?? 0),
    monthBudget: bud.find((x) => x.currency === b.currency)?.monthlyAmount ?? null,
  }));
}

export type ActionItem = { label: string; count: number; href: string };

export async function myActions(db: Executor, ctx: Ctx): Promise<ActionItem[]> {
  const base = `/j/${ctx.jv.code}`;
  const items: ActionItem[] = [];
  const countReq = async (status: string, extra?: ReturnType<typeof sql>) => {
    const [r] = await db.select({ n: sql<string>`count(*)` }).from(requisitions).where(and(eq(requisitions.jvId, ctx.jv.id), eq(requisitions.status, status), sql`${requisitions.requesterId} <> ${ctx.userId}`, extra ?? sql`true`));
    return Number(r.n);
  };
  if (can(ctx, "cto_review")) items.push({ label: "Requisitions awaiting CTO review", count: await countReq("cto_review"), href: `${base}/requisitions?status=cto_review` });
  if (can(ctx, "finance_review")) items.push({ label: "Requisitions awaiting finance approval", count: await countReq("finance_review"), href: `${base}/requisitions?status=finance_review` });
  if (can(ctx, "disburse")) items.push({ label: "Approved requisitions to disburse", count: await countReq("approved"), href: `${base}/requisitions?status=approved` });
  if (can(ctx, "approve_acquittal")) items.push({ label: "Acquittals awaiting approval", count: await countReq("acquittal_pending", sql`${requisitions.acquittalSubmittedAt} is not null`), href: `${base}/requisitions?status=acquittal_pending` });
  if (can(ctx, "cto_review") || can(ctx, "issue_invoice")) {
    const st = can(ctx, "issue_invoice") ? "finance_review" : "cto_review";
    const [r] = await db.select({ n: sql<string>`count(*)` }).from(invoiceRequests).where(and(eq(invoiceRequests.jvId, ctx.jv.id), eq(invoiceRequests.status, st), sql`${invoiceRequests.requesterId} <> ${ctx.userId}`));
    items.push({ label: "Invoice requests awaiting you", count: Number(r.n), href: `${base}/invoice-requests` });
  }
  if (can(ctx, "authorise_change")) {
    const counterOf = ctx.roles.includes("cto") && ctx.roles.includes("finance_officer") ? null : ctx.roles.includes("cto") ? "finance_officer" : "cto";
    const [r] = await db.select({ n: sql<string>`count(*)` }).from(changeRequests).where(and(eq(changeRequests.jvId, ctx.jv.id), eq(changeRequests.status, "pending"), sql`${changeRequests.proposerId} <> ${ctx.userId}`, counterOf ? eq(changeRequests.proposerRole, counterOf) : sql`true`));
    items.push({ label: "Changes awaiting your authorisation", count: Number(r.n), href: `${base}/changes` });
    const [b] = await db.select({ n: sql<string>`count(*)` }).from(importBatches).where(and(eq(importBatches.jvId, ctx.jv.id), eq(importBatches.status, "pending"), sql`${importBatches.uploadedById} <> ${ctx.userId}`));
    if (Number(b.n)) items.push({ label: "Historical import awaiting authorisation", count: Number(b.n), href: `${base}/import` });
  }
  const [mine] = await db.select({ n: sql<string>`count(*)` }).from(requisitions).where(and(eq(requisitions.jvId, ctx.jv.id), eq(requisitions.requesterId, ctx.userId), inArray(requisitions.status, ["returned", "draft"])));
  if (Number(mine.n)) items.push({ label: "Your drafts and returned requisitions", count: Number(mine.n), href: `${base}/requisitions?status=open` });
  const [acq] = await db.select({ n: sql<string>`count(*)` }).from(requisitions).where(and(eq(requisitions.jvId, ctx.jv.id), eq(requisitions.requesterId, ctx.userId), eq(requisitions.status, "acquittal_pending"), sql`${requisitions.acquittalSubmittedAt} is null`));
  if (Number(acq.n)) items.push({ label: "Your acquittals to submit", count: Number(acq.n), href: `${base}/requisitions?status=acquittal_pending` });
  return items;
}

export async function overdueAcquittals(db: Executor, ctx: Ctx) {
  const cutoff = addDays(todayIso(), -ctx.jv.acquittalDays);
  return db.select().from(requisitions).where(and(eq(requisitions.jvId, ctx.jv.id), eq(requisitions.status, "acquittal_pending"), sql`${requisitions.acquittalSubmittedAt} is null`, sql`${requisitions.disbursedAt} < ${cutoff}`)).orderBy(asc(requisitions.disbursedAt));
}

export async function overdueInvoices(db: Executor, ctx: Ctx) {
  const t = todayIso();
  return (await openInvoices(db, ctx)).filter((o) => o.inv.dueDate && o.inv.dueDate < t);
}

export function taxClearanceWarning(ctx: Ctx): string | null {
  const exp = ctx.jv.taxClearanceExpiry;
  if (!exp) return "No tax clearance expiry date is recorded for this JV's front-facing company.";
  const days = daysBetween(todayIso(), exp);
  if (days < 0) return `The tax clearance certificate expired on ${exp}.`;
  if (days <= 30) return `The tax clearance certificate expires in ${days} days (${exp}).`;
  return null;
}

/** Debtors ageing per currency: current, 1 to 30, 31 to 60, 61 to 90, over 90 days past due. */
export async function debtorsAgeing(db: Executor, ctx: Ctx) {
  const t = todayIso();
  const open = await openInvoices(db, ctx);
  const rows = new Map<string, { client: string; currency: string; current: number; d30: number; d60: number; d90: number; d90p: number; total: number }>();
  for (const o of open) {
    const k = `${o.client}|${o.inv.currency}`;
    if (!rows.has(k)) rows.set(k, { client: o.client, currency: o.inv.currency, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0 });
    const r = rows.get(k)!;
    const due = o.inv.dueDate ?? o.inv.issueDate;
    const late = daysBetween(due, t);
    if (late <= 0) r.current += o.outstanding; else if (late <= 30) r.d30 += o.outstanding; else if (late <= 60) r.d60 += o.outstanding; else if (late <= 90) r.d90 += o.outstanding; else r.d90p += o.outstanding;
    r.total += o.outstanding;
  }
  return [...rows.values()].sort((a, b) => a.currency.localeCompare(b.currency) || a.client.localeCompare(b.client));
}

export async function clientStatement(db: Executor, ctx: Ctx, clientId: string) {
  const invs = await db.select().from(invoices).where(and(eq(invoices.jvId, ctx.jv.id), eq(invoices.clientId, clientId), sql`${invoices.status} not in ('draft','void')`)).orderBy(asc(invoices.issueDate));
  const s = await invoiceSettlement(db, invs.map((i) => i.id));
  return invs.map((inv) => ({ inv, ...s.get(inv.id)!, outstanding: inv.total - s.get(inv.id)!.paid - s.get(inv.id)!.credited }));
}

/** Portfolio summary for a user across every JV they can see the books of. */
export async function portfolio(db: Executor, userId: string) {
  const ms = await db.select({ jv: jvs, role: memberships.role }).from(memberships).innerJoin(jvs, eq(jvs.id, memberships.jvId))
    .where(and(eq(memberships.userId, userId), eq(jvs.active, true)));
  const seen = new Map<string, typeof jvs.$inferSelect>();
  for (const m of ms) if (["cto", "finance_officer", "finance_clerk", "partner_viewer", "director"].includes(m.role)) seen.set(m.jv.id, m.jv);
  const out = [];
  for (const jv of seen.values()) out.push({ jv, balances: await balances(db, jv.id, jv.currencies) });
  return out;
}

export { clients };
