import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DB, Executor } from "@/db";
import {
  categories, changeRequests, clients, incomeApplications, invoices, projects, receiptAllocations, receipts, requisitionLines,
  requisitions, supplierInvoiceLines, supplierInvoices, supplierPayments, users, type Role,
} from "@/db/schema";
import { AUTHORISING_ROLES, requirePerm, type Ctx } from "@/lib/access";
import { audit } from "@/lib/audit";
import { parseIsoDate } from "@/lib/dates";
import { assert, DomainError } from "@/lib/errors";
import { recordEvent } from "@/lib/events";
import { incomeHeld, post, reverseAllFor } from "@/lib/ledger";
import { formatMinor, parsePositiveAmount } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { notify } from "@/lib/notify";
import { getInvoice, getReceipt, invoiceSettlement } from "./income";
import { getRequisition, postRequisitionEntries, POSTED_STATUSES } from "./requisitions";
import { getSupplierInvoice, supplierPaid, validateSupplierLines, type SupplierLineInput } from "./suppliers";

export type TargetType = "requisition" | "receipt" | "invoice" | "supplier_invoice";

export const FIELD_LABEL: Record<string, string> = {
  date: "Date", amount: "Amount", currency: "Currency", payFrom: "Paid from", projectId: "Project", categoryId: "Category",
  payee: "Payee", endSupplier: "End supplier", description: "Description", supplierInvoiceId: "Supplier invoice",
  method: "Method", bankRef: "Bank reference", clientId: "Client", issueDate: "Issue date", dueDate: "Due date",
  fiscalInvoiceNo: "Fiscal invoice number", notes: "Notes", externalNumber: "External invoice number",
  supplier: "Supplier", supplierInvoiceNo: "Supplier invoice number", invoiceDate: "Invoice date", lines: "Lines",
};

export const TARGET_LABEL: Record<TargetType, string> = {
  requisition: "Requisition", receipt: "Receipt", invoice: "Invoice", supplier_invoice: "Supplier invoice",
};

type Values = Record<string, unknown>;

const LEDGER_FIELDS: Record<TargetType, string[]> = {
  requisition: ["date", "amount", "currency", "payFrom"],
  receipt: ["date", "amount", "currency"],
  invoice: [],
  supplier_invoice: [],
};

/** Current values of the editable fields of a target, in canonical form. */
export async function currentValues(db: Executor, ctx: Ctx, type: TargetType, id: string): Promise<{ label: string; values: Values }> {
  if (type === "requisition") {
    const r = await getRequisition(db, ctx, id);
    assert(r.isHistorical || POSTED_STATUSES.includes(r.status), "Only disbursed or historical requisitions are changed through change requests. Drafts are edited directly by the requester.");
    const [link] = await db.select().from(supplierPayments).where(eq(supplierPayments.requisitionId, id));
    return {
      label: r.number,
      values: {
        date: r.isHistorical ? r.historicalDate : r.disbursedAt, amount: r.total, currency: r.currency, payFrom: r.payFrom,
        projectId: r.projectId ?? "", categoryId: r.categoryId ?? "", payee: r.payee, endSupplier: r.endSupplier ?? "",
        description: (r.isHistorical ? r.historicalDescription : r.justification) ?? "", supplierInvoiceId: link?.supplierInvoiceId ?? "",
      },
    };
  }
  if (type === "receipt") {
    const rc = await getReceipt(db, ctx, id);
    return { label: rc.number, values: { date: rc.receivedDate, amount: rc.amount, currency: rc.currency, method: rc.method, bankRef: rc.bankRef ?? "", clientId: rc.clientId } };
  }
  if (type === "invoice") {
    const inv = await getInvoice(db, ctx, id);
    assert(inv.status !== "draft", "Draft invoices are edited directly by the Finance Officer.");
    assert(inv.status !== "void", "This invoice is void.");
    const v: Values = { issueDate: inv.issueDate, dueDate: inv.dueDate ?? "", fiscalInvoiceNo: inv.fiscalInvoiceNo ?? "", notes: inv.notes ?? "", projectId: inv.projectId ?? "", clientId: inv.clientId };
    if (inv.kind === "external") v.externalNumber = inv.externalNumber ?? "";
    return { label: inv.number, values: v };
  }
  const si = await getSupplierInvoice(db, ctx, id);
  const lines = await db.select().from(supplierInvoiceLines).where(eq(supplierInvoiceLines.supplierInvoiceId, id));
  return {
    label: `${si.supplier} ${si.supplierInvoiceNo}`,
    values: {
      supplier: si.supplier, supplierInvoiceNo: si.supplierInvoiceNo, invoiceDate: si.invoiceDate, currency: si.currency,
      lines: lines.map((l) => ({ projectId: l.projectId, description: l.description, amount: l.amount })),
    },
  };
}

