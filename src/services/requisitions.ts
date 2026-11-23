import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB, Executor } from "@/db";
import {
  categories, incomeApplications, projects, receipts, requisitionLines, requisitions, supplierInvoices, supplierPayments, users,
} from "@/db/schema";
import { actingRole, can, requirePerm, type Ctx } from "@/lib/access";
import { audit } from "@/lib/audit";
import { addDays, parseIsoDate, todayIso } from "@/lib/dates";
import { assert, DomainError } from "@/lib/errors";
import { recordEvent } from "@/lib/events";
import { incomeHeld, post } from "@/lib/ledger";
import { formatMinor, lineTotal, parsePositiveAmount } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { notify } from "@/lib/notify";

export type RequisitionRow = typeof requisitions.$inferSelect;

export const REQ_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  cto_review: "Pending CTO review",
  finance_review: "Pending finance approval",
  approved: "Approved, awaiting disbursement",
  returned: "Returned for correction",
  rejected: "Rejected",
  cancelled: "Cancelled",
  acquittal_pending: "Disbursed, acquittal pending",
  closed: "Closed",
};

export const POSTED_STATUSES = ["acquittal_pending", "closed"];

export type LineInput = { description: string; quantity: string; unitCost: string };

export type RequisitionInput = {
  projectId?: string | null;
  categoryId?: string | null;
  currency: string;
  urgency?: string;
  requiredBy?: string | null;
  justification?: string | null;
  payee: string;
  endSupplier?: string | null;
  paymentMethod: string;
  payeeBankDetails?: string | null;
  payFrom?: string;
  supplierInvoiceId?: string | null;
  parentRequisitionId?: string | null;
  lines: LineInput[];
};

function link(ctx: Ctx, id: string) {
  return `/j/${ctx.jv.code}/requisitions/${id}`;
}

export async function getRequisition(db: Executor, ctx: Ctx, id: string): Promise<RequisitionRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError("Requisition not found.");
  const [r] = await db.select().from(requisitions).where(and(eq(requisitions.id, id), eq(requisitions.jvId, ctx.jv.id)));
  if (!r) throw new DomainError("Requisition not found.");
  if (!can(ctx, "view_finance") && r.requesterId !== ctx.userId) throw new DomainError("Requisition not found.");
  return r;
}

async function validateRefs(db: Executor, ctx: Ctx, input: RequisitionInput) {
  assert(ctx.jv.currencies.includes(input.currency), "Choose one of this JV's currencies.");
  assert(["cash", "bank_transfer"].includes(input.paymentMethod), "Choose cash or bank transfer.");
  assert(["funding_partner", "jv_income"].includes(input.payFrom ?? "funding_partner"), "Choose who pays.");
  assert(input.payee?.trim(), "Payee is required.");
  if (input.paymentMethod === "bank_transfer") {
    assert(input.payeeBankDetails?.trim(), "Payee bank details are required for a bank transfer.");
  }
  if (input.projectId) {
    const [p] = await db.select().from(projects).where(and(eq(projects.id, input.projectId), eq(projects.jvId, ctx.jv.id)));
    assert(p, "Choose a project from the list.");
  }
  if (input.categoryId) {
    const [c] = await db.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.jvId, ctx.jv.id)));
    assert(c, "Choose a category from the list.");
  }
  if (input.supplierInvoiceId) {
    const [s] = await db.select().from(supplierInvoices).where(and(eq(supplierInvoices.id, input.supplierInvoiceId), eq(supplierInvoices.jvId, ctx.jv.id)));
    assert(s, "Choose a supplier invoice from the list.");
    assert(s.currency === input.currency, `The supplier invoice is in ${s.currency}; the requisition must use the same currency.`);
  }
  const lines = input.lines.filter((l) => l.description.trim() || l.unitCost.trim());
  assert(lines.length > 0, "Add at least one line item.");
  return lines.map((l, i) => {
    assert(l.description.trim(), `Line ${i + 1}: description is required.`);
    const unit = parsePositiveAmount(l.unitCost, `Line ${i + 1} unit cost`);
    const qty = (l.quantity || "1").trim();
    return { position: i + 1, description: l.description.trim(), quantity: qty, unitCost: unit, lineTotal: lineTotal(qty, unit) };
  });
}

