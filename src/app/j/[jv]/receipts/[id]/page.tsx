import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { incomeApplications, invoices, receiptAllocations, requisitions } from "@/db/schema";
import { can } from "@/lib/access";
import { fmtDate } from "@/lib/dates";
import { eventsOf, userName } from "@/lib/lookups";
import { getClient, getReceipt, openInvoices, RECEIPT_METHODS } from "@/services/income";
import { listAttachments } from "@/services/attachments";
import { pendingChangeFor } from "@/services/changes";
import { allocateReceiptAction } from "../../actions";
import { ActionForm, AmountInput, Submit } from "@/components/forms";
import { Attachments, Hidden, Timeline } from "@/components/doc-parts";
import { Empty, Facts, Money, Notice, PageHead, Panel } from "@/components/ui";

export default async function ReceiptPage({ params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const ctx = await requireJv(jv);
  const rc = await getReceipt(db, ctx, id).catch(() => null);
  if (!rc) notFound();
  const base = `/j/${jv}`;
  const client = await getClient(db, ctx, rc.clientId);
  const allocs = await db.select({ a: receiptAllocations, inv: invoices }).from(receiptAllocations).innerJoin(invoices, eq(invoices.id, receiptAllocations.invoiceId)).where(eq(receiptAllocations.receiptId, id));
  const allocated = allocs.reduce((s, x) => s + x.a.amount, 0);
  const applied = await db.select({ ia: incomeApplications, r: requisitions }).from(incomeApplications).innerJoin(requisitions, eq(requisitions.id, incomeApplications.requisitionId)).where(eq(incomeApplications.receiptId, id));
  const open = rc.amount - allocated > 0 ? (await openInvoices(db, ctx, rc.clientId)).filter((o) => o.inv.currency === rc.currency) : [];
  const pending = await pendingChangeFor(db, "receipt", id);
  return (
    <>
      <PageHead title={rc.number} crumbs={<Link href={`${base}/receipts`}>Receipts</Link>} context={`${ctx.jv.name} · ${rc.currency}`}
        actions={<>
          <a className="btn btn-secondary" href={`/api/pdf/${jv}/receipt/${id}`} target="_blank" rel="noopener">Print receipt</a>
          {can(ctx, "propose_change") && !pending ? <Link className="btn btn-secondary" href={`${base}/changes/new?type=receipt&id=${id}`}>Propose a change</Link> : null}
        </>} />
      {pending ? <Notice kind="warning" title={`Change pending: ${pending.number}`}><Link href={`${base}/changes/${pending.id}`}>View the change request</Link>.</Notice> : null}
      <div className="grid-2">
        <Panel title="Receipt">
          <Facts items={[["Client", client.name], ["Amount", <Money key="a" minor={rc.amount} currency={rc.currency} strong />], ["Date received", fmtDate(rc.receivedDate)], ["Method", RECEIPT_METHODS[rc.method]], ["Bank reference", rc.bankRef], ["Recorded by", await userName(rc.recordedById)], ["Allocated to invoices", <Money key="b" minor={allocated} />], ["Unallocated client credit", <Money key="c" minor={rc.amount - allocated} />]]} />
        </Panel>
        <Panel title="Applied to JV expenses">
          {applied.filter((x) => x.ia.active).length ? (
            <table className="data"><tbody>{applied.filter((x) => x.ia.active).map(({ ia, r }) => <tr key={ia.id}><td><Link href={`${base}/requisitions/${r.id}`}>{r.number}</Link></td><td className="wrap">{r.payee}</td><td className="num"><Money minor={ia.amount} /></td></tr>)}</tbody></table>
          ) : <Empty title="Not yet applied">This income is held by {ctx.jv.fundingPartner}. It offsets the loan when a requisition is paid from JV income.</Empty>}
        </Panel>
      </div>
      <Panel title="Allocated invoices" flush>
        {allocs.length ? <table className="data"><tbody>{allocs.map(({ a, inv }) => <tr key={inv.id}><td><Link href={`${base}/invoices/${inv.id}`}>{inv.number}</Link></td><td className="num"><Money minor={a.amount} /></td></tr>)}</tbody></table> : <Empty title="Not allocated to any invoice" />}
      </Panel>
      {open.length && can(ctx, "record_receipt") ? (
        <Panel title="Allocate the remaining credit" flush>
          <ActionForm action={allocateReceiptAction}><Hidden jv={jv} id={id} />
            <table className="data"><thead><tr><th>Invoice</th><th className="num">Outstanding</th><th style={{ width: 220 }}>Allocate</th></tr></thead>
              <tbody>{open.map((o) => <tr key={o.inv.id}><td>{o.inv.number}</td><td className="num"><Money minor={o.outstanding} /></td><td><input type="hidden" name="alloc_invoice" value={o.inv.id} /><AmountInput name="alloc_amount" currency={rc.currency} ariaLabel={`Allocate to ${o.inv.number}`} /></td></tr>)}</tbody></table>
            <div className="form-actions" style={{ padding: "0 24px 16px" }}><Submit variant="secondary">Allocate</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}
      <div className="grid-2">
        <Panel title="Files"><Attachments jv={jv} ownerType="receipt" ownerId={id} items={await listAttachments(db, ctx, "receipt", id)} back={`${base}/receipts/${id}`} canUpload={can(ctx, "record_receipt")} /></Panel>
        <Panel title="History"><Timeline events={await eventsOf(ctx, "receipt", id)} /></Panel>
      </div>
    </>
  );
}