/** Parses raw form input for a target into canonical values (same shape as currentValues). */
async function parseProposed(db: Executor, ctx: Ctx, type: TargetType, raw: Record<string, unknown>, current: Values): Promise<Values> {
  const out: Values = {};
  const str = (k: string) => (raw[k] === undefined ? undefined : String(raw[k] ?? "").trim());
  for (const k of Object.keys(current)) {
    if (raw[k] === undefined) continue;
    if (k === "amount") out.amount = parsePositiveAmount(raw.amount);
    else if (["date", "issueDate", "invoiceDate"].includes(k)) out[k] = parseIsoDate(raw[k], FIELD_LABEL[k]);
    else if (k === "dueDate") out.dueDate = str("dueDate") ? parseIsoDate(raw.dueDate, "Due date") : "";
    else if (k === "lines") out.lines = (await validateSupplierLines(db, ctx, raw.lines as SupplierLineInput[]));
    else out[k] = str(k);
  }
  if (out.currency !== undefined) assert(ctx.jv.currencies.includes(String(out.currency)), "Choose one of this JV's currencies.");
  if (out.payFrom !== undefined) assert(["funding_partner", "jv_income"].includes(String(out.payFrom)), "Choose who paid.");
  if (out.projectId) {
    const [p] = await db.select().from(projects).where(and(eq(projects.id, String(out.projectId)), eq(projects.jvId, ctx.jv.id)));
    assert(p, "Choose a project from the list.");
  }
  if (out.categoryId) {
    const [c] = await db.select().from(categories).where(and(eq(categories.id, String(out.categoryId)), eq(categories.jvId, ctx.jv.id)));
    assert(c, "Choose a category from the list.");
  }
  if (out.clientId) {
    const [c] = await db.select().from(clients).where(and(eq(clients.id, String(out.clientId)), eq(clients.jvId, ctx.jv.id)));
    assert(c, "Choose a client from the list.");
  }
  if (out.supplierInvoiceId) {
    const [s] = await db.select().from(supplierInvoices).where(and(eq(supplierInvoices.id, String(out.supplierInvoiceId)), eq(supplierInvoices.jvId, ctx.jv.id)));
    assert(s, "Choose a supplier invoice from the list.");
  }
  if (type === "requisition") assert(out.payee === undefined || out.payee, "Payee cannot be empty.");
  if (type === "supplier_invoice") {
    assert(out.supplier === undefined || out.supplier, "Supplier cannot be empty.");
    assert(out.supplierInvoiceNo === undefined || out.supplierInvoiceNo, "Supplier invoice number cannot be empty.");
  }
  return out;
}

