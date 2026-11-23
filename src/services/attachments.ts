import { and, asc, eq } from "drizzle-orm";
import type { DB, Executor } from "@/db";
import { attachments, users } from "@/db/schema";
import { can, type Ctx } from "@/lib/access";
import { audit } from "@/lib/audit";
import { assert, DomainError } from "@/lib/errors";
import { ALLOWED_MIME, MAX_BYTES, newKey, storage } from "@/lib/storage";
import { getRequisition } from "./requisitions";
import { getInvoice, getReceipt } from "./income";
import { getSupplierInvoice } from "./suppliers";

export const ATTACHMENT_KINDS: Record<string, string> = {
  quotation: "Quotation", supplier_invoice: "Supplier invoice", pop: "Proof of payment", acquittal: "Acquittal receipt",
  signed_copy: "Signed copy", invoice_pdf: "Invoice PDF", other: "Other",
};

/** Owners: requisition, invoice, receipt, supplier_invoice. Checks the owner belongs to this JV and the user can see it. */
async function checkOwner(db: Executor, ctx: Ctx, ownerType: string, ownerId: string) {
  if (ownerType === "requisition") return getRequisition(db, ctx, ownerId);
  if (ownerType === "invoice") return getInvoice(db, ctx, ownerId);
  if (ownerType === "receipt") return getReceipt(db, ctx, ownerId);
  if (ownerType === "supplier_invoice") return getSupplierInvoice(db, ctx, ownerId);
  throw new DomainError("Unknown document type.");
}

export async function addAttachment(db: DB, ctx: Ctx, ownerType: string, ownerId: string, kind: string, file: File) {
  assert(file && file.size > 0, "Choose a file to upload.");
  assert(file.size <= MAX_BYTES, "Files can be at most 10 MB.");
  const ext = ALLOWED_MIME[file.type];
  assert(ext, "Upload a PDF, JPG, PNG, XLSX or CSV file.");
  assert(ATTACHMENT_KINDS[kind], "Choose what the file is.");
  const owner = await checkOwner(db, ctx, ownerType, ownerId);
  if (ownerType === "requisition") {
    const r = owner as Awaited<ReturnType<typeof getRequisition>>;
    assert(can(ctx, "view_finance") || r.requesterId === ctx.userId, "You cannot attach files to this requisition.");
  } else {
    assert(can(ctx, "view_finance") && !ctx.roles.every((x) => x === "director" || x === "partner_viewer"), "Read-only users cannot upload files.");
  }
  const key = await storage().put(newKey(ctx.jv.id, ext), Buffer.from(await file.arrayBuffer()), file.type);
  const [a] = await db.insert(attachments).values({
    jvId: ctx.jv.id, ownerType, ownerId, kind, filename: file.name.slice(0, 200), mime: file.type, size: file.size, storageKey: key, uploadedById: ctx.userId,
  }).returning();
  await audit(db, { actorId: ctx.userId, jvId: ctx.jv.id, action: "attachment.add", entityType: ownerType, entityId: ownerId, after: { kind, filename: a.filename, size: a.size } });
  return a;
}

export async function listAttachments(db: Executor, ctx: Ctx, ownerType: string, ownerId: string) {
  return db.select({ a: attachments, by: users.name }).from(attachments).innerJoin(users, eq(users.id, attachments.uploadedById))
    .where(and(eq(attachments.jvId, ctx.jv.id), eq(attachments.ownerType, ownerType), eq(attachments.ownerId, ownerId))).orderBy(asc(attachments.uploadedAt));
}

export async function readAttachment(db: Executor, ctx: Ctx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError("File not found.");
  const [a] = await db.select().from(attachments).where(and(eq(attachments.id, id), eq(attachments.jvId, ctx.jv.id)));
  if (!a) throw new DomainError("File not found.");
  await checkOwner(db, ctx, a.ownerType, a.ownerId);
  const data = await storage().get(a.storageKey);
  if (!data) throw new DomainError("File not found in storage.");
  return { a, data };
}
