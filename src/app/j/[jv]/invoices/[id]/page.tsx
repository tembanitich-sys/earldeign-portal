import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { creditNotes, invoiceLines, receiptAllocations, receipts } from "@/db/schema";
import { can } from "@/lib/access";
import { fmtDate, todayIso } from "@/lib/dates";
import { eventsOf, projectsOf } from "@/lib/lookups";
import { getClient, getInvoice, INVOICE_STATUS_LABEL, invoiceSettlement } from "@/services/income";
import { listAttachments } from "@/services/attachments";
import { pendingChangeFor } from "@/services/changes";
import { invoiceStepAction } from "../../actions";
import { ActionForm, AmountInput, Submit } from "@/components/forms";
import { Attachments, Hidden, Timeline } from "@/components/doc-parts";
import { Empty, Facts, Money, Notice, PageHead, Panel, Status } from "@/components/ui";

export default async function InvoicePage({ params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const ctx = await requireJv(jv);
  const inv = await getInvoice(db, ctx, id).catch(() => null);
  if (!inv) notFound();
  const base = `/j/${jv}`;
  const client = await getClient(db, ctx, inv.clientId);
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.position));
  const pays = await db.select({ a: receiptAllocations, rc: receipts }).from(receiptAllocations).innerJoin(receipts, eq(receipts.id, receiptAllocations.receiptId)).where(eq(receiptAllocations.invoiceId, id));
  const cns = await db.select().from(creditNotes).where(eq(creditNotes.invoiceId, id));
  const st = (await invoiceSettlement(db, [id])).get(id)!;
  const outstanding = inv.total - st.paid - st.credited;
  const pending = await pendingChangeFor(db, "invoice", id);
  const fo = can(ctx, "issue_invoice");
  return (
    <>
      <PageHead title={inv.number} crumbs={<Link href={`${base}/invoices`}>Invoices</Link>}
        context={<>{ctx.jv.companyName} · {inv.currency} · <Status status={inv.status} label={INVOICE_STATUS_LABEL[inv.status]} /></>}
        actions={<>
          {inv.kind === "native" ? <a className="btn btn-secondary" href={`/api/pdf/${jv}/invoice/${id}`} target="_blank" rel="noopener">Print PDF</a> : null}
          {fo && inv.status === "draft" ? <Link className="btn btn-secondary" href={`${base}/invoices/${id}/edit`}>Edit draft</Link> : null}
          {can(ctx, "record_receipt") && ["issued", "part_paid"].includes(inv.status) ? <Link className="btn btn-primary" href={`${base}/receipts/new?client=${inv.clientId}&currency=${inv.currency}`}>Record payment</Link> : null}
          {can(ctx, "propose_change") && inv.status !== "draft" && inv.status !== "void" && !pending ? <Link className="btn btn-secondary" href={`${base}/changes/new?type=invoice&id=${id}`}>Propose a change</Link> : null}
        </>} />
      {pending ? <Notice kind="warning" title={`Change pending: ${pending.number}`}><Link href={`${base}/changes/${pending.id}`}>View the change request</Link>.</Notice> : null}
      {inv.status === "draft" && fo ? (
        <Panel title="Issue this invoice">
          <p className="small muted">Issue it on the fiscal device first, then enter the fiscal invoice number here. Issued invoices can only be corrected with a credit note or a change request.</p>
          <ActionForm action={invoiceStepAction}><Hidden jv={jv} id={id} /><input type="hidden" name="step" value="issue" />
            <div className="field" style={{ maxWidth: 360 }}><label htmlFor="fiscalInvoiceNo">Fiscal invoice number</label><input id="fiscalInvoiceNo" name="fiscalInvoiceNo" /></div>
            <div className="form-actions"><Submit>Issue invoice</Submit></div>
          </ActionForm>
          <ActionForm action={invoiceStepAction}><Hidden jv={jv} id={id} /><input type="hidden" name="step" value="void" />
            <div className="form-actions"><Submit variant="tertiary" confirm="Void this draft invoice?">Void draft</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}
      <div className="kpis">
        <div className="kpi"><div className="k-label">Invoice total</div><div className="k-value"><span className="ccy">{inv.currency}</span><Money minor={inv.total} /></div></div>
        <div className="kpi"><div className="k-label">Paid</div><div className="k-value"><span className="ccy">{inv.currency}</span><Money minor={st.paid} /></div></div>
        <div className="kpi"><div className="k-label">Credited</div><div className="k-value"><span className="ccy">{inv.currency}</span><Money minor={st.credited} /></div></div>
        <div className="kpi"><div className="k-label">Outstanding</div><div className="k-value"><span className="ccy">{inv.currency}</span><Money minor={inv.status === "draft" || inv.status === "void" ? 0 : outstanding} /></div></div>
      </div>
      <div className="grid-2">
        <Panel title="Details">
          <Facts items={[
            ["Client", <Link key="c" href={`${base}/clients/${client.id}`}>{client.name}</Link>], ["Project", (await projectsOf(ctx, false)).find((p) => p.id === inv.projectId)?.name],
            ["Issue date", fmtDate(inv.issueDate)], ["Due date", fmtDate(inv.dueDate)], ["Fiscal invoice number", inv.fiscalInvoiceNo],
            ...(inv.kind === "external" ? [["Source", `${inv.sourceSystem}, invoice ${inv.externalNumber}`] as [string, React.ReactNode]] : []),
            ["Notes", inv.notes],
          ]} />
        </Panel>
        <Panel title="Payments and credits">
          {pays.length || cns.length ? (
            <table className="data"><tbody>
              {pays.map(({ a, rc }) => <tr key={rc.id}><td><Link href={`${base}/receipts/${rc.id}`}>{rc.number}</Link></td><td>{fmtDate(rc.receivedDate)}</td><td className="num"><Money minor={a.amount} /></td></tr>)}
              {cns.map((c) => <tr key={c.id}><td>{c.number} (credit note)</td><td>{fmtDate(c.noteDate)}</td><td className="num"><Money minor={c.amount} /></td></tr>)}
            </tbody></table>
          ) : <Empty title="No payments yet" />}
        </Panel>
      </div>
      {lines.length ? (
        <Panel title="Lines" flush>
          <table className="data"><thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">VAT rate</th><th className="num">Net</th><th className="num">VAT</th></tr></thead>
            <tbody>{lines.map((l) => <tr key={l.id}><td className="wrap">{l.description}</td><td className="num">{l.quantity}</td><td className="num"><Money minor={l.unitPrice} /></td><td className="num">{(l.vatRateBp / 100).toFixed(1)}%</td><td className="num"><Money minor={l.lineNet} /></td><td className="num"><Money minor={l.lineVat} /></td></tr>)}
              <tr className="total"><td colSpan={4}>Subtotal and VAT</td><td className="num"><Money minor={inv.subtotal} /></td><td className="num"><Money minor={inv.vatTotal} /></td></tr>
              <tr className="grand"><td colSpan={5}>Total</td><td className="num"><Money minor={inv.total} currency={inv.currency} /></td></tr></tbody></table>
        </Panel>
      ) : null}
      {fo && ["issued", "part_paid"].includes(inv.status) ? (
        <Panel title="Raise a credit note">
          <ActionForm action={invoiceStepAction}><Hidden jv={jv} id={id} /><input type="hidden" name="step" value="credit" />
            <div className="form-row">
              <div className="field"><label htmlFor="amount">Amount</label><AmountInput id="amount" name="amount" currency={inv.currency} /></div>
              <div className="field"><label htmlFor="date">Date</label><input id="date" type="date" name="date" defaultValue={todayIso()} /></div>
            </div>
            <div className="field"><label htmlFor="reason">Reason</label><textarea id="reason" name="reason" style={{ minHeight: 64 }} /></div>
            <div className="form-actions"><Submit variant="secondary" confirm="Raise this credit note? It reduces what the client owes.">Raise credit note</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}
      <div className="grid-2">
        <Panel title="Files"><Attachments jv={jv} ownerType="invoice" ownerId={id} items={await listAttachments(db, ctx, "invoice", id)} back={`${base}/invoices/${id}`} canUpload={fo} /></Panel>
        <Panel title="History"><Timeline events={await eventsOf(ctx, "invoice", id)} /></Panel>
      </div>
    </>
  );
}
