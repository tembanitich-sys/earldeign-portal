import Link from "next/link";
import { notFound } from "next/navigation";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { can, ROLE_LABEL } from "@/lib/access";
import { fmtDate } from "@/lib/dates";
import { eventsOf, projectsOf, userName } from "@/lib/lookups";
import { getClient, getInvoiceRequest, IR_STATUS_LABEL } from "@/services/income";
import { invoiceRequestStepAction } from "../../actions";
import { ActionForm, Submit } from "@/components/forms";
import { Hidden, Timeline } from "@/components/doc-parts";
import { Facts, Money, PageHead, Panel, Status } from "@/components/ui";

export default async function InvoiceRequestPage({ params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const ctx = await requireJv(jv);
  const ir = await getInvoiceRequest(db, ctx, id).catch(() => null);
  if (!ir) notFound();
  const client = await getClient(db, ctx, ir.clientId);
  const mine = ir.requesterId === ctx.userId;
  const base = `/j/${jv}`;
  return (
    <>
      <PageHead title={ir.number} crumbs={<Link href={`${base}/invoice-requests`}>Invoice requests</Link>} context={<>{ctx.jv.name} · <Status status={ir.status} label={IR_STATUS_LABEL[ir.status]} /></>} />
      {mine && ["draft", "returned"].includes(ir.status) ? (
        <Panel title="Not yet submitted"><ActionForm action={invoiceRequestStepAction}><Hidden jv={jv} id={id} /><input type="hidden" name="step" value="submit" /><div className="form-actions"><Submit>Submit request</Submit></div></ActionForm></Panel>
      ) : null}
      {ir.status === "cto_review" && can(ctx, "cto_review") && !mine ? (
        <Panel title="CTO review"><ActionForm action={invoiceRequestStepAction}><Hidden jv={jv} id={id} /><input type="hidden" name="step" value="review" />
          <div className="field"><label htmlFor="comment">Comment</label><textarea id="comment" name="comment" /></div>
          <div className="form-actions"><Submit name="decision" value="approve">Forward to Finance Officer</Submit><Submit variant="secondary" name="decision" value="return">Return</Submit><Submit variant="destructive" name="decision" value="reject" confirm="Reject this request?">Reject</Submit></div>
        </ActionForm></Panel>
      ) : null}
      {ir.status === "finance_review" && can(ctx, "issue_invoice") && !mine ? (
        <Panel title="Finance Officer">
          <p>Create the invoice from this request, or return or reject it.</p>
          <div className="form-actions" style={{ marginBottom: 16 }}><Link className="btn btn-primary" href={`${base}/invoices/new?request=${id}`}>Create invoice</Link></div>
          <ActionForm action={invoiceRequestStepAction}><Hidden jv={jv} id={id} /><input type="hidden" name="step" value="review" />
            <div className="field"><label htmlFor="comment">Comment</label><textarea id="comment" name="comment" /></div>
            <div className="form-actions"><Submit variant="secondary" name="decision" value="return">Return</Submit><Submit variant="destructive" name="decision" value="reject" confirm="Reject this request?">Reject</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}
      <div className="grid-2">
        <Panel title="Request">
          <Facts items={[
            ["Requested by", `${await userName(ir.requesterId)} (${ROLE_LABEL[ir.requesterRole]})`], ["Client", client.name],
            ["Project", (await projectsOf(ctx, false)).find((p) => p.id === ir.projectId)?.name], ["Amount (before VAT)", <Money key="m" minor={ir.amount} currency={ir.currency} />],
            ["Description", <span key="d" className="pre">{ir.description}</span>], ["Requested due date", ir.requestedDueDate ? fmtDate(ir.requestedDueDate) : null],
            ["Invoice", ir.invoiceId && can(ctx, "view_finance") ? <Link key="i" href={`${base}/invoices/${ir.invoiceId}`}>View invoice</Link> : ir.invoiceId ? "Created" : null],
          ]} />
        </Panel>
        <Panel title="History"><Timeline events={await eventsOf(ctx, "invoice_request", id)} /></Panel>
      </div>
    </>
  );
}
