import { db } from "@/db";
import { can, loadCtx } from "@/lib/access";
import { getSession } from "@/lib/session";
import { todayIso } from "@/lib/dates";
import { ENTRY_LABEL, statement } from "@/lib/ledger";
import { minorToInput } from "@/lib/money";
import { listRequisitions, REQ_STATUS_LABEL } from "@/services/requisitions";
import { INVOICE_STATUS_LABEL, listInvoices, listReceipts } from "@/services/income";
import { audit } from "@/lib/audit";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // guard against spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(",")).join("\r\n");

export async function GET(req: Request, { params }: { params: Promise<{ jv: string; kind: string }> }) {
  const { jv, kind } = await params;
  const s = await getSession();
  if (!s || (s.user.totpEnabled && !s.session.twoFactorPassed) || s.user.mustChangePassword) return new Response("Sign in first.", { status: 401 });
  const ctx = await loadCtx(db, s.user.id, jv);
  if (!ctx || !can(ctx, "view_finance")) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  let rows: unknown[][];
  let name: string;
  if (kind === "ledger") {
    const currency = ctx.jv.currencies.includes(url.searchParams.get("currency") ?? "") ? url.searchParams.get("currency")! : ctx.jv.currencies[0];
    const st = await statement(db, ctx.jv.id, currency, url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined);
    rows = [["date", "reference", "entry", "description", "currency", "loan_change", "income_held_change", "loan_balance", "income_held_balance", "prior_period_adjustment"],
      ...st.lines.map((e) => [e.entryDate, e.reference, ENTRY_LABEL[e.type], e.description, currency, minorToInput(e.loanDelta), minorToInput(e.incomeDelta), minorToInput(e.loanBalance), minorToInput(e.incomeBalance), e.priorPeriodAdjustment ? "yes" : ""])];
    name = `loan-book-${ctx.jv.code}-${currency}-${todayIso()}.csv`;
  } else if (kind === "requisitions") {
    const list = await listRequisitions(db, ctx);
    rows = [["number", "status", "historical", "date", "requester", "project", "category", "payee", "end_supplier", "currency", "amount", "pay_from", "actual_spent", "change_returned"],
      ...list.map(({ r, requester, project, category }) => [r.number, REQ_STATUS_LABEL[r.status], r.isHistorical ? "yes" : "", r.isHistorical ? r.historicalDate : r.disbursedAt ?? r.createdAt.toISOString().slice(0, 10), requester, project, category, r.payee, r.endSupplier, r.currency, minorToInput(r.total), r.payFrom, minorToInput(r.acquittalActual), minorToInput(r.acquittalChange)])];
    name = `requisitions-${ctx.jv.code}-${todayIso()}.csv`;
  } else if (kind === "invoices") {
    const list = await listInvoices(db, ctx);
    rows = [["number", "kind", "source", "external_number", "fiscal_number", "client", "issue_date", "due_date", "currency", "subtotal", "vat", "total", "outstanding", "status"],
      ...list.map(({ inv, client, outstanding }) => [inv.number, inv.kind, inv.sourceSystem, inv.externalNumber, inv.fiscalInvoiceNo, client, inv.issueDate, inv.dueDate, inv.currency, minorToInput(inv.subtotal), minorToInput(inv.vatTotal), minorToInput(inv.total), minorToInput(outstanding), INVOICE_STATUS_LABEL[inv.status]])];
    name = `invoices-${ctx.jv.code}-${todayIso()}.csv`;
  } else if (kind === "receipts") {
    const list = await listReceipts(db, ctx);
    rows = [["number", "date", "client", "currency", "amount", "method", "bank_ref", "recorded_by"], ...list.map(({ rc, client, recordedBy }) => [rc.number, rc.receivedDate, client, rc.currency, minorToInput(rc.amount), rc.method, rc.bankRef, recordedBy])];
    name = `receipts-${ctx.jv.code}-${todayIso()}.csv`;
  } else return new Response("Not found", { status: 404 });
  await audit(db, { actorId: ctx.userId, jvId: ctx.jv.id, action: `export.${kind}`, entityType: "export", entityId: name });
  return new Response("﻿" + csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
}
