import { ActionForm, InvoiceLines, Submit } from "./forms";
import { Hidden } from "./doc-parts";
import { saveInvoiceAction } from "@/app/j/[jv]/actions";
import { ccyLabels } from "@/lib/lookups";
import type { Ctx } from "@/lib/access";
import { minorToInput } from "@/lib/money";
import { todayIso, addDays } from "@/lib/dates";

type Opt = { id: string; name: string };

export function InvoiceForm({ ctx, clients, projects, inv, lines, request }: {
  ctx: Ctx; clients: Opt[]; projects: Opt[];
  inv?: { id: string; clientId: string; projectId: string | null; currency: string; issueDate: string; dueDate: string | null; notes: string | null };
  lines?: { description: string; quantity: string; unitPrice: number; vatRateBp: number }[];
  request?: { id: string; clientId: string; projectId: string | null; currency: string; description: string; amount: number; requestedDueDate: string | null };
}) {
  const defLines = lines?.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: minorToInput(l.unitPrice), vat: String(l.vatRateBp) }))
    ?? (request ? [{ description: request.description, quantity: "1", unitPrice: minorToInput(request.amount), vat: String(ctx.jv.vatRateBp) }] : undefined);
  return (
    <ActionForm action={saveInvoiceAction}>
      <Hidden jv={ctx.jv.code} id={inv?.id} />
      {request ? <input type="hidden" name="invoiceRequestId" value={request.id} /> : null}
      <section className="panel"><div className="form">
        <div className="form-row">
          <div className="field"><label htmlFor="clientId">Client</label><select id="clientId" name="clientId" defaultValue={inv?.clientId ?? request?.clientId}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="projectId">Project</label><select id="projectId" name="projectId" defaultValue={inv?.projectId ?? request?.projectId ?? ""}><option value="">General</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="issueDate">Issue date</label><input id="issueDate" type="date" name="issueDate" defaultValue={inv?.issueDate ?? todayIso()} /></div>
          <div className="field"><label htmlFor="dueDate">Due date</label><input id="dueDate" type="date" name="dueDate" defaultValue={inv?.dueDate ?? request?.requestedDueDate ?? addDays(todayIso(), 30)} /></div>
        </div>
        <InvoiceLines currencies={ctx.jv.currencies} labels={ccyLabels} defaultCurrency={inv?.currency ?? request?.currency} vatRateBp={ctx.jv.vatRateBp} defaultLines={defLines} />
        <div className="field"><label htmlFor="notes">Notes on the invoice</label><textarea id="notes" name="notes" defaultValue={inv?.notes ?? ""} style={{ minHeight: 64 }} /></div>
      </div></section>
      <div className="form-actions"><Submit>Save draft invoice</Submit><span className="small muted">You enter the fiscal invoice number when you issue it.</span></div>
    </ActionForm>
  );
}
