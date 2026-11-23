import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { can } from "@/lib/access";
import { ccyLabels, clientsOf, projectsOf } from "@/lib/lookups";
import { saveInvoiceRequestAction } from "../../actions";
import { ActionForm, CurrencyAmount, Submit } from "@/components/forms";
import { Hidden } from "@/components/doc-parts";
import { Notice, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Request an invoice" };

export default async function NewInvoiceRequest({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "create_invoice_request");
  const cl = await clientsOf(ctx);
  return (
    <>
      <PageHead title="Request an invoice" crumbs={<Link href={`/j/${jv}/invoice-requests`}>Invoice requests</Link>} />
      {cl.length === 0 ? <Notice kind="warning" title="No clients yet">{can(ctx, "manage_clients") ? <Link href={`/j/${jv}/clients/new?back=/j/${jv}/invoice-requests/new`}>Add the client first</Link> : "Ask the Finance Officer to add the client first."}</Notice> : (
        <Panel>
          <ActionForm action={saveInvoiceRequestAction}><Hidden jv={jv} />
            <div className="form-row">
              <div className="field"><label htmlFor="clientId">Client</label><select id="clientId" name="clientId">{cl.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="field"><label htmlFor="projectId">Project</label><select id="projectId" name="projectId"><option value="">General</option>{(await projectsOf(ctx)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            </div>
            <CurrencyAmount currencies={ctx.jv.currencies} labels={ccyLabels} currencyName="currency" amountName="amount" amountLabel="Amount to invoice (before VAT)" />
            <div className="field"><label htmlFor="description">Work or services to invoice</label><textarea id="description" name="description" /></div>
            <div className="field" style={{ maxWidth: 260 }}><label htmlFor="requestedDueDate">Requested due date</label><input id="requestedDueDate" type="date" name="requestedDueDate" /></div>
            <div className="form-actions"><Submit name="submit" value="1">Submit request</Submit><Submit variant="secondary" name="submit" value="0">Save as draft</Submit></div>
          </ActionForm>
        </Panel>
      )}
    </>
  );
}
