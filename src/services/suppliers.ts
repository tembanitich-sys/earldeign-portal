import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB, Executor } from "@/db";
import { projects, requisitions, supplierInvoiceLines, supplierInvoices, supplierPayments } from "@/db/schema";
import { requirePerm, type Ctx } from "@/lib/access";
import { audit } from "@/lib/audit";
import { parseIsoDate } from "@/lib/dates";
import { assert, DomainError } from "@/lib/errors";
import { recordEvent } from "@/lib/events";
import { parsePositiveAmount } from "@/lib/money";

export const PAID_REQ_STATUSES = ["acquittal_pending", "closed"];

export type SupplierLineInput = { projectId: string; description: string; amount: string };
export type SupplierInvoiceInput = { supplier: string; supplierInvoiceNo: string; invoiceDate: string; currency: string; lines: SupplierLineInput[] };

export async function validateSupplierLines(db: Executor, ctx: Ctx, lines: SupplierLineInput[]) {
  const used = lines.filter((l) => l.description?.trim() || l.amount?.trim());
  assert(used.length > 0, "Add at least one line, each tagged with a project.");
  const out = [];
  for (const [i, l] of used.entries()) {
    assert(l.projectId, `Line ${i + 1}: choose the project.`);
    const [p] = await db.select().from(projects).where(and(eq(projects.id, l.projectId), eq(projects.jvId, ctx.jv.id)));
    assert(p, `Line ${i + 1}: choose a project from the list.`);
    assert(l.description?.trim(), `Line ${i + 1}: description is required.`);
    out.push({ projectId: l.projectId, description: l.description.trim(), amount: parsePositiveAmount(l.amount, `Line ${i + 1} amount`) });
  }
  return out;
}

export async function createSupplierInvoice(db: DB, ctx: Ctx, input: SupplierInvoiceInput) {
  requirePerm(ctx, "record_supplier_invoice");
  return db.transaction(async (tx) => {
    assert(input.supplier?.trim(), "Supplier name is required.");
    assert(input.supplierInvoiceNo?.trim(), "Supplier invoice number is required.");
    assert(ctx.jv.currencies.includes(input.currency), "Choose one of this JV's currencies.");
    const date = parseIsoDate(input.invoiceDate, "Invoice date");
    const lines = await validateSupplierLines(tx, ctx, input.lines);
    const [dupe] = await tx.select({ id: supplierInvoices.id }).from(supplierInvoices).where(and(
      eq(supplierInvoices.jvId, ctx.jv.id), sql`lower(${supplierInvoices.supplier}) = lower(${input.supplier.trim()})`, eq(supplierInvoices.supplierInvoiceNo, input.supplierInvoiceNo.trim()),
    ));
    if (dupe) throw new DomainError(`Invoice ${input.supplierInvoiceNo.trim()} from ${input.supplier.trim()} is already recorded.`);
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const [si] = await tx.insert(supplierInvoices).values({
      jvId: ctx.jv.id, supplier: input.supplier.trim(), supplierInvoiceNo: input.supplierInvoiceNo.trim(), invoiceDate: date,
      currency: input.currency, total, createdById: ctx.userId,
    }).returning();
    await tx.insert(supplierInvoiceLines).values(lines.map((l) => ({ ...l, supplierInvoiceId: si.id })));
    await recordEvent(tx, ctx, "supplier_invoice", si.id, "Recorded", null);
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "supplier_invoice.create", entityType: "supplier_invoice", entityId: si.id, after: { si, lines } });
    return si;
  });
}

export async function setDispute(db: DB, ctx: Ctx, id: string, disputed: boolean, comment?: string) {
  requirePerm(ctx, "record_supplier_invoice");
  return db.transaction(async (tx) => {
    const si = await getSupplierInvoice(tx, ctx, id);
    if (disputed) assert(comment?.trim(), "Explain what is disputed.");
    await tx.update(supplierInvoices).set({ disputed, disputeComment: disputed ? comment!.trim() : null }).where(eq(supplierInvoices.id, id));
    await recordEvent(tx, ctx, "supplier_invoice", id, disputed ? "Marked as disputed" : "Dispute cleared", null, comment);
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "supplier_invoice.dispute", entityType: "supplier_invoice", entityId: si.id, after: { disputed, comment } });
  });
}

export async function getSupplierInvoice(db: Executor, ctx: Ctx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError("Supplier invoice not found.");
  requirePerm(ctx, "view_finance");
  const [si] = await db.select().from(supplierInvoices).where(and(eq(supplierInvoices.id, id), eq(supplierInvoices.jvId, ctx.jv.id)));
  if (!si) throw new DomainError("Supplier invoice not found.");
  return si;
}

/** Paid amounts per supplier invoice: only disbursed (or historical) requisitions count as payments. */
export async function supplierPaid(db: Executor, ids: string[]) {
  const out = new Map<string, number>();
  ids.forEach((id) => out.set(id, 0));
  if (!ids.length) return out;
  const rows = await db.select({ id: supplierPayments.supplierInvoiceId, v: sql<string>`sum(${supplierPayments.amount})` })
    .from(supplierPayments).innerJoin(requisitions, eq(requisitions.id, supplierPayments.requisitionId))
    .where(and(inArray(supplierPayments.supplierInvoiceId, ids), inArray(requisitions.status, PAID_REQ_STATUSES)))
    .groupBy(supplierPayments.supplierInvoiceId);
  rows.forEach((r) => out.set(r.id, Number(r.v)));
  return out;
}