async function setSupplierLink(db: Executor, requisitionId: string, supplierInvoiceId: string | null | undefined, amount: number) {
  await db.delete(supplierPayments).where(eq(supplierPayments.requisitionId, requisitionId));
  if (supplierInvoiceId) await db.insert(supplierPayments).values({ requisitionId, supplierInvoiceId, amount });
}

export async function createRequisition(db: DB, ctx: Ctx, input: RequisitionInput): Promise<RequisitionRow> {
  requirePerm(ctx, "create_requisition");
  const role = ctx.roles.includes("cto") ? "cto" : actingRole(ctx, "create_requisition");
  return db.transaction(async (tx) => {
    const lines = await validateRefs(tx, ctx, input);
    if (input.parentRequisitionId) await getRequisition(tx, ctx, input.parentRequisitionId);
    const total = lines.reduce((s, l) => s + l.lineTotal, 0);
    const number = await nextNumber(tx, ctx.jv, "REQ", todayIso());
    const [r] = await tx.insert(requisitions).values({
      jvId: ctx.jv.id, number, status: "draft", requesterId: ctx.userId, requesterRole: role,
      projectId: input.projectId || null, categoryId: input.categoryId || null, currency: input.currency,
      urgency: input.urgency === "urgent" ? "urgent" : "normal", requiredBy: input.requiredBy || null,
      justification: input.justification?.trim() || null, payee: input.payee.trim(), endSupplier: input.endSupplier?.trim() || null,
      paymentMethod: input.paymentMethod, payeeBankDetails: input.payeeBankDetails?.trim() || null,
      payFrom: input.payFrom ?? "funding_partner", total, parentRequisitionId: input.parentRequisitionId || null,
    }).returning();
    await tx.insert(requisitionLines).values(lines.map((l) => ({ ...l, requisitionId: r.id })));
    await setSupplierLink(tx, r.id, input.supplierInvoiceId, total);
    await recordEvent(tx, ctx, "requisition", r.id, "Created", role);
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "requisition.create", entityType: "requisition", entityId: r.id, after: r });
    return r;
  });
}

export async function updateDraft(db: DB, ctx: Ctx, id: string, input: RequisitionInput) {
  return db.transaction(async (tx) => {
    const r = await getRequisition(tx, ctx, id);
    assert(r.requesterId === ctx.userId, "Only the person who raised this requisition can edit it.");
    assert(["draft", "returned"].includes(r.status), "Only draft or returned requisitions can be edited.");
    const lines = await validateRefs(tx, ctx, input);
    const total = lines.reduce((s, l) => s + l.lineTotal, 0);
    const [u] = await tx.update(requisitions).set({
      projectId: input.projectId || null, categoryId: input.categoryId || null, currency: input.currency,
      urgency: input.urgency === "urgent" ? "urgent" : "normal", requiredBy: input.requiredBy || null,
      justification: input.justification?.trim() || null, payee: input.payee.trim(), endSupplier: input.endSupplier?.trim() || null,
      paymentMethod: input.paymentMethod, payeeBankDetails: input.payeeBankDetails?.trim() || null,
      payFrom: input.payFrom ?? r.payFrom, total, updatedAt: new Date(),
    }).where(eq(requisitions.id, id)).returning();
    await tx.delete(requisitionLines).where(eq(requisitionLines.requisitionId, id));
    await tx.insert(requisitionLines).values(lines.map((l) => ({ ...l, requisitionId: id })));
    await setSupplierLink(tx, id, input.supplierInvoiceId, total);
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "requisition.edit", entityType: "requisition", entityId: id, before: r, after: u });
    return u;
  });
}

