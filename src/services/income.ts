import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB, Executor } from "@/db";
import {
  clients, conversions, creditNotes, invoiceLines, invoiceRequests, invoices, projects, receiptAllocations, receipts, users,
} from "@/db/schema";
import { actingRole, can, requirePerm, type Ctx } from "@/lib/access";
import { audit } from "@/lib/audit";
import { parseIsoDate, todayIso } from "@/lib/dates";
import { assert, DomainError } from "@/lib/errors";
import { recordEvent } from "@/lib/events";
import { incomeHeld, post } from "@/lib/ledger";
import { formatMinor, lineTotal, parsePositiveAmount, vatOn } from "@/lib/money";
import { nextNumber } from "@/lib/numbering";
import { notify } from "@/lib/notify";

const uuidRe = /^[0-9a-f-]{36}$/i;

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", issued: "Issued", part_paid: "Part paid", paid: "Paid", credit_noted: "Credited", void: "Void",
};
export const IR_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", cto_review: "Pending CTO review", finance_review: "Pending Finance Officer",
  returned: "Returned for correction", rejected: "Rejected", invoiced: "Invoiced", cancelled: "Cancelled",
};

// ---------------------------------------------------------------- clients

export type ClientInput = { name: string; contactPerson?: string; email?: string; phone?: string; address?: string; vatNo?: string };

export async function saveClient(db: DB, ctx: Ctx, input: ClientInput, id?: string) {
  requirePerm(ctx, "manage_clients");
  assert(input.name?.trim(), "Client name is required.");
  const values = {
    name: input.name.trim(), contactPerson: input.contactPerson?.trim() || null, email: input.email?.trim() || null,
    phone: input.phone?.trim() || null, address: input.address?.trim() || null, vatNo: input.vatNo?.trim() || null,
  };
  return db.transaction(async (tx) => {
    const [dupe] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.jvId, ctx.jv.id), sql`lower(${clients.name}) = lower(${values.name})`));
    if (dupe && dupe.id !== id) throw new DomainError(`A client called "${values.name}" already exists.`);
    if (id) {
      const before = await getClient(tx, ctx, id);
      const [c] = await tx.update(clients).set(values).where(eq(clients.id, id)).returning();
      await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "client.update", entityType: "client", entityId: id, before, after: c });
      return c;
    }
    const [c] = await tx.insert(clients).values({ ...values, jvId: ctx.jv.id }).returning();
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "client.create", entityType: "client", entityId: c.id, after: c });
    return c;
  });
}

export async function getClient(db: Executor, ctx: Ctx, id: string) {
  if (!uuidRe.test(id)) throw new DomainError("Client not found.");
  const [c] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.jvId, ctx.jv.id)));
  if (!c) throw new DomainError("Client not found.");
  return c;
}

// ---------------------------------------------------------------- invoice requests

export type InvoiceRequestInput = { clientId: string; projectId?: string | null; currency: string; description: string; amount: string; requestedDueDate?: string | null };

export async function createInvoiceRequest(db: DB, ctx: Ctx, input: InvoiceRequestInput) {
  requirePerm(ctx, "create_invoice_request");
  const role = ctx.roles.includes("cto") ? "cto" : actingRole(ctx, "create_invoice_request");
  return db.transaction(async (tx) => {
    await getClient(tx, ctx, input.clientId);
    assert(ctx.jv.currencies.includes(input.currency), "Choose one of this JV's currencies.");
    assert(input.description?.trim(), "Describe the work or services to invoice.");
    const amount = parsePositiveAmount(input.amount);
    if (input.projectId) {
      const [p] = await tx.select().from(projects).where(and(eq(projects.id, input.projectId), eq(projects.jvId, ctx.jv.id)));
      assert(p, "Choose a project from the list.");
    }
    const number = await nextNumber(tx, ctx.jv, "IR", todayIso());
    const [ir] = await tx.insert(invoiceRequests).values({
      jvId: ctx.jv.id, number, requesterId: ctx.userId, requesterRole: role, clientId: input.clientId,
      projectId: input.projectId || null, currency: input.currency, description: input.description.trim(), amount,
      requestedDueDate: input.requestedDueDate || null,
    }).returning();
    await recordEvent(tx, ctx, "invoice_request", ir.id, "Created", role);
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "invoice_request.create", entityType: "invoice_request", entityId: ir.id, after: ir });
    return ir;
  });
}

