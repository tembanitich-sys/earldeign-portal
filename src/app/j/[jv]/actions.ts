"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireJv } from "@/lib/session";
import { afterWrite, all, fail, s } from "@/lib/actions";
import type { FormState } from "@/components/forms";
import * as R from "@/services/requisitions";
import * as I from "@/services/income";
import * as S from "@/services/suppliers";
import * as C from "@/services/changes";
import * as M from "@/services/imports";
import * as P from "@/services/periods";
import { addAttachment } from "@/services/attachments";

const ctxOf = async (fd: FormData) => requireJv(s(fd, "jv"));
const base = (fd: FormData) => `/j/${s(fd, "jv")}`;

function reqInput(fd: FormData): R.RequisitionInput {
  const d = all(fd, "line_desc"), q = all(fd, "line_qty"), u = all(fd, "line_unit");
  return {
    projectId: s(fd, "projectId") || null, categoryId: s(fd, "categoryId") || null, currency: s(fd, "currency"),
    urgency: s(fd, "urgency"), requiredBy: s(fd, "requiredBy") || null, justification: s(fd, "justification"),
    payee: s(fd, "payee"), endSupplier: s(fd, "endSupplier"), paymentMethod: s(fd, "paymentMethod"),
    payeeBankDetails: s(fd, "payeeBankDetails"), payFrom: s(fd, "payFrom") || "funding_partner",
    supplierInvoiceId: s(fd, "supplierInvoiceId") || null, parentRequisitionId: s(fd, "parentRequisitionId") || null,
    lines: d.map((desc, i) => ({ description: desc, quantity: q[i] ?? "1", unitCost: u[i] ?? "" })),
  };
}

// ---------------------------------------------------------------- requisitions

export async function saveRequisitionAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = s(fd, "id");
  try {
    const ctx = await ctxOf(fd);
    const input = reqInput(fd);
    if (id) await R.updateDraft(db, ctx, id, input);
    else id = (await R.createRequisition(db, ctx, input)).id;
    if (s(fd, "submit") === "1") await R.submitRequisition(db, ctx, id);
    await afterWrite();
  } catch (e) { return fail(e); }
  redirect(`${base(fd)}/requisitions/${id}`);
}

export async function requisitionStepAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = s(fd, "id");
  try {
    const ctx = await ctxOf(fd);
    const step = s(fd, "step");
    const decision = s(fd, "decision") as R.Decision;
    if (step === "submit") await R.submitRequisition(db, ctx, id);
    else if (step === "cancel") await R.cancelRequisition(db, ctx, id);
    else if (step === "cto") await R.ctoReview(db, ctx, id, decision, s(fd, "comment"));
    else if (step === "finance") await R.financeReview(db, ctx, id, decision, { comment: s(fd, "comment"), payFrom: s(fd, "payFrom") });
    else if (step === "disburse") {
      await R.disburse(db, ctx, id, { method: s(fd, "method"), date: s(fd, "date"), reference: s(fd, "reference") });
      const file = fd.get("pop");
      if (file instanceof File && file.size > 0) await addAttachment(db, ctx, "requisition", id, "pop", file);
    } else if (step === "acquit") {
      const files = fd.getAll("receipts").filter((f): f is File => f instanceof File && f.size > 0);
      for (const f of files) await addAttachment(db, ctx, "requisition", id, "acquittal", f);
      await R.submitAcquittal(db, ctx, id, { actual: s(fd, "actual"), note: s(fd, "note") });
    } else if (step === "acquittal_decision") await R.decideAcquittal(db, ctx, id, decision === "approve" ? "approve" : "return", s(fd, "comment"));
    else return { error: "Unknown step." };
    await afterWrite();
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/requisitions/${id}`);
  return { ok: "Done." };
}

export async function uploadAttachmentAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const ctx = await ctxOf(fd);
    const f = fd.get("file");
    if (!(f instanceof File)) return { error: "Choose a file to upload." };
    await addAttachment(db, ctx, s(fd, "ownerType"), s(fd, "ownerId"), s(fd, "kind"), f);
  } catch (e) { return fail(e); }
  revalidatePath(s(fd, "back"));
  return { ok: "File uploaded." };
}

// ---------------------------------------------------------------- suppliers

function supplierLines(fd: FormData): S.SupplierLineInput[] {
  const p = all(fd, "sl_project"), d = all(fd, "sl_desc"), a = all(fd, "sl_amount");
  return p.map((projectId, i) => ({ projectId, description: d[i] ?? "", amount: a[i] ?? "" }));
}

export async function createSupplierInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  try {
    const ctx = await ctxOf(fd);
    const si = await S.createSupplierInvoice(db, ctx, { supplier: s(fd, "supplier"), supplierInvoiceNo: s(fd, "supplierInvoiceNo"), invoiceDate: s(fd, "invoiceDate"), currency: s(fd, "currency"), lines: supplierLines(fd) });
    id = si.id;
    const f = fd.get("file");
    if (f instanceof File && f.size > 0) await addAttachment(db, ctx, "supplier_invoice", id, "supplier_invoice", f);
  } catch (e) { return fail(e); }
  redirect(`${base(fd)}/supplier-invoices/${id}`);
}

export async function disputeAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const ctx = await ctxOf(fd);
    await S.setDispute(db, ctx, s(fd, "id"), s(fd, "disputed") === "1", s(fd, "comment"));
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/supplier-invoices/${s(fd, "id")}`);
  return { ok: "Saved." };
}

