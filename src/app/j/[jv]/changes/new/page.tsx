import Link from "next/link";
import { notFound } from "next/navigation";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";

import { ccyLabels, categoriesOf, clientsOf, projectsOf, supplierInvoicesOf } from "@/lib/lookups";
import { minorToInput, formatMinor } from "@/lib/money";
import { currentValues, FIELD_LABEL, TARGET_LABEL, type TargetType } from "@/services/changes";
import { RECEIPT_METHODS } from "@/services/income";
import { proposeChangeAction } from "../../actions";
import { ActionForm, AmountInput, SupplierLines, Submit } from "@/components/forms";
import { Hidden } from "@/components/doc-parts";
import { Notice, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Propose a change" };
const PATH: Record<TargetType, string> = { requisition: "requisitions", receipt: "receipts", invoice: "invoices", supplier_invoice: "supplier-invoices" };

export default async function NewChange({ params, searchParams }: { params: Promise<{ jv: string }>; searchParams: Promise<{ type?: string; id?: string }> }) {
  const { jv } = await params;
  const { type, id } = await searchParams;
  const ctx = await requireJv(jv);
  guard(ctx, "propose_change");
  if (!type || !id || !(type in PATH)) notFound();
  const t = type as TargetType;
  let cur: Awaited<ReturnType<typeof currentValues>>;
  try { cur = await currentValues(db, ctx, t, id); } catch (e) {
    return <><PageHead title="Propose a change" /><Notice kind="error">{(e as Error).message}</Notice></>;
  }
  const v = cur.values;
  const [projects, cats, clients, sis] = await Promise.all([projectsOf(ctx), categoriesOf(ctx), clientsOf(ctx), supplierInvoicesOf(ctx)]);
  const currency = String(v.currency ?? "");
  const field = (k: string, el: React.ReactNode, hint?: string) => (
    <div className="field" key={k}><input type="hidden" name="fields" value={k} /><label htmlFor={`f_${k}`}>{FIELD_LABEL[k]}</label>{el}{hint ? <span className="hint">{hint}</span> : null}</div>
  );
  const sel = (k: string, opts: [string, string][], allowEmpty?: string) => (
    <select id={`f_${k}`} name={`f_${k}`} defaultValue={String(v[k] ?? "")}>{allowEmpty !== undefined ? <option value="">{allowEmpty}</option> : null}{opts.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
  );
  const txt = (k: string, type = "text") => <input id={`f_${k}`} name={`f_${k}`} type={type} defaultValue={String(v[k] ?? "")} />;
  const fields: React.ReactNode[] = [];
  const counter = ctx.roles.includes("cto") ? "Finance Officer" : "CTO";
  if (t === "requisition") {
    fields.push(field("date", txt("date", "date"), "Disbursement date, or the historical date for imported entries."));
    fields.push(field("amount", <AmountInput id="f_amount" name="f_amount" currency={currency} defaultValue={minorToInput(Number(v.amount))} />));
    fields.push(field("currency", sel("currency", ctx.jv.currencies.map((c) => [c, ccyLabels[c]]))));
    fields.push(field("payFrom", sel("payFrom", [["funding_partner", ctx.jv.fundingPartner], ["jv_income", "JV income held"]]), "Switch to JV income when a client receipt paid for this expense. Income held must cover it."));
    fields.push(field("projectId", sel("projectId", projects.map((p) => [p.id, p.name]), "General / not project-specific")));
    fields.push(field("categoryId", sel("categoryId", cats.map((c) => [c.id, c.name]), "Uncategorised")));
    fields.push(field("payee", txt("payee")));
    fields.push(field("endSupplier", txt("endSupplier")));
    fields.push(field("supplierInvoiceId", sel("supplierInvoiceId", sis.map((s) => [s.id, `${s.supplier} ${s.supplierInvoiceNo} (${s.currency} ${formatMinor(s.total)})`]), "Not linked")));
    fields.push(field("description", <textarea id="f_description" name="f_description" defaultValue={String(v.description ?? "")} />));
  } else if (t === "receipt") {
    fields.push(field("date", txt("date", "date")));
    fields.push(field("amount", <AmountInput id="f_amount" name="f_amount" currency={currency} defaultValue={minorToInput(Number(v.amount))} />));
    fields.push(field("currency", sel("currency", ctx.jv.currencies.map((c) => [c, ccyLabels[c]]))));
    fields.push(field("clientId", sel("clientId", clients.map((c) => [c.id, c.name]))));
    fields.push(field("method", sel("method", Object.entries(RECEIPT_METHODS))));
    fields.push(field("bankRef", txt("bankRef")));
  } else if (t === "invoice") {
    fields.push(field("issueDate", txt("issueDate", "date")));
    fields.push(field("dueDate", txt("dueDate", "date")));
    fields.push(field("fiscalInvoiceNo", txt("fiscalInvoiceNo")));
    if ("externalNumber" in v) fields.push(field("externalNumber", txt("externalNumber")));
    fields.push(field("clientId", sel("clientId", clients.map((c) => [c.id, c.name]))));
    fields.push(field("projectId", sel("projectId", projects.map((p) => [p.id, p.name]), "General")));
    fields.push(field("notes", <textarea id="f_notes" name="f_notes" defaultValue={String(v.notes ?? "")} />));
  } else {
    fields.push(field("supplier", txt("supplier")));
    fields.push(field("supplierInvoiceNo", txt("supplierInvoiceNo")));
    fields.push(field("invoiceDate", txt("invoiceDate", "date")));
    fields.push(field("currency", sel("currency", ctx.jv.currencies.map((c) => [c, ccyLabels[c]]))));
  }
  return (
    <>
      <PageHead title="Propose a change" crumbs={<Link href={`/j/${jv}/${PATH[t]}/${id}`}>{TARGET_LABEL[t]} {cur.label}</Link>} context={`Edit the fields that are wrong. Only changed fields are included. The ${counter} must authorise before anything changes.`} />
      <ActionForm action={proposeChangeAction}>
        <Hidden jv={jv} /><input type="hidden" name="targetType" value={t} /><input type="hidden" name="targetId" value={id} />
        <Panel title={`${TARGET_LABEL[t]} ${cur.label}`}><div className="form-row">{fields}</div></Panel>
        {t === "supplier_invoice" ? (
          <Panel title="Lines by project"><input type="hidden" name="fields" value="lines" />
            <SupplierLines projects={projects} currency={currency} defaultLines={(v.lines as { projectId: string; description: string; amount: number }[]).map((l) => ({ projectId: l.projectId, description: l.description, amount: minorToInput(l.amount) }))} />
          </Panel>
        ) : null}
        <Panel title="Reason">
          <div className="field"><label htmlFor="reason">Why this change is needed</label><textarea id="reason" name="reason" /><span className="hint">The {counter} sees this when deciding. Reference the supporting document where you can.</span></div>
        </Panel>
        <div className="form-actions"><Submit>Send for authorisation</Submit><Link className="btn btn-tertiary" href={`/j/${jv}/${PATH[t]}/${id}`}>Cancel</Link></div>
      </ActionForm>
    </>
  );
}