export async function getInvoiceRequest(db: Executor, ctx: Ctx, id: string) {
  if (!uuidRe.test(id)) throw new DomainError("Invoice request not found.");
  const [ir] = await db.select().from(invoiceRequests).where(and(eq(invoiceRequests.id, id), eq(invoiceRequests.jvId, ctx.jv.id)));
  if (!ir || (!can(ctx, "view_finance") && ir.requesterId !== ctx.userId)) throw new DomainError("Invoice request not found.");
  return ir;
}

export async function submitInvoiceRequest(db: DB, ctx: Ctx, id: string) {
  return db.transaction(async (tx) => {
    const ir = await getInvoiceRequest(tx, ctx, id);
    assert(ir.requesterId === ctx.userId, "Only the requester can submit this invoice request.");
    assert(["draft", "returned"].includes(ir.status), "This request has already been submitted.");
    const next = ir.requesterRole === "project_coordinator" ? "cto_review" : "finance_review";
    await tx.update(invoiceRequests).set({ status: next }).where(eq(invoiceRequests.id, id));
    await recordEvent(tx, ctx, "invoice_request", id, "Submitted", ir.requesterRole);
    await notify(tx, ctx, { roles: next === "cto_review" ? ["cto"] : ["finance_officer"], title: `${ir.number}: invoice request awaits you`, link: `/j/${ctx.jv.code}/invoice-requests/${id}` });
  });
}

export async function reviewInvoiceRequest(db: DB, ctx: Ctx, id: string, decision: "approve" | "return" | "reject", comment?: string) {
  return db.transaction(async (tx) => {
    const ir = await getInvoiceRequest(tx, ctx, id);
    assert(ir.requesterId !== ctx.userId, "You cannot review your own invoice request.");
    if (decision !== "approve") assert(comment?.trim(), "Add a comment explaining the decision.");
    let next: string;
    let role: string;
    if (ir.status === "cto_review") {
      requirePerm(ctx, "cto_review");
      role = "cto";
      next = decision === "approve" ? "finance_review" : decision === "return" ? "returned" : "rejected";
    } else if (ir.status === "finance_review") {
      requirePerm(ctx, "issue_invoice");
      role = "finance_officer";
      assert(decision !== "approve", "Approve by creating the invoice from this request.");
      next = decision === "return" ? "returned" : "rejected";
    } else throw new DomainError("This request is not awaiting review.");
    await tx.update(invoiceRequests).set({ status: next }).where(eq(invoiceRequests.id, id));
    await recordEvent(tx, ctx, "invoice_request", id, decision === "approve" ? "Forwarded to Finance Officer" : decision === "return" ? "Returned" : "Rejected", role, comment);
    await notify(tx, ctx, { userIds: [ir.requesterId], title: `${ir.number}: ${IR_STATUS_LABEL[next]}`, body: comment, link: `/j/${ctx.jv.code}/invoice-requests/${id}` });
    if (next === "finance_review") await notify(tx, ctx, { roles: ["finance_officer"], title: `${ir.number}: invoice request awaits you`, link: `/j/${ctx.jv.code}/invoice-requests/${id}` });
  });
}

// ---------------------------------------------------------------- invoices

export type InvoiceLineInput = { description: string; quantity: string; unitPrice: string; vatRateBp: number };
export type InvoiceInput = {
  clientId: string; projectId?: string | null; currency: string; issueDate: string; dueDate?: string | null;
  notes?: string | null; lines: InvoiceLineInput[]; invoiceRequestId?: string | null;
};

function buildLines(lines: InvoiceLineInput[]) {
  const used = lines.filter((l) => l.description.trim() || l.unitPrice.trim());
  assert(used.length > 0, "Add at least one line item.");
  return used.map((l, i) => {
    assert(l.description.trim(), `Line ${i + 1}: description is required.`);
    const unit = parsePositiveAmount(l.unitPrice, `Line ${i + 1} unit price`);
    const qty = (l.quantity || "1").trim();
    const net = lineTotal(qty, unit);
    assert(Number.isInteger(l.vatRateBp) && l.vatRateBp >= 0 && l.vatRateBp <= 10000, `Line ${i + 1}: invalid VAT rate.`);
    return { position: i + 1, description: l.description.trim(), quantity: qty, unitPrice: unit, vatRateBp: l.vatRateBp, lineNet: net, lineVat: vatOn(net, l.vatRateBp) };
  });
}