/** Stable JSON: object keys sorted, so values compare equal after a round trip through jsonb. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]));
  return v ?? "";
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

function proposerRoleFor(ctx: Ctx): Role {
  const r = AUTHORISING_ROLES.find((x) => ctx.roles.includes(x));
  if (!r) throw new DomainError("Only the CTO or the Finance Officer can propose changes to posted records.");
  return r;
}

export async function proposeChange(db: DB, ctx: Ctx, type: TargetType, targetId: string, raw: Record<string, unknown>, reason: string) {
  requirePerm(ctx, "propose_change");
  const role = proposerRoleFor(ctx);
  assert(reason?.trim(), "Give the reason for the change. The counter-party sees it when authorising.");
  return db.transaction(async (tx) => {
    const { label, values } = await currentValues(tx, ctx, type, targetId);
    const proposed = await parseProposed(tx, ctx, type, raw, values);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(proposed)) if (!same(values[k], v)) changes[k] = { from: values[k], to: v };
    assert(Object.keys(changes).length > 0, "Nothing has changed. Edit at least one field.");
    await precheck(tx, ctx, type, targetId, changes);
    const [pending] = await tx.select({ number: changeRequests.number }).from(changeRequests)
      .where(and(eq(changeRequests.targetType, type), eq(changeRequests.targetId, targetId), eq(changeRequests.status, "pending")));
    if (pending) throw new DomainError(`${pending.number} is already pending for this record. Decide or cancel it first.`);
    const number = await nextNumber(tx, ctx.jv, "CR", new Date().toISOString().slice(0, 10));
    const [cr] = await tx.insert(changeRequests).values({
      jvId: ctx.jv.id, number, targetType: type, targetId, targetLabel: label, changes, reason: reason.trim(), proposerId: ctx.userId, proposerRole: role,
    }).returning();
    const counter: Role = role === "cto" ? "finance_officer" : "cto";
    await notify(tx, ctx, { roles: [counter], title: `${number}: change to ${label} needs your authorisation`, body: reason.trim(), link: `/j/${ctx.jv.code}/changes/${cr.id}` });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "change.propose", entityType: type, entityId: targetId, after: cr });
    return cr;
  });
}

/** Checks that would make the change impossible to apply, run at proposal time and again on authorisation. */
async function precheck(tx: Executor, ctx: Ctx, type: TargetType, id: string, changes: Record<string, { from: unknown; to: unknown }>) {
  if (type === "requisition") {
    if (changes.amount) {
      const lines = await tx.select().from(requisitionLines).where(eq(requisitionLines.requisitionId, id));
      assert(lines.length <= 1, "This requisition has several line items, so the amount cannot be changed as a single figure.");
    }
    if (changes.supplierInvoiceId?.to || changes.currency) {
      const siId = String(changes.supplierInvoiceId?.to ?? (await tx.select().from(supplierPayments).where(eq(supplierPayments.requisitionId, id)))[0]?.supplierInvoiceId ?? "");
      if (siId) {
        const [s] = await tx.select().from(supplierInvoices).where(eq(supplierInvoices.id, siId));
        const cur = String(changes.currency?.to ?? (await getRequisition(tx, ctx, id)).currency);
        assert(s.currency === cur, `The supplier invoice is in ${s.currency}; the requisition must be in the same currency.`);
      }
    }
  }
  if (type === "receipt") {
    const [a] = await tx.select({ v: sql<string>`coalesce(sum(${receiptAllocations.amount}),0)`, n: sql<string>`count(*)` }).from(receiptAllocations).where(eq(receiptAllocations.receiptId, id));
    const allocated = Number(a.v);
    if (changes.amount) assert(Number(changes.amount.to) >= allocated, `${formatMinor(allocated)} of this receipt is allocated to invoices; the amount cannot go below that.`);
    if (changes.currency || changes.clientId) assert(Number(a.n) === 0, "This receipt is allocated to invoices, so its currency and client cannot change.");
  }
  if (type === "invoice" && changes.clientId) {
    const s = (await invoiceSettlement(tx, [id])).get(id)!;
    assert(s.paid + s.credited === 0, "Payments or credit notes exist on this invoice, so the client cannot change.");
  }
  if (type === "supplier_invoice") {
    const paid = (await supplierPaid(tx, [id])).get(id) ?? 0;
    if (changes.currency) {
      const [n] = await tx.select({ n: sql<string>`count(*)` }).from(supplierPayments).where(eq(supplierPayments.supplierInvoiceId, id));
      assert(Number(n.n) === 0, "Payments are linked to this supplier invoice, so its currency cannot change.");
    }
    if (changes.lines) {
      const total = (changes.lines.to as { amount: number }[]).reduce((s, l) => s + l.amount, 0);
      assert(total >= paid, `${formatMinor(paid)} has already been paid against this invoice; the new total cannot be lower.`);
    }
  }
}

export async function getChange(db: Executor, ctx: Ctx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError("Change request not found.");
  requirePerm(ctx, "view_finance");
  const [cr] = await db.select().from(changeRequests).where(and(eq(changeRequests.id, id), eq(changeRequests.jvId, ctx.jv.id)));
  if (!cr) throw new DomainError("Change request not found.");
  return cr;
}