export async function submitRequisition(db: DB, ctx: Ctx, id: string) {
  return db.transaction(async (tx) => {
    const r = await getRequisition(tx, ctx, id);
    assert(r.requesterId === ctx.userId, "Only the person who raised this requisition can submit it.");
    assert(["draft", "returned"].includes(r.status), "This requisition has already been submitted.");
    // Project Coordinator requisitions always go to the CTO first; there is no direct route to finance.
    const next = r.requesterRole === "project_coordinator" ? "cto_review" : "finance_review";
    await tx.update(requisitions).set({ status: next, updatedAt: new Date() }).where(eq(requisitions.id, id));
    await recordEvent(tx, ctx, "requisition", id, r.status === "returned" ? "Resubmitted" : "Submitted", r.requesterRole);
    await notify(tx, ctx, {
      roles: next === "cto_review" ? ["cto"] : ["finance_officer"],
      title: `${r.number} awaits your review`,
      body: `${r.payee}: ${r.currency} ${formatMinor(r.total)}`,
      link: link(ctx, id),
    });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "requisition.submit", entityType: "requisition", entityId: id, after: { status: next } });
  });
}

export async function cancelRequisition(db: DB, ctx: Ctx, id: string) {
  return db.transaction(async (tx) => {
    const r = await getRequisition(tx, ctx, id);
    assert(r.requesterId === ctx.userId, "Only the person who raised this requisition can cancel it.");
    assert(["draft", "returned", "cto_review", "finance_review"].includes(r.status), "An approved requisition cannot be cancelled.");
    await tx.update(requisitions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(requisitions.id, id));
    await recordEvent(tx, ctx, "requisition", id, "Cancelled", r.requesterRole);
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "requisition.cancel", entityType: "requisition", entityId: id });
  });
}

export type Decision = "approve" | "return" | "reject";

export async function ctoReview(db: DB, ctx: Ctx, id: string, decision: Decision, comment?: string) {
  requirePerm(ctx, "cto_review");
  return db.transaction(async (tx) => {
    const r = await getRequisition(tx, ctx, id);
    assert(r.status === "cto_review", "This requisition is not waiting for CTO review.");
    assert(r.requesterId !== ctx.userId, "You cannot review a requisition you raised.");
    if (decision !== "approve") assert(comment?.trim(), "Add a comment explaining what needs to change.");
    const next = decision === "approve" ? "finance_review" : decision === "return" ? "returned" : "rejected";
    await tx.update(requisitions).set({ status: next, updatedAt: new Date() }).where(eq(requisitions.id, id));
    await recordEvent(tx, ctx, "requisition", id, decision === "approve" ? "Reviewed and forwarded to finance" : decision === "return" ? "Returned for correction" : "Rejected", "cto", comment);
    await notify(tx, ctx, { userIds: [r.requesterId], title: `${r.number}: ${REQ_STATUS_LABEL[next]}`, body: comment, link: link(ctx, id) });
    if (next === "finance_review") {
      await notify(tx, ctx, { roles: ["finance_officer"], title: `${r.number} awaits finance approval`, body: `${r.payee}: ${r.currency} ${formatMinor(r.total)}`, link: link(ctx, id) });
    }
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: `requisition.cto_${decision}`, entityType: "requisition", entityId: id, after: { status: next, comment } });
  });
}