export async function createInvoice(db: DB, ctx: Ctx, input: InvoiceInput) {
  requirePerm(ctx, "issue_invoice");
  return db.transaction(async (tx) => {
    await getClient(tx, ctx, input.clientId);
    assert(ctx.jv.currencies.includes(input.currency), "Choose one of this JV's currencies.");
    const issueDate = parseIsoDate(input.issueDate, "Issue date");
    const dueDate = input.dueDate ? parseIsoDate(input.dueDate, "Due date") : null;
    if (dueDate) assert(dueDate >= issueDate, "Due date cannot be before the issue date.");
    const lines = buildLines(input.lines);
    const subtotal = lines.reduce((s, l) => s + l.lineNet, 0);
    const vatTotal = lines.reduce((s, l) => s + l.lineVat, 0);
    let ir: typeof invoiceRequests.$inferSelect | null = null;
    if (input.invoiceRequestId) {
      ir = await getInvoiceRequest(tx, ctx, input.invoiceRequestId);
      assert(ir.status === "finance_review", "This invoice request is not awaiting the Finance Officer.");
      assert(ir.requesterId !== ctx.userId, "You cannot invoice your own request.");
    }
    const number = await nextNumber(tx, ctx.jv, "INV", issueDate);
    const [inv] = await tx.insert(invoices).values({
      jvId: ctx.jv.id, kind: "native", number, clientId: input.clientId, projectId: input.projectId || null,
      issueDate, dueDate, currency: input.currency, subtotal, vatTotal, total: subtotal + vatTotal,
      notes: input.notes?.trim() || null, status: "draft", createdById: ctx.userId, invoiceRequestId: ir?.id ?? null,
    }).returning();
    await tx.insert(invoiceLines).values(lines.map((l) => ({ ...l, invoiceId: inv.id })));
    if (ir) {
      await tx.update(invoiceRequests).set({ status: "invoiced", invoiceId: inv.id }).where(eq(invoiceRequests.id, ir.id));
      await recordEvent(tx, ctx, "invoice_request", ir.id, `Invoice ${number} created`, "finance_officer");
      await notify(tx, ctx, { userIds: [ir.requesterId], title: `${ir.number}: invoice ${number} created`, link: `/j/${ctx.jv.code}/invoices/${inv.id}` });
    }
    await recordEvent(tx, ctx, "invoice", inv.id, "Created as draft", "finance_officer");
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "invoice.create", entityType: "invoice", entityId: inv.id, after: inv });
    return inv;
  });
}

export async function updateDraftInvoice(db: DB, ctx: Ctx, id: string, input: InvoiceInput) {
  requirePerm(ctx, "issue_invoice");
  return db.transaction(async (tx) => {
    const inv = await getInvoice(tx, ctx, id);
    assert(inv.status === "draft" && inv.kind === "native", "Only draft invoices can be edited. Use a change request for issued invoices.");
    await getClient(tx, ctx, input.clientId);
    const issueDate = parseIsoDate(input.issueDate, "Issue date");
    const dueDate = input.dueDate ? parseIsoDate(input.dueDate, "Due date") : null;
    const lines = buildLines(input.lines);
    const subtotal = lines.reduce((s, l) => s + l.lineNet, 0);
    const vatTotal = lines.reduce((s, l) => s + l.lineVat, 0);
    await tx.update(invoices).set({
      clientId: input.clientId, projectId: input.projectId || null, currency: input.currency, issueDate, dueDate,
      notes: input.notes?.trim() || null, subtotal, vatTotal, total: subtotal + vatTotal,
    }).where(eq(invoices.id, id));
    await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    await tx.insert(invoiceLines).values(lines.map((l) => ({ ...l, invoiceId: id })));
  });
}