export async function decideChange(db: DB, ctx: Ctx, id: string, decision: "authorise" | "decline", comment?: string) {
  requirePerm(ctx, "authorise_change");
  return db.transaction(async (tx) => {
    const cr = await getChange(tx, ctx, id);
    assert(cr.status === "pending", "This change request has already been decided.");
    assert(cr.proposerId !== ctx.userId, "You cannot authorise a change you proposed. The counter-party must authorise it.");
    const counter: Role = cr.proposerRole === "cto" ? "finance_officer" : "cto";
    assert(ctx.roles.includes(counter), `This change was proposed by the ${cr.proposerRole === "cto" ? "CTO" : "Finance Officer"}; it must be decided by the ${counter === "cto" ? "CTO" : "Finance Officer"}.`);
    if (decision === "decline") {
      assert(comment?.trim(), "Explain why you are declining the change.");
      await tx.update(changeRequests).set({ status: "declined", deciderId: ctx.userId, decidedAt: new Date(), decisionComment: comment!.trim() }).where(eq(changeRequests.id, id));
    } else {
      const { values } = await currentValues(tx, ctx, cr.targetType as TargetType, cr.targetId);
      for (const [k, c] of Object.entries(cr.changes)) {
        if (!same(values[k], c.from)) throw new DomainError(`${FIELD_LABEL[k] ?? k} has changed since this request was raised. Decline it and propose the change again.`);
      }
      await precheck(tx, ctx, cr.targetType as TargetType, cr.targetId, cr.changes);
      await apply(tx, ctx, cr);
      await tx.update(changeRequests).set({ status: "authorised", deciderId: ctx.userId, decidedAt: new Date(), decisionComment: comment?.trim() || null }).where(eq(changeRequests.id, id));
    }
    await recordEvent(tx, ctx, cr.targetType, cr.targetId, `${cr.number} ${decision === "authorise" ? "authorised" : "declined"}`, counter, comment);
    await notify(tx, ctx, { userIds: [cr.proposerId], title: `${cr.number} ${decision === "authorise" ? "authorised" : "declined"}`, body: comment, link: `/j/${ctx.jv.code}/changes/${id}` });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: `change.${decision}`, entityType: cr.targetType, entityId: cr.targetId, after: { cr: cr.number, comment } });
  });
}

export async function cancelChange(db: DB, ctx: Ctx, id: string) {
  return db.transaction(async (tx) => {
    const cr = await getChange(tx, ctx, id);
    assert(cr.status === "pending" && cr.proposerId === ctx.userId, "Only the proposer can cancel a pending change request.");
    await tx.update(changeRequests).set({ status: "cancelled", decidedAt: new Date() }).where(eq(changeRequests.id, id));
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "change.cancel", entityType: cr.targetType, entityId: cr.targetId });
  });
}