export async function financeReview(db: DB, ctx: Ctx, id: string, decision: Decision, opts: { comment?: string; payFrom?: string } = {}) {
  requirePerm(ctx, "finance_review");
  return db.transaction(async (tx) => {
    const r = await getRequisition(tx, ctx, id);
    assert(r.status === "finance_review", "This requisition is not waiting for finance approval.");
    assert(r.requesterId !== ctx.userId, "You cannot approve a requisition you raised.");
    if (decision !== "approve") assert(opts.comment?.trim(), "Add a comment explaining the decision.");
    const payFrom = opts.payFrom ?? r.payFrom;
    assert(["funding_partner", "jv_income"].includes(payFrom), "Choose who pays.");
    const next = decision === "approve" ? "approved" : decision === "return" ? "returned" : "rejected";
    await tx.update(requisitions).set({
      status: next, payFrom, approvedById: decision === "approve" ? ctx.userId : null, updatedAt: new Date(),
    }).where(eq(requisitions.id, id));
    const label = decision === "approve" ? `Approved (pay from ${payFrom === "jv_income" ? "JV income" : ctx.jv.fundingPartner})` : decision === "return" ? "Returned for correction" : "Rejected";
    await recordEvent(tx, ctx, "requisition", id, label, "finance_officer", opts.comment);
    await notify(tx, ctx, { userIds: [r.requesterId], title: `${r.number}: ${REQ_STATUS_LABEL[next]}`, body: opts.comment, link: link(ctx, id) });
    if (next === "approved") {
      await notify(tx, ctx, { roles: ["finance_clerk"], title: `${r.number} approved for disbursement`, body: `${r.payee}: ${r.currency} ${formatMinor(r.total)}`, link: link(ctx, id) });
    }
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: `requisition.finance_${decision}`, entityType: "requisition", entityId: id, after: { status: next, payFrom, comment: opts.comment } });
  });
}

/** FIFO link of a JV-income-funded requisition to the receipts that funded it (informational). */
async function linkIncomeSources(tx: Executor, r: RequisitionRow, amount: number) {
  const rows = await tx.select({
    id: receipts.id,
    amount: receipts.amount,
    used: sql<string>`coalesce((select sum(${incomeApplications.amount}) from ${incomeApplications} where ${incomeApplications.receiptId} = ${receipts.id} and ${incomeApplications.active}), 0)`,
  }).from(receipts).where(and(eq(receipts.jvId, r.jvId), eq(receipts.currency, r.currency))).orderBy(asc(receipts.receivedDate), asc(receipts.createdAt));
  let left = amount;
  for (const rc of rows) {
    if (left <= 0) break;
    const avail = rc.amount - Number(rc.used);
    if (avail <= 0) continue;
    const take = Math.min(avail, left);
    await tx.insert(incomeApplications).values({ jvId: r.jvId, requisitionId: r.id, receiptId: rc.id, amount: take });
    left -= take;
  }
  if (left > 0) await tx.insert(incomeApplications).values({ jvId: r.jvId, requisitionId: r.id, receiptId: null, amount: left });
}

/**
 * Posts the ledger entries a requisition implies in its current state. Used on disbursement and when an
 * authorised change request re-posts a requisition after reversing its previous entries.
 */
export async function postRequisitionEntries(tx: Executor, r: RequisitionRow, actorId: string, changeRequestId?: string | null) {
  const date = r.isHistorical ? r.historicalDate! : r.disbursedAt!;
  const desc = r.isHistorical ? (r.historicalDescription ?? r.payee) : `${r.payee}${r.endSupplier ? ` (for ${r.endSupplier})` : ""}`;
  await post(tx, {
    jvId: r.jvId, entryDate: date, currency: r.currency, type: r.isHistorical ? "opening_balance" : "drawdown",
    loanDelta: r.total, description: desc, reference: r.number, sourceType: "requisition", sourceId: r.id,
    createdById: actorId, changeRequestId,
  });
  if (r.payFrom === "jv_income") {
    const held = await incomeHeld(tx, r.jvId, r.currency);
    if (held < r.total) {
      throw new DomainError(`Not enough JV income held in ${r.currency}: ${formatMinor(held)} available, ${formatMinor(r.total)} needed. Pay from the funding partner instead, or record the receipt first.`);
    }
    await post(tx, {
      jvId: r.jvId, entryDate: date, currency: r.currency, type: "income_applied_offset",
      loanDelta: -r.total, incomeDelta: -r.total, description: `JV income applied to ${r.number}`, reference: r.number,
      sourceType: "requisition", sourceId: r.id, createdById: actorId, changeRequestId,
    });
    await tx.update(incomeApplications).set({ active: false }).where(eq(incomeApplications.requisitionId, r.id));
    await linkIncomeSources(tx, r, r.total);
  }
  if (!r.isHistorical && r.status === "closed" && (r.acquittalChange ?? 0) > 0) {
    const change = r.acquittalChange!;
    await post(tx, {
      jvId: r.jvId, entryDate: date > todayIso() ? date : todayIso(), currency: r.currency, type: "advance_refund",
      loanDelta: r.payFrom === "jv_income" ? 0 : -change,
      incomeDelta: r.payFrom === "jv_income" ? change : 0,
      description: `Change returned on ${r.number}`, reference: r.number, sourceType: "requisition", sourceId: r.id,
      createdById: actorId, changeRequestId,
    });
  }
}