export async function issueInvoice(db: DB, ctx: Ctx, id: string, fiscalInvoiceNo: string) {
  requirePerm(ctx, "issue_invoice");
  return db.transaction(async (tx) => {
    const inv = await getInvoice(tx, ctx, id);
    assert(inv.status === "draft", "This invoice has already been issued.");
    assert(fiscalInvoiceNo?.trim(), "Enter the fiscal invoice number from the fiscal device before issuing.");
    await tx.update(invoices).set({ status: "issued", fiscalInvoiceNo: fiscalInvoiceNo.trim(), issuedById: ctx.userId, issuedAt: new Date() }).where(eq(invoices.id, id));
    await recordEvent(tx, ctx, "invoice", id, `Issued (fiscal no. ${fiscalInvoiceNo.trim()})`, "finance_officer");
    await notify(tx, ctx, { roles: ["cto", "finance_clerk"], title: `Invoice ${inv.number} issued`, body: `${inv.currency} ${formatMinor(inv.total)}`, link: `/j/${ctx.jv.code}/invoices/${id}` });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "invoice.issue", entityType: "invoice", entityId: id, after: { fiscalInvoiceNo } });
  });
}

export async function voidDraftInvoice(db: DB, ctx: Ctx, id: string) {
  requirePerm(ctx, "issue_invoice");
  return db.transaction(async (tx) => {
    const inv = await getInvoice(tx, ctx, id);
    assert(inv.status === "draft", "Only draft invoices can be voided. Issued invoices are corrected with a credit note.");
    await tx.update(invoices).set({ status: "void" }).where(eq(invoices.id, id));
    await recordEvent(tx, ctx, "invoice", id, "Voided (draft)", "finance_officer");
  });
}

export type ExternalInvoiceInput = {
  sourceSystem: string; externalNumber: string; clientId: string; projectId?: string | null; issueDate: string;
  dueDate?: string | null; currency: string; amount: string; notes?: string | null;
};

export const SOURCE_SYSTEMS = ["BusRep / TrackStar", "InstaTickets", "Other"];

export async function createExternalInvoice(db: DB, ctx: Ctx, input: ExternalInvoiceInput) {
  requirePerm(ctx, "issue_invoice");
  return db.transaction(async (tx) => {
    await getClient(tx, ctx, input.clientId);
    assert(SOURCE_SYSTEMS.includes(input.sourceSystem), "Choose the source system.");
    assert(input.externalNumber?.trim(), "Enter the invoice number from the source system.");
    assert(ctx.jv.currencies.includes(input.currency), "Choose one of this JV's currencies.");
    const issueDate = parseIsoDate(input.issueDate, "Invoice date");
    const amount = parsePositiveAmount(input.amount);
    const [dupe] = await tx.select({ number: invoices.number }).from(invoices).where(and(
      eq(invoices.jvId, ctx.jv.id), eq(invoices.kind, "external"), eq(invoices.sourceSystem, input.sourceSystem), eq(invoices.externalNumber, input.externalNumber.trim()),
    ));
    if (dupe) throw new DomainError(`${input.sourceSystem} invoice ${input.externalNumber.trim()} is already recorded as ${dupe.number}.`);
    const number = await nextNumber(tx, ctx.jv, "EXT", issueDate);
    const [inv] = await tx.insert(invoices).values({
      jvId: ctx.jv.id, kind: "external", number, sourceSystem: input.sourceSystem, externalNumber: input.externalNumber.trim(),
      clientId: input.clientId, projectId: input.projectId || null, issueDate, dueDate: input.dueDate || null,
      currency: input.currency, subtotal: amount, vatTotal: 0, total: amount, notes: input.notes?.trim() || null,
      status: "issued", createdById: ctx.userId, issuedById: ctx.userId, issuedAt: new Date(),
    }).returning();
    await recordEvent(tx, ctx, "invoice", inv.id, `Recorded from ${input.sourceSystem} (${input.externalNumber.trim()})`, "finance_officer");
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "invoice.external", entityType: "invoice", entityId: inv.id, after: inv });
    return inv;
  });
}

export async function getInvoice(db: Executor, ctx: Ctx, id: string) {
  if (!uuidRe.test(id)) throw new DomainError("Invoice not found.");
  requirePerm(ctx, "view_finance");
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.jvId, ctx.jv.id)));
  if (!inv) throw new DomainError("Invoice not found.");
  return inv;
}

