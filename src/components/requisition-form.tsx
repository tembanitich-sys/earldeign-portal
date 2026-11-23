import { ActionForm, RequisitionLines, Submit } from "./forms";
import { saveRequisitionAction } from "@/app/j/[jv]/actions";
import { Hidden } from "./doc-parts";
import { ccyLabels } from "@/lib/lookups";
import type { Ctx } from "@/lib/access";
import { formatMinor, minorToInput } from "@/lib/money";

type Opt = { id: string; name: string };

export function RequisitionForm({ ctx, projects, categories, supplierInvoices, r, lines, supplierInvoiceId, parentId }: {
  ctx: Ctx; projects: Opt[]; categories: Opt[]; supplierInvoices: { id: string; supplier: string; supplierInvoiceNo: string; currency: string; total: number }[];
  r?: { id: string; projectId: string | null; categoryId: string | null; currency: string; urgency: string; requiredBy: string | null; justification: string | null; payee: string; endSupplier: string | null; paymentMethod: string; payeeBankDetails: string | null; payFrom: string };
  lines?: { description: string; quantity: string; unitCost: number }[]; supplierInvoiceId?: string | null; parentId?: string;
}) {
  return (
    <ActionForm action={saveRequisitionAction}>
      <Hidden jv={ctx.jv.code} id={r?.id} />
      {parentId ? <input type="hidden" name="parentRequisitionId" value={parentId} /> : null}
      <section className="panel">
        <h2>What is needed</h2>
        <div className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="projectId">Project</label>
              <select id="projectId" name="projectId" defaultValue={r?.projectId ?? ""}><option value="">General / not project-specific</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label htmlFor="categoryId">Expense category</label>
              <select id="categoryId" name="categoryId" defaultValue={r?.categoryId ?? ""}><option value="">Choose a category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <RequisitionLines currencies={ctx.jv.currencies} labels={ccyLabels} defaultCurrency={r?.currency}
            defaultLines={lines?.map((l) => ({ description: l.description, quantity: l.quantity, unitCost: minorToInput(l.unitCost) }))} />
          <div className="field"><label htmlFor="justification">Justification</label><textarea id="justification" name="justification" defaultValue={r?.justification ?? ""} /><span className="hint">Why this spend is needed and what it is for.</span></div>
          <div className="form-row">
            <div className="field"><label htmlFor="urgency">Urgency</label><select id="urgency" name="urgency" defaultValue={r?.urgency ?? "normal"}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div>
            <div className="field"><label htmlFor="requiredBy">Required by</label><input id="requiredBy" type="date" name="requiredBy" defaultValue={r?.requiredBy ?? ""} /></div>
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Who is paid</h2>
        <div className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="payee">Payee</label><input id="payee" name="payee" defaultValue={r?.payee ?? ""} /><span className="hint">The person or company receiving the money.</span></div>
            <div className="field"><label htmlFor="endSupplier">End supplier (if different)</label><input id="endSupplier" name="endSupplier" defaultValue={r?.endSupplier ?? ""} /><span className="hint">Fill this in when funds pass through a person to the real supplier.</span></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="paymentMethod">Payment method</label><select id="paymentMethod" name="paymentMethod" defaultValue={r?.paymentMethod ?? "bank_transfer"}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option></select></div>
            <div className="field"><label htmlFor="payFrom">Proposed funding</label><select id="payFrom" name="payFrom" defaultValue={r?.payFrom ?? "funding_partner"}><option value="funding_partner">{ctx.jv.fundingPartner} (increases the loan)</option><option value="jv_income">JV income held (no net loan change)</option></select><span className="hint">The Finance Officer confirms this at approval.</span></div>
          </div>
          <div className="field"><label htmlFor="payeeBankDetails">Payee bank details</label><textarea id="payeeBankDetails" name="payeeBankDetails" defaultValue={r?.payeeBankDetails ?? ""} style={{ minHeight: 64 }} /><span className="hint">Required for bank transfers: bank, branch, account name and number.</span></div>
          {supplierInvoices.length ? (
            <div className="field"><label htmlFor="supplierInvoiceId">Pays a supplier invoice</label>
              <select id="supplierInvoiceId" name="supplierInvoiceId" defaultValue={supplierInvoiceId ?? ""}><option value="">No</option>{supplierInvoices.map((s) => <option key={s.id} value={s.id}>{s.supplier} {s.supplierInvoiceNo} ({s.currency} {formatMinor(s.total)})</option>)}</select>
              <span className="hint">Link developer or supplier invoices so the project cost view shows what is paid and outstanding.</span></div>
          ) : null}
        </div>
      </section>
      <div className="form-actions">
        <Submit name="submit" value="1">Save and submit</Submit>
        <Submit variant="secondary" name="submit" value="0">Save as draft</Submit>
      </div>
    </ActionForm>
  );
}
