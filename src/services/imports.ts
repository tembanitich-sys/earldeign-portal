import Papa from "papaparse";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB, Executor } from "@/db";
import { categories, importBatches, projects, requisitionLines, requisitions, users, type ImportRow, type Role } from "@/db/schema";
import { AUTHORISING_ROLES, requirePerm, type Ctx } from "@/lib/access";
import { audit } from "@/lib/audit";
import { assert, DomainError } from "@/lib/errors";
import { recordEvent } from "@/lib/events";
import { parsePositiveAmount } from "@/lib/money";
import { notify } from "@/lib/notify";
import { postRequisitionEntries } from "./requisitions";

const REQUIRED = ["entry_ref", "date", "currency", "payee", "description", "amount"];

export type ParsedImport = { rows: ImportRow[]; errors: string[]; totals: Record<string, number> };

function mapPayFrom(ctx: Ctx, v: string): string | null {
  const s = v.trim().toLowerCase();
  if (!s || s === "funding_partner" || s === ctx.jv.fundingPartner.toLowerCase() || ctx.jv.fundingPartner.toLowerCase().startsWith(s)) return "funding_partner";
  if (s === "jv_income" || s === "jv income" || s === "income") return "jv_income";
  return null;
}

/** Parse and validate a historical CSV without saving anything. */
export async function parseImport(db: Executor, ctx: Ctx, csvText: string): Promise<ParsedImport> {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  const errors: string[] = [];
  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) return { rows: [], errors: [`Missing columns: ${missing.join(", ")}. Use the template columns.`], totals: {} };
  const cats = await db.select().from(categories).where(eq(categories.jvId, ctx.jv.id));
  const projs = await db.select().from(projects).where(eq(projects.jvId, ctx.jv.id));
  const rows: ImportRow[] = [];
  const totals: Record<string, number> = {};
  const refs = new Set<string>();
  parsed.data.forEach((d, i) => {
    const line = i + 2;
    const err = (m: string) => errors.push(`Row ${line}: ${m}`);
    const ref = (d.entry_ref ?? "").trim();
    if (!ref) err("entry_ref is empty.");
    else if (refs.has(ref)) err(`entry_ref ${ref} appears twice.`);
    refs.add(ref);
    const date = (d.date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) err(`date "${date}" must be YYYY-MM-DD.`);
    const currency = (d.currency ?? "").trim().toUpperCase();
    if (!ctx.jv.currencies.includes(currency)) err(`currency "${currency}" is not enabled for this JV.`);
    let amount = 0;
    try { amount = parsePositiveAmount(d.amount, "amount"); } catch (e) { err((e as Error).message); }
    const category = (d.category ?? "").trim();
    if (category && !cats.some((c) => c.name.toLowerCase() === category.toLowerCase())) err(`category "${category}" does not exist. Add it under JV settings first.`);
    const project = (d.project ?? "").trim();
    if (project && !projs.some((p) => p.name.toLowerCase() === project.toLowerCase())) err(`project "${project}" does not exist. Add it under JV settings first.`);
    const payFrom = mapPayFrom(ctx, d.pay_from ?? "");
    if (!payFrom) err(`pay_from "${d.pay_from}" must be "${ctx.jv.fundingPartner}" or "JV income".`);
    if (!(d.payee ?? "").trim()) err("payee is empty.");
    if (!(d.description ?? "").trim()) err("description is empty.");
    rows.push({
      entryRef: ref, date, currency, payee: (d.payee ?? "").trim(), endSupplier: (d.end_supplier ?? "").trim(),
      description: (d.description ?? "").trim(), category, project, amount, payFrom: payFrom ?? "funding_partner",
      requisitionRef: (d.requisition_ref ?? "").trim(), receiptRef: (d.receipt_ref ?? "").trim(),
      supportingDocs: (d.supporting_docs ?? "").trim(), reviewFlags: (d.review_flags ?? "").trim(),
    });
    totals[currency] = (totals[currency] ?? 0) + amount;
  });
  if (rows.length) {
    const numbers = rows.map((r) => `${ctx.jv.shortCode}-${r.entryRef}`);
    const existing = await db.select({ n: requisitions.number }).from(requisitions).where(and(eq(requisitions.jvId, ctx.jv.id), inArray(requisitions.number, numbers)));
    existing.forEach((e) => errors.push(`${e.n} has already been imported.`));
  }
  return { rows, errors, totals };
}

function uploaderRole(ctx: Ctx): Role {
  const r = AUTHORISING_ROLES.find((x) => ctx.roles.includes(x));
  if (!r) throw new DomainError("Only the CTO or the Finance Officer can import historical entries.");
  return r;
}

export async function createImportBatch(db: DB, ctx: Ctx, filename: string, csvText: string) {
  requirePerm(ctx, "import_history");
  const role = uploaderRole(ctx);
  return db.transaction(async (tx) => {
    const [pending] = await tx.select({ id: importBatches.id }).from(importBatches).where(and(eq(importBatches.jvId, ctx.jv.id), eq(importBatches.status, "pending")));
    assert(!pending, "Another import is waiting for authorisation. Decide it first.");
    const p = await parseImport(tx, ctx, csvText);
    assert(p.rows.length > 0, "The file has no rows.");
    if (p.errors.length) throw new DomainError(`Fix these problems and upload again:\n${p.errors.slice(0, 15).join("\n")}${p.errors.length > 15 ? `\n…and ${p.errors.length - 15} more` : ""}`);
    const [b] = await tx.insert(importBatches).values({ jvId: ctx.jv.id, filename, rows: p.rows, totals: p.totals, uploadedById: ctx.userId, uploadedRole: role }).returning();
    const counter: Role = role === "cto" ? "finance_officer" : "cto";
    await notify(tx, ctx, { roles: [counter], title: `Historical import (${p.rows.length} rows) needs your authorisation`, link: `/j/${ctx.jv.code}/import` });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: "import.upload", entityType: "import_batch", entityId: b.id, after: { filename, rows: p.rows.length, totals: p.totals } });
    return b;
  });
}