/** Allocated receipts and credit notes per invoice. */
export async function invoiceSettlement(db: Executor, invoiceIds: string[]) {
  const out = new Map<string, { paid: number; credited: number }>();
  if (invoiceIds.length === 0) return out;
  const paid = await db.select({ id: receiptAllocations.invoiceId, v: sql<string>`sum(${receiptAllocations.amount})` })
    .from(receiptAllocations).where(inArray(receiptAllocations.invoiceId, invoiceIds)).groupBy(receiptAllocations.invoiceId);
  const credited = await db.select({ id: creditNotes.invoiceId, v: sql<string>`sum(${creditNotes.amount})` })
    .from(creditNotes).where(inArray(creditNotes.invoiceId, invoiceIds)).groupBy(creditNotes.invoiceId);
  for (const id of invoiceIds) out.set(id, { paid: 0, credited: 0 });
  paid.forEach((p) => (out.get(p.id)!.paid = Number(p.v)));
  credited.forEach((c) => (out.get(c.id)!.credited = Number(c.v)));
  return out;
}

export async function refreshInvoiceStatus(db: Executor, invoiceId: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.status === "draft" || inv.status === "void") return;
  const s = (await invoiceSettlement(db, [invoiceId])).get(invoiceId)!;
  const outstanding = inv.total - s.paid - s.credited;
  let status = "issued";
  if (outstanding <= 0) status = s.paid === 0 ? "credit_noted" : "paid";
  else if (s.paid + s.credited > 0) status = "part_paid";
  await db.update(invoices).set({ status }).where(eq(invoices.id, invoiceId));
}

export async function createCreditNote(db: DB, ctx: Ctx, invoiceId: string, input: { amount: string; reason: string; date: string }) {
  requirePerm(ctx, "issue_invoice");
  return db.transaction(async (tx) => {
    const inv = await getInvoice(tx, ctx, invoiceId);
    assert(["issued", "part_paid"].includes(inv.status), "Credit notes can only be raised on issued, unpaid invoices.");
    const amount = parsePositiveAmount(input.amount);
    assert(input.reason?.trim(), "Give the reason for the credit note.");
    const date = parseIsoDate(input.date, "Credit note date");
    const s = (await invoiceSettlement(tx, [invoiceId])).get(invoiceId)!;
    const outstanding = inv.total - s.paid - s.credited;
    assert(amount <= outstanding, `The credit note cannot exceed the outstanding amount (${inv.currency} ${formatMinor(outstanding)}).`);
    const number = await nextNumber(tx, ctx.jv, "CN", date);
    const [cn] = await tx.insert(creditNotes).values({ jvId: ctx.jv.id, number, invoiceId, noteDate: date, amount, reason: input.reason.trim(), createdById: ctx.userId }).returning();
    await refreshInvoiceStatus(tx, invoiceId);
    await recordEvent(tx, ctx, "invoice", invoiceId, `Credit note ${number}: ${inv.currency} ${formatMinor(amount)}`, "finance_officer", input.reason);
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "credit_note.create", entityType: "credit_note", entityId: cn.id, after: cn });
    return cn;
  });
}

// ---------------------------------------------------------------- receipts

export type ReceiptInput = {
  clientId: string; receivedDate: string; currency: string; amount: string; method: string; bankRef?: string | null;
  allocations: { invoiceId: string; amount: string }[];
};

export const RECEIPT_METHODS: Record<string, string> = { bank_transfer: "Bank transfer", cash: "Cash", mobile_money: "Mobile money", other: "Other" };