export async function listSupplierInvoices(db: Executor, ctx: Ctx) {
  requirePerm(ctx, "view_finance");
  const rows = await db.select().from(supplierInvoices).where(eq(supplierInvoices.jvId, ctx.jv.id)).orderBy(desc(supplierInvoices.invoiceDate));
  const paid = await supplierPaid(db, rows.map((r) => r.id));
  return rows.map((si) => {
    const p = paid.get(si.id) ?? 0;
    const status = p >= si.total ? "paid" : p > 0 ? "part_paid" : "open";
    return { si, paid: p, outstanding: si.total - p, status };
  });
}

export async function supplierInvoiceDetail(db: Executor, ctx: Ctx, id: string) {
  const si = await getSupplierInvoice(db, ctx, id);
  const lines = await db.select({ l: supplierInvoiceLines, project: projects.name }).from(supplierInvoiceLines)
    .innerJoin(projects, eq(projects.id, supplierInvoiceLines.projectId)).where(eq(supplierInvoiceLines.supplierInvoiceId, id));
  const payments = await db.select({ r: requisitions, amount: supplierPayments.amount }).from(supplierPayments)
    .innerJoin(requisitions, eq(requisitions.id, supplierPayments.requisitionId)).where(eq(supplierPayments.supplierInvoiceId, id))
    .orderBy(asc(requisitions.createdAt));
  const paid = payments.filter((p) => PAID_REQ_STATUSES.includes(p.r.status)).reduce((s, p) => s + p.amount, 0);
  return { si, lines, payments, paid, outstanding: si.total - paid };
}

/**
 * Project cost view: per project and currency, what suppliers invoiced, what has been paid (split by
 * funding source), and what is still owed. Payments are spread across an invoice's projects pro rata.
 */
export async function projectCosts(db: Executor, ctx: Ctx) {
  requirePerm(ctx, "view_finance");
  const projs = await db.select().from(projects).where(eq(projects.jvId, ctx.jv.id)).orderBy(asc(projects.name));
  const invs = await db.select().from(supplierInvoices).where(eq(supplierInvoices.jvId, ctx.jv.id));
  const lines = invs.length ? await db.select().from(supplierInvoiceLines).where(inArray(supplierInvoiceLines.supplierInvoiceId, invs.map((i) => i.id))) : [];
  const pays = invs.length ? await db.select({ siId: supplierPayments.supplierInvoiceId, amount: supplierPayments.amount, payFrom: requisitions.payFrom })
    .from(supplierPayments).innerJoin(requisitions, eq(requisitions.id, supplierPayments.requisitionId))
    .where(and(inArray(supplierPayments.supplierInvoiceId, invs.map((i) => i.id)), inArray(requisitions.status, PAID_REQ_STATUSES))) : [];
  // All spend recorded against a project (requisitions), regardless of supplier invoices.
  const spend = await db.select({ projectId: requisitions.projectId, currency: requisitions.currency, payFrom: requisitions.payFrom, v: sql<string>`sum(coalesce(${requisitions.acquittalActual}, ${requisitions.total}))` })
    .from(requisitions).where(and(eq(requisitions.jvId, ctx.jv.id), inArray(requisitions.status, PAID_REQ_STATUSES)))
    .groupBy(requisitions.projectId, requisitions.currency, requisitions.payFrom);

  type Row = { projectId: string | null; project: string; currency: string; invoiced: number; paidPartner: number; paidIncome: number; outstanding: number; totalSpend: number };
  const key = (p: string | null, c: string) => `${p ?? "none"}|${c}`;
  const map = new Map<string, Row>();
  const get = (projectId: string | null, currency: string) => {
    const k = key(projectId, currency);
    if (!map.has(k)) map.set(k, { projectId, project: projs.find((p) => p.id === projectId)?.name ?? "No project", currency, invoiced: 0, paidPartner: 0, paidIncome: 0, outstanding: 0, totalSpend: 0 });
    return map.get(k)!;
  };
  for (const si of invs) {
    const siLines = lines.filter((l) => l.supplierInvoiceId === si.id);
    const siPays = pays.filter((p) => p.siId === si.id);
    for (const l of siLines) {
      const share = si.total ? l.amount / si.total : 0;
      const row = get(l.projectId, si.currency);
      row.invoiced += l.amount;
      for (const p of siPays) {
        const part = Math.round(p.amount * share);
        if (p.payFrom === "jv_income") row.paidIncome += part; else row.paidPartner += part;
      }
    }
  }
  for (const s of spend) get(s.projectId, s.currency).totalSpend += Number(s.v);
  for (const r of map.values()) r.outstanding = r.invoiced - r.paidPartner - r.paidIncome;
  return [...map.values()].sort((a, b) => a.project.localeCompare(b.project) || a.currency.localeCompare(b.currency));
}