export async function decideImport(db: DB, ctx: Ctx, batchId: string, decision: "authorise" | "decline", comment?: string) {
  requirePerm(ctx, "import_history");
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.jvId, ctx.jv.id)));
    assert(b, "Import not found.");
    assert(b.status === "pending", "This import has already been decided.");
    assert(b.uploadedById !== ctx.userId, "You uploaded this import; the counter-party must authorise it.");
    const counter: Role = b.uploadedRole === "cto" ? "finance_officer" : "cto";
    assert(ctx.roles.includes(counter), `This import must be decided by the ${counter === "cto" ? "CTO" : "Finance Officer"}.`);
    if (decision === "decline") {
      assert(comment?.trim(), "Explain why you are declining the import.");
      await tx.update(importBatches).set({ status: "declined", decidedById: ctx.userId, decidedAt: new Date(), decisionComment: comment!.trim() }).where(eq(importBatches.id, batchId));
    } else {
      const cats = await tx.select().from(categories).where(eq(categories.jvId, ctx.jv.id));
      const projs = await tx.select().from(projects).where(eq(projects.jvId, ctx.jv.id));
      const ordered = [...b.rows].sort((a, c) => a.date.localeCompare(c.date) || a.entryRef.localeCompare(c.entryRef));
      for (const row of ordered) {
        const [r] = await tx.insert(requisitions).values({
          jvId: ctx.jv.id, number: `${ctx.jv.shortCode}-${row.entryRef}`, status: "closed", requesterId: b.uploadedById, requesterRole: b.uploadedRole,
          projectId: projs.find((p) => p.name.toLowerCase() === row.project.toLowerCase())?.id ?? null,
          categoryId: cats.find((c) => c.name.toLowerCase() === row.category.toLowerCase())?.id ?? null,
          currency: row.currency, payee: row.payee, endSupplier: row.endSupplier || null, paymentMethod: "not_recorded",
          payFrom: row.payFrom, total: row.amount, isHistorical: true, historicalDate: row.date, historicalDescription: row.description,
          reviewFlags: row.reviewFlags || null, supportingDocs: row.supportingDocs || null, importBatchId: b.id,
          justification: [row.requisitionRef && `Original requisition ${row.requisitionRef}`, row.receiptRef && `Receipt ${row.receiptRef}`].filter(Boolean).join("; ") || null,
        }).returning();
        await tx.insert(requisitionLines).values({ requisitionId: r.id, position: 1, description: row.description, quantity: "1", unitCost: row.amount, lineTotal: row.amount });
        await postRequisitionEntries(tx, r, ctx.userId);
        await recordEvent(tx, ctx, "requisition", r.id, `Imported from ${b.filename}, authorised`, counter);
      }
      await tx.update(importBatches).set({ status: "authorised", decidedById: ctx.userId, decidedAt: new Date(), decisionComment: comment?.trim() || null }).where(eq(importBatches.id, batchId));
    }
    await notify(tx, ctx, { userIds: [b.uploadedById], title: `Historical import ${decision === "authorise" ? "authorised" : "declined"}`, body: comment, link: `/j/${ctx.jv.code}/import` });
    await audit(tx, { actorId: ctx.userId, jvId: ctx.jv.id, action: `import.${decision}`, entityType: "import_batch", entityId: batchId, after: { comment } });
  });
}

export async function listImports(db: Executor, ctx: Ctx) {
  requirePerm(ctx, "view_finance");
  return db.select({ b: importBatches, uploader: users.name }).from(importBatches).innerJoin(users, eq(users.id, importBatches.uploadedById))
    .where(eq(importBatches.jvId, ctx.jv.id)).orderBy(desc(importBatches.uploadedAt));
}

export async function openingBalanceReport(db: Executor, ctx: Ctx) {
  requirePerm(ctx, "view_finance");
  const rows = await db.select({ r: requisitions, category: categories.name, project: projects.name }).from(requisitions)
    .leftJoin(categories, eq(categories.id, requisitions.categoryId)).leftJoin(projects, eq(projects.id, requisitions.projectId))
    .where(and(eq(requisitions.jvId, ctx.jv.id), eq(requisitions.isHistorical, true))).orderBy(asc(requisitions.historicalDate), asc(requisitions.number));
  const byCurrency: Record<string, number> = {};
  const byCategory: Record<string, Record<string, number>> = {};
  for (const x of rows) {
    byCurrency[x.r.currency] = (byCurrency[x.r.currency] ?? 0) + x.r.total;
    const c = x.category ?? "Uncategorised";
    byCategory[x.r.currency] ??= {};
    byCategory[x.r.currency][c] = (byCategory[x.r.currency][c] ?? 0) + x.r.total;
  }
  const flagged = rows.filter((x) => x.r.reviewFlags || (x.r.supportingDocs ?? "").toLowerCase() === "missing");
  return { rows, byCurrency, byCategory, flagged };
}

export const IMPORT_TEMPLATE_HEADER = "entry_ref,date,jv,currency,payee,end_supplier,description,category,project,amount,pay_from,entry_type,requisition_ref,receipt_ref,supporting_docs,review_flags";
export { sql };