async function allocate(tx: Executor, ctx: Ctx, receipt: typeof receipts.$inferSelect, allocs: { invoiceId: string; amount: string }[]) {
  const existing = await tx.select({ v: sql<string>`coalesce(sum(${receiptAllocations.amount}), 0)` }).from(receiptAllocations).where(eq(receiptAllocations.receiptId, receipt.id));
  let used = Number(existing[0].v);
  for (const a of allocs) {
    if (!a.amount?.trim()) continue;
    const amt = parsePositiveAmount(a.amount, "Allocation");
    const inv = await getInvoice(tx, ctx, a.invoiceId);
    assert(inv.clientId === receipt.clientId, `${inv.number} belongs to a different client.`);
    assert(inv.currency === receipt.currency, `${inv.number} is in ${inv.currency}; the receipt is in ${receipt.currency}.`);
    assert(["issued", "part_paid"].includes(inv.status), `${inv.number} is not open for payment.`);
    const s = (await invoiceSettlement(tx, [inv.id])).get(inv.id)!;
    const outstanding = inv.total - s.paid - s.credited;
    assert(amt <= outstanding, `${inv.number}: allocation exceeds the outstanding ${formatMinor(outstanding)}.`);
    used += amt;
    assert(used <= receipt.amount, "Allocations cannot exceed the receipt amount.");
    await tx.insert(receiptAllocations).values({ receiptId: receipt.id, invoiceId: inv.id, amount: amt })
      .onConflictDoUpdate({ target: [receiptAllocations.receiptId, receiptAllocations.invoiceId], set: { amount: sql`${receiptAllocations.amount} + ${amt}` } });
    await refreshInvoiceStatus(tx, inv.id);
    await recordEvent(tx, ctx, "invoice", inv.id, `Payment ${receipt.number} allocated: ${receipt.currency} ${formatMinor(amt)}`, "finance_clerk");
  }
}

export async function recordReceipt(db: DB, ctx: Ctx, input: ReceiptInput) {
  requirePerm(ctx, "record_receipt");
  return db.transaction(async (tx) => {
    await getClient(tx, ctx, input.clientId);
    assert(ctx.jv.currencies.includes(input.currency), "Choose one of this JV's currencies.");
    assert(Object.keys(RECEIPT_METHODS).includes(input.method), "Choose how the money was received.");
    const date = parseIsoDate(input.receivedDate, "Date received");
    assert(date <= todayIso(), "Date received cannot be in the future.");
    const amount = parsePositiveAmount(input.amount);
    const number = await nextNumber(tx, ctx.jv, "RCT", date);
    const [rc] = await tx.insert(receipts).values({
      jvId: ctx.jv.id, number, clientId: input.clientId, receivedDate: date, currency: input.currency, amount,
      method: input.method, bankRef: input.bankRef?.trim() || null, recordedById: ctx.userId,
    }).returning();
    const client = await getClient(tx, ctx, input.clientId);
    await post(tx, {
      jvId: ctx.jv.id, entryDate: date, currency: input.currency, type: "receipt", incomeDelta: amount,
      description: `Receipt from ${client.name}`, reference: number, sourceType: "receipt", sourceId: rc.id, createdById: ctx.userId,
    });
    await allocate(tx, ctx, rc, input.allocations);
    await recordEvent(tx, ctx, "receipt", rc.id, "Recorded", "finance_clerk");
    await notify(tx, ctx, { roles: ["cto", "finance_officer"], title: `Receipt ${number}: ${input.currency} ${formatMinor(amount)} from ${client.name}`, link: `/j/${ctx.jv.code}/receipts/${rc.id}` });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "receipt.create", entityType: "receipt", entityId: rc.id, after: rc });
    return rc;
  });
}

export async function allocateReceipt(db: DB, ctx: Ctx, receiptId: string, allocs: { invoiceId: string; amount: string }[]) {
  requirePerm(ctx, "record_receipt");
  return db.transaction(async (tx) => {
    const rc = await getReceipt(tx, ctx, receiptId);
    await allocate(tx, ctx, rc, allocs);
  });
}

export async function getReceipt(db: Executor, ctx: Ctx, id: string) {
  if (!uuidRe.test(id)) throw new DomainError("Receipt not found.");
  requirePerm(ctx, "view_finance");
  const [rc] = await db.select().from(receipts).where(and(eq(receipts.id, id), eq(receipts.jvId, ctx.jv.id)));
  if (!rc) throw new DomainError("Receipt not found.");
  return rc;
}

export async function receiptAllocated(db: Executor, receiptId: string) {
  const [r] = await db.select({ v: sql<string>`coalesce(sum(${receiptAllocations.amount}), 0)` }).from(receiptAllocations).where(eq(receiptAllocations.receiptId, receiptId));
  return Number(r.v);
}