export async function disburse(db: DB, ctx: Ctx, id: string, input: { method: string; date: string; reference?: string }) {
  requirePerm(ctx, "disburse");
  return db.transaction(async (tx) => {
    const r = await getRequisition(tx, ctx, id);
    assert(r.status === "approved", "Only approved requisitions can be disbursed.");
    assert(r.approvedById !== ctx.userId, "The person who approved this requisition cannot also disburse it.");
    assert(r.requesterId !== ctx.userId, "You cannot disburse a requisition you raised.");
    assert(["cash", "bank_transfer"].includes(input.method), "Choose cash or bank transfer.");
    const date = parseIsoDate(input.date, "Disbursement date");
    assert(date <= todayIso(), "Disbursement date cannot be in the future.");
    if (input.method === "bank_transfer") assert(input.reference?.trim(), "Enter the bank transfer reference.");
    const [u] = await tx.update(requisitions).set({
      status: "acquittal_pending", disbursedById: ctx.userId, disbursedAt: date, disbursementMethod: input.method,
      disbursementRef: input.reference?.trim() || null, updatedAt: new Date(),
    }).where(eq(requisitions.id, id)).returning();
    await postRequisitionEntries(tx, u, ctx.userId);
    await recordEvent(tx, ctx, "requisition", id, `Disbursed by ${input.method === "cash" ? "cash" : "bank transfer"}${input.reference ? ` (ref ${input.reference})` : ""}`, "finance_clerk");
    await notify(tx, ctx, {
      userIds: [r.requesterId], title: `${r.number} disbursed`,
      body: `Submit the acquittal (receipts and actual spend) by ${addDays(date, ctx.jv.acquittalDays)}.`, link: link(ctx, id),
    });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "requisition.disburse", entityType: "requisition", entityId: id, after: u });
    return u;
  });
}

export async function submitAcquittal(db: DB, ctx: Ctx, id: string, input: { actual: string; note?: string }) {
  return db.transaction(async (tx) => {
    const r = await getRequisition(tx, ctx, id);
    assert(r.requesterId === ctx.userId || can(ctx, "disburse"), "Only the requester or a Finance Clerk can submit the acquittal.");
    assert(r.status === "acquittal_pending", "This requisition is not awaiting acquittal.");
    const actual = parsePositiveAmount(input.actual, "Actual amount spent");
    if (actual > r.total) {
      throw new DomainError(`Actual spend exceeds the amount disbursed (${r.currency} ${formatMinor(r.total)}). Record ${formatMinor(r.total)} here and raise a supplementary requisition for the difference.`);
    }
    await tx.update(requisitions).set({
      acquittalActual: actual, acquittalChange: r.total - actual, acquittalNote: input.note?.trim() || null,
      acquittalSubmittedAt: new Date(), updatedAt: new Date(),
    }).where(eq(requisitions.id, id));
    await recordEvent(tx, ctx, "requisition", id, `Acquittal submitted: spent ${formatMinor(actual)}, change ${formatMinor(r.total - actual)}`, can(ctx, "disburse") && r.requesterId !== ctx.userId ? "finance_clerk" : r.requesterRole, input.note);
    await notify(tx, ctx, { roles: ["finance_officer"], title: `${r.number}: acquittal awaits approval`, link: link(ctx, id) });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "requisition.acquittal_submit", entityType: "requisition", entityId: id, after: { actual } });
  });
}