// ---------------------------------------------------------------- clients and invoices

export async function saveClientAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = s(fd, "id");
  try {
    const ctx = await ctxOf(fd);
    const c = await I.saveClient(db, ctx, { name: s(fd, "name"), contactPerson: s(fd, "contactPerson"), email: s(fd, "email"), phone: s(fd, "phone"), address: s(fd, "address"), vatNo: s(fd, "vatNo") }, id || undefined);
    id = c.id;
  } catch (e) { return fail(e); }
  const back = s(fd, "back");
  redirect(back || `${base(fd)}/clients/${id}`);
}

export async function saveInvoiceRequestAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  try {
    const ctx = await ctxOf(fd);
    const ir = await I.createInvoiceRequest(db, ctx, { clientId: s(fd, "clientId"), projectId: s(fd, "projectId") || null, currency: s(fd, "currency"), description: s(fd, "description"), amount: s(fd, "amount"), requestedDueDate: s(fd, "requestedDueDate") || null });
    id = ir.id;
    if (s(fd, "submit") === "1") await I.submitInvoiceRequest(db, ctx, id);
    await afterWrite();
  } catch (e) { return fail(e); }
  redirect(`${base(fd)}/invoice-requests/${id}`);
}

export async function invoiceRequestStepAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = s(fd, "id");
  try {
    const ctx = await ctxOf(fd);
    if (s(fd, "step") === "submit") await I.submitInvoiceRequest(db, ctx, id);
    else await I.reviewInvoiceRequest(db, ctx, id, s(fd, "decision") as "approve" | "return" | "reject", s(fd, "comment"));
    await afterWrite();
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/invoice-requests/${id}`);
  return { ok: "Done." };
}

function invoiceInput(fd: FormData): I.InvoiceInput {
  const d = all(fd, "line_desc"), q = all(fd, "line_qty"), u = all(fd, "line_unit"), v = all(fd, "line_vat");
  return {
    clientId: s(fd, "clientId"), projectId: s(fd, "projectId") || null, currency: s(fd, "currency"), issueDate: s(fd, "issueDate"),
    dueDate: s(fd, "dueDate") || null, notes: s(fd, "notes"), invoiceRequestId: s(fd, "invoiceRequestId") || null,
    lines: d.map((desc, i) => ({ description: desc, quantity: q[i] ?? "1", unitPrice: u[i] ?? "", vatRateBp: Number(v[i] ?? 0) })),
  };
}

export async function saveInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = s(fd, "id");
  try {
    const ctx = await ctxOf(fd);
    if (id) await I.updateDraftInvoice(db, ctx, id, invoiceInput(fd));
    else id = (await I.createInvoice(db, ctx, invoiceInput(fd))).id;
    await afterWrite();
  } catch (e) { return fail(e); }
  redirect(`${base(fd)}/invoices/${id}`);
}

export async function invoiceStepAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = s(fd, "id");
  try {
    const ctx = await ctxOf(fd);
    const step = s(fd, "step");
    if (step === "issue") await I.issueInvoice(db, ctx, id, s(fd, "fiscalInvoiceNo"));
    else if (step === "void") await I.voidDraftInvoice(db, ctx, id);
    else if (step === "credit") await I.createCreditNote(db, ctx, id, { amount: s(fd, "amount"), reason: s(fd, "reason"), date: s(fd, "date") });
    await afterWrite();
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/invoices/${id}`);
  return { ok: "Done." };
}