/** Open invoices for a client and currency, with outstanding amounts. */
export async function openInvoices(db: Executor, ctx: Ctx, clientId?: string) {
  const conds = [eq(invoices.jvId, ctx.jv.id), inArray(invoices.status, ["issued", "part_paid"])];
  if (clientId) conds.push(eq(invoices.clientId, clientId));
  const rows = await db.select({ inv: invoices, client: clients.name }).from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId)).where(and(...conds)).orderBy(asc(invoices.issueDate));
  const s = await invoiceSettlement(db, rows.map((r) => r.inv.id));
  return rows.map((r) => {
    const x = s.get(r.inv.id)!;
    return { ...r, paid: x.paid, credited: x.credited, outstanding: r.inv.total - x.paid - x.credited };
  });
}

// ---------------------------------------------------------------- conversions

export async function recordConversion(db: DB, ctx: Ctx, input: { date: string; fromCurrency: string; fromAmount: string; toCurrency: string; toAmount: string; note?: string }) {
  requirePerm(ctx, "record_conversion");
  return db.transaction(async (tx) => {
    assert(ctx.jv.currencies.includes(input.fromCurrency) && ctx.jv.currencies.includes(input.toCurrency), "Choose currencies enabled for this JV.");
    assert(input.fromCurrency !== input.toCurrency, "Choose two different currencies.");
    const date = parseIsoDate(input.date, "Conversion date");
    const fromAmount = parsePositiveAmount(input.fromAmount, "Amount converted");
    const toAmount = parsePositiveAmount(input.toAmount, "Amount received");
    const held = await incomeHeld(tx, ctx.jv.id, input.fromCurrency);
    assert(held >= fromAmount, `Only ${input.fromCurrency} ${formatMinor(held)} of JV income is held; you cannot convert more than that.`);
    const rate = (toAmount / fromAmount).toFixed(6);
    const number = await nextNumber(tx, ctx.jv, "FX", date);
    const [c] = await tx.insert(conversions).values({
      jvId: ctx.jv.id, number, conversionDate: date, fromCurrency: input.fromCurrency, fromAmount, toCurrency: input.toCurrency, toAmount, rate,
      note: input.note?.trim() || null, createdById: ctx.userId,
    }).returning();
    const desc = `Converted ${input.fromCurrency} ${formatMinor(fromAmount)} to ${input.toCurrency} ${formatMinor(toAmount)} at ${rate}`;
    await post(tx, { jvId: ctx.jv.id, entryDate: date, currency: input.fromCurrency, type: "conversion_out", incomeDelta: -fromAmount, description: desc, reference: number, sourceType: "conversion", sourceId: c.id, createdById: ctx.userId });
    await post(tx, { jvId: ctx.jv.id, entryDate: date, currency: input.toCurrency, type: "conversion_in", incomeDelta: toAmount, description: desc, reference: number, sourceType: "conversion", sourceId: c.id, createdById: ctx.userId });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "conversion.create", entityType: "conversion", entityId: c.id, after: c });
    return c;
  });
}

export async function listInvoices(db: Executor, ctx: Ctx) {
  requirePerm(ctx, "view_finance");
  const rows = await db.select({ inv: invoices, client: clients.name }).from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(eq(invoices.jvId, ctx.jv.id)).orderBy(desc(invoices.issueDate), desc(invoices.createdAt)).limit(500);
  const s = await invoiceSettlement(db, rows.map((r) => r.inv.id));
  return rows.map((r) => ({ ...r, outstanding: r.inv.status === "draft" || r.inv.status === "void" ? 0 : r.inv.total - s.get(r.inv.id)!.paid - s.get(r.inv.id)!.credited }));
}

export async function listReceipts(db: Executor, ctx: Ctx) {
  requirePerm(ctx, "view_finance");
  return db.select({ rc: receipts, client: clients.name, recordedBy: users.name }).from(receipts)
    .innerJoin(clients, eq(clients.id, receipts.clientId)).innerJoin(users, eq(users.id, receipts.recordedById))
    .where(eq(receipts.jvId, ctx.jv.id)).orderBy(desc(receipts.receivedDate)).limit(500);
}