async function apply(tx: Executor, ctx: Ctx, cr: typeof changeRequests.$inferSelect) {
  const ch = cr.changes;
  const to = (k: string) => ch[k]?.to;
  const ledger = LEDGER_FIELDS[cr.targetType as TargetType].some((f) => ch[f]);
  const reason = `${cr.number}: ${cr.reason}`;

  if (cr.targetType === "requisition") {
    const r = await getRequisition(tx, ctx, cr.targetId);
    if (ledger) {
      await reverseAllFor(tx, { sourceType: "requisition", sourceId: r.id, createdById: ctx.userId, changeRequestId: cr.id, reason });
      await tx.update(incomeApplications).set({ active: false }).where(eq(incomeApplications.requisitionId, r.id));
    }
    const set: Partial<typeof requisitions.$inferInsert> = { updatedAt: new Date() };
    if (ch.date) { if (r.isHistorical) set.historicalDate = String(to("date")); else set.disbursedAt = String(to("date")); }
    if (ch.amount) {
      set.total = Number(to("amount"));
      await tx.update(requisitionLines).set({ unitCost: set.total, lineTotal: set.total, quantity: "1" }).where(eq(requisitionLines.requisitionId, r.id));
      if (r.acquittalActual !== null) { set.acquittalActual = Math.min(r.acquittalActual, set.total); set.acquittalChange = set.total - set.acquittalActual; }
    }
    if (ch.currency) set.currency = String(to("currency"));
    if (ch.payFrom) set.payFrom = String(to("payFrom"));
    if (ch.projectId) set.projectId = String(to("projectId")) || null;
    if (ch.categoryId) set.categoryId = String(to("categoryId")) || null;
    if (ch.payee) set.payee = String(to("payee"));
    if (ch.endSupplier) set.endSupplier = String(to("endSupplier")) || null;
    if (ch.description) { if (r.isHistorical) set.historicalDescription = String(to("description")); else set.justification = String(to("description")); }
    const [u] = await tx.update(requisitions).set(set).where(eq(requisitions.id, r.id)).returning();
    if (ch.supplierInvoiceId || ch.amount) {
      const [link] = await tx.select().from(supplierPayments).where(eq(supplierPayments.requisitionId, r.id));
      const siId = ch.supplierInvoiceId ? String(to("supplierInvoiceId")) : link?.supplierInvoiceId;
      await tx.delete(supplierPayments).where(eq(supplierPayments.requisitionId, r.id));
      if (siId) await tx.insert(supplierPayments).values({ requisitionId: r.id, supplierInvoiceId: siId, amount: u.total });
    }
    if (ledger) await postRequisitionEntries(tx, u, ctx.userId, cr.id);
    return;
  }

  if (cr.targetType === "receipt") {
    const rc = await getReceipt(tx, ctx, cr.targetId);
    if (ledger) await reverseAllFor(tx, { sourceType: "receipt", sourceId: rc.id, createdById: ctx.userId, changeRequestId: cr.id, reason });
    const set: Partial<typeof receipts.$inferInsert> = {};
    if (ch.date) set.receivedDate = String(to("date"));
    if (ch.amount) set.amount = Number(to("amount"));
    if (ch.currency) set.currency = String(to("currency"));
    if (ch.method) set.method = String(to("method"));
    if (ch.bankRef) set.bankRef = String(to("bankRef")) || null;
    if (ch.clientId) set.clientId = String(to("clientId"));
    const [u] = await tx.update(receipts).set(set).where(eq(receipts.id, rc.id)).returning();
    if (ledger) {
      const [client] = await tx.select().from(clients).where(eq(clients.id, u.clientId));
      await post(tx, {
        jvId: u.jvId, entryDate: u.receivedDate, currency: u.currency, type: "receipt", incomeDelta: u.amount,
        description: `Receipt from ${client.name}`, reference: u.number, sourceType: "receipt", sourceId: u.id, createdById: ctx.userId, changeRequestId: cr.id,
      });
      for (const c of new Set([rc.currency, u.currency])) {
        const held = await incomeHeld(tx, u.jvId, c);
        assert(held >= 0, `This change would leave JV income held in ${c} negative (${formatMinor(held)}), because the income has already been applied to expenses.`);
      }
    }
    return;
  }

  if (cr.targetType === "invoice") {
    const set: Partial<typeof invoices.$inferInsert> = {};
    if (ch.issueDate) set.issueDate = String(to("issueDate"));
    if (ch.dueDate) set.dueDate = String(to("dueDate")) || null;
    if (ch.fiscalInvoiceNo) set.fiscalInvoiceNo = String(to("fiscalInvoiceNo")) || null;
    if (ch.notes) set.notes = String(to("notes")) || null;
    if (ch.projectId) set.projectId = String(to("projectId")) || null;
    if (ch.clientId) set.clientId = String(to("clientId"));
    if (ch.externalNumber) set.externalNumber = String(to("externalNumber"));
    await tx.update(invoices).set(set).where(eq(invoices.id, cr.targetId));
    return;
  }

  // supplier_invoice
  const set: Partial<typeof supplierInvoices.$inferInsert> = {};
  if (ch.supplier) set.supplier = String(to("supplier"));
  if (ch.supplierInvoiceNo) set.supplierInvoiceNo = String(to("supplierInvoiceNo"));
  if (ch.invoiceDate) set.invoiceDate = String(to("invoiceDate"));
  if (ch.currency) set.currency = String(to("currency"));
  if (ch.lines) {
    const lines = to("lines") as { projectId: string; description: string; amount: number }[];
    set.total = lines.reduce((s, l) => s + l.amount, 0);
    await tx.delete(supplierInvoiceLines).where(eq(supplierInvoiceLines.supplierInvoiceId, cr.targetId));
    await tx.insert(supplierInvoiceLines).values(lines.map((l) => ({ ...l, supplierInvoiceId: cr.targetId })));
  }
  if (Object.keys(set).length) await tx.update(supplierInvoices).set(set).where(eq(supplierInvoices.id, cr.targetId));
}

export async function listChanges(db: Executor, ctx: Ctx, status?: string) {
  requirePerm(ctx, "view_finance");
  const conds = [eq(changeRequests.jvId, ctx.jv.id)];
  if (status) conds.push(eq(changeRequests.status, status));
  return db.select({ cr: changeRequests, proposer: users.name }).from(changeRequests).innerJoin(users, eq(users.id, changeRequests.proposerId))
    .where(and(...conds)).orderBy(desc(changeRequests.proposedAt)).limit(300);
}

export async function pendingChangeFor(db: Executor, type: TargetType, id: string) {
  const [cr] = await db.select().from(changeRequests).where(and(eq(changeRequests.targetType, type), eq(changeRequests.targetId, id), eq(changeRequests.status, "pending")));
  return cr ?? null;
}

export async function changesFor(db: Executor, type: TargetType, id: string) {
  return db.select().from(changeRequests).where(and(eq(changeRequests.targetType, type), eq(changeRequests.targetId, id))).orderBy(asc(changeRequests.proposedAt));
}