export async function externalInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  try {
    const ctx = await ctxOf(fd);
    const inv = await I.createExternalInvoice(db, ctx, {
      sourceSystem: s(fd, "sourceSystem"), externalNumber: s(fd, "externalNumber"), clientId: s(fd, "clientId"), projectId: s(fd, "projectId") || null,
      issueDate: s(fd, "issueDate"), dueDate: s(fd, "dueDate") || null, currency: s(fd, "currency"), amount: s(fd, "amount"), notes: s(fd, "notes"),
    });
    id = inv.id;
    const f = fd.get("file");
    if (f instanceof File && f.size > 0) await addAttachment(db, ctx, "invoice", id, "invoice_pdf", f);
  } catch (e) { return fail(e); }
  redirect(`${base(fd)}/invoices/${id}`);
}

function allocations(fd: FormData) {
  const ids = all(fd, "alloc_invoice"), amts = all(fd, "alloc_amount");
  return ids.map((invoiceId, i) => ({ invoiceId, amount: amts[i] ?? "" }));
}

export async function recordReceiptAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  try {
    const ctx = await ctxOf(fd);
    const rc = await I.recordReceipt(db, ctx, {
      clientId: s(fd, "clientId"), receivedDate: s(fd, "receivedDate"), currency: s(fd, "currency"), amount: s(fd, "amount"),
      method: s(fd, "method"), bankRef: s(fd, "bankRef"), allocations: allocations(fd),
    });
    id = rc.id;
    const f = fd.get("file");
    if (f instanceof File && f.size > 0) await addAttachment(db, ctx, "receipt", id, "pop", f);
    await afterWrite();
  } catch (e) { return fail(e); }
  redirect(`${base(fd)}/receipts/${id}`);
}

export async function allocateReceiptAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = s(fd, "id");
  try {
    const ctx = await ctxOf(fd);
    await I.allocateReceipt(db, ctx, id, allocations(fd));
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/receipts/${id}`);
  return { ok: "Allocated." };
}

export async function conversionAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const ctx = await ctxOf(fd);
    await I.recordConversion(db, ctx, { date: s(fd, "date"), fromCurrency: s(fd, "fromCurrency"), fromAmount: s(fd, "fromAmount"), toCurrency: s(fd, "toCurrency"), toAmount: s(fd, "toAmount"), note: s(fd, "note") });
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/conversions`);
  return { ok: "Conversion recorded." };
}

// ---------------------------------------------------------------- change requests

export async function proposeChangeAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  try {
    const ctx = await ctxOf(fd);
    const type = s(fd, "targetType") as C.TargetType;
    const fields = all(fd, "fields");
    const raw: Record<string, unknown> = {};
    for (const f of fields) raw[f] = f === "lines" ? supplierLines(fd) : s(fd, `f_${f}`);
    const cr = await C.proposeChange(db, ctx, type, s(fd, "targetId"), raw, s(fd, "reason"));
    id = cr.id;
    await afterWrite();
  } catch (e) { return fail(e); }
  redirect(`${base(fd)}/changes/${id}`);
}

export async function decideChangeAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = s(fd, "id");
  try {
    const ctx = await ctxOf(fd);
    if (s(fd, "decision") === "cancel") await C.cancelChange(db, ctx, id);
    else await C.decideChange(db, ctx, id, s(fd, "decision") === "authorise" ? "authorise" : "decline", s(fd, "comment"));
    await afterWrite();
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/changes/${id}`);
  return { ok: "Decision recorded." };
}

// ---------------------------------------------------------------- import and periods

export async function uploadImportAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const ctx = await ctxOf(fd);
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) return { error: "Choose the CSV file to upload." };
    if (f.size > 2 * 1024 * 1024) return { error: "The CSV is larger than 2 MB. Split it into smaller files." };
    await M.createImportBatch(db, ctx, f.name, await f.text());
    await afterWrite();
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/import`);
  return { ok: "Uploaded. The counter-party has been asked to authorise the import. Nothing affects the loan book until they do." };
}

export async function decideImportAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const ctx = await ctxOf(fd);
    await M.decideImport(db, ctx, s(fd, "id"), s(fd, "decision") === "authorise" ? "authorise" : "decline", s(fd, "comment"));
    await afterWrite();
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/import`);
  return { ok: "Decision recorded." };
}

export async function closePeriodAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const ctx = await ctxOf(fd);
    await P.closePeriod(db, ctx, s(fd, "month"));
  } catch (e) { return fail(e); }
  revalidatePath(`${base(fd)}/periods`);
  return { ok: "Month closed." };
}

export async function markNotificationsReadAction(fd: FormData) {
  const ctx = await ctxOf(fd);
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, ctx.userId), eq(notifications.jvId, ctx.jv.id)));
  revalidatePath(`${base(fd)}/notifications`);
}