export async function decideAcquittal(db: DB, ctx: Ctx, id: string, decision: "approve" | "return", comment?: string) {
  requirePerm(ctx, "approve_acquittal");
  return db.transaction(async (tx) => {
    const r = await getRequisition(tx, ctx, id);
    assert(r.status === "acquittal_pending" && r.acquittalSubmittedAt, "There is no acquittal to approve yet.");
    assert(r.requesterId !== ctx.userId, "You cannot approve the acquittal of a requisition you raised.");
    if (decision === "return") {
      assert(comment?.trim(), "Explain what is missing from the acquittal.");
      await tx.update(requisitions).set({ acquittalSubmittedAt: null, updatedAt: new Date() }).where(eq(requisitions.id, id));
      await recordEvent(tx, ctx, "requisition", id, "Acquittal returned", "finance_officer", comment);
      await notify(tx, ctx, { userIds: [r.requesterId], title: `${r.number}: acquittal returned`, body: comment, link: link(ctx, id) });
      return;
    }
    const [u] = await tx.update(requisitions).set({ status: "closed", updatedAt: new Date() }).where(eq(requisitions.id, id)).returning();
    if ((u.acquittalChange ?? 0) > 0) {
      await post(tx, {
        jvId: u.jvId, entryDate: todayIso(), currency: u.currency, type: "advance_refund",
        loanDelta: u.payFrom === "jv_income" ? 0 : -u.acquittalChange!,
        incomeDelta: u.payFrom === "jv_income" ? u.acquittalChange! : 0,
        description: `Change returned on ${u.number}`, reference: u.number, sourceType: "requisition", sourceId: u.id, createdById: ctx.userId,
      });
    }
    await recordEvent(tx, ctx, "requisition", id, "Acquittal approved, requisition closed", "finance_officer", comment);
    await notify(tx, ctx, { userIds: [r.requesterId], title: `${r.number} closed`, link: link(ctx, id) });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "requisition.acquittal_approve", entityType: "requisition", entityId: id });
  });
}

export async function listRequisitions(db: Executor, ctx: Ctx, filter: { status?: string; mine?: boolean } = {}) {
  const conds = [eq(requisitions.jvId, ctx.jv.id)];
  if (!can(ctx, "view_finance") || filter.mine) conds.push(eq(requisitions.requesterId, ctx.userId));
  if (filter.status === "open") conds.push(inArray(requisitions.status, ["draft", "returned", "cto_review", "finance_review", "approved", "acquittal_pending"]));
  else if (filter.status === "historical") conds.push(eq(requisitions.isHistorical, true));
  else if (filter.status) conds.push(eq(requisitions.status, filter.status));
  return db.select({
    r: requisitions, requester: users.name, project: projects.name, category: categories.name,
  }).from(requisitions)
    .innerJoin(users, eq(users.id, requisitions.requesterId))
    .leftJoin(projects, eq(projects.id, requisitions.projectId))
    .leftJoin(categories, eq(categories.id, requisitions.categoryId))
    .where(and(...conds)).orderBy(desc(requisitions.createdAt)).limit(500);
}

export async function requisitionDetail(db: Executor, ctx: Ctx, id: string) {
  const r = await getRequisition(db, ctx, id);
  const lines = await db.select().from(requisitionLines).where(eq(requisitionLines.requisitionId, id)).orderBy(asc(requisitionLines.position));
  const [link] = await db.select({ si: supplierInvoices, amount: supplierPayments.amount }).from(supplierPayments)
    .innerJoin(supplierInvoices, eq(supplierInvoices.id, supplierPayments.supplierInvoiceId))
    .where(eq(supplierPayments.requisitionId, id));
  return { r, lines, supplierLink: link ?? null };
}
