import Link from "next/link";
import { notFound } from "next/navigation";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { fmtDate } from "@/lib/dates";
import { eventsOf } from "@/lib/lookups";
import { supplierInvoiceDetail, PAID_REQ_STATUSES } from "@/services/suppliers";
import { REQ_STATUS_LABEL } from "@/services/requisitions";
import { listAttachments } from "@/services/attachments";
import { pendingChangeFor } from "@/services/changes";
import { disputeAction } from "../../actions";
import { ActionForm, Submit } from "@/components/forms";
import { Attachments, Hidden, Timeline } from "@/components/doc-parts";
import { Empty, Facts, Money, Notice, PageHead, Panel, Status } from "@/components/ui";

export default async function SupplierInvoicePage({ params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const ctx = await requireJv(jv);
  const d = await supplierInvoiceDetail(db, ctx, id).catch(() => null);
  if (!d) notFound();
  const base = `/j/${jv}`;
  const pending = await pendingChangeFor(db, "supplier_invoice", id);
  const files = await listAttachments(db, ctx, "supplier_invoice", id);
  return (
    <>
      <PageHead title={`${d.si.supplier} ${d.si.supplierInvoiceNo}`} crumbs={<Link href={`${base}/supplier-invoices`}>Supplier invoices</Link>}
        context={<>{ctx.jv.name} · {d.si.currency} · Invoice dated {fmtDate(d.si.invoiceDate)}</>}
        actions={<>
          {can(ctx, "create_requisition") && d.outstanding > 0 ? <Link className="btn btn-primary" href={`${base}/requisitions/new`}>Raise payment requisition</Link> : null}
          {can(ctx, "propose_change") && !pending ? <Link className="btn btn-secondary" href={`${base}/changes/new?type=supplier_invoice&id=${id}`}>Propose a change</Link> : null}
        </>} />
      {pending ? <Notice kind="warning" title={`Change pending: ${pending.number}`}><Link href={`${base}/changes/${pending.id}`}>View the change request</Link>.</Notice> : null}
      {d.si.disputed ? <Notice kind="warning" title="Disputed">{d.si.disputeComment}</Notice> : null}
      <div className="kpis">
        <div className="kpi"><div className="k-label">Invoiced</div><div className="k-value"><span className="ccy">{d.si.currency}</span><Money minor={d.si.total} /></div></div>
        <div className="kpi"><div className="k-label">Paid to date</div><div className="k-value"><span className="ccy">{d.si.currency}</span><Money minor={d.paid} /></div></div>
        <div className="kpi"><div className="k-label">Outstanding</div><div className="k-value"><span className="ccy">{d.si.currency}</span><Money minor={d.outstanding} /></div></div>
      </div>
      <Panel title="Lines by project" flush>
        <table className="data"><thead><tr><th>Project</th><th>Description</th><th className="num">Amount</th></tr></thead>
          <tbody>{d.lines.map(({ l, project }) => <tr key={l.id}><td>{project}</td><td className="wrap">{l.description}</td><td className="num"><Money minor={l.amount} /></td></tr>)}
            <tr className="grand"><td colSpan={2}>Total</td><td className="num"><Money minor={d.si.total} currency={d.si.currency} /></td></tr></tbody></table>
      </Panel>
      <Panel title="Payments" flush>
        {d.payments.length ? (
          <table className="data"><thead><tr><th>Requisition</th><th>Status</th><th>Counts as paid</th><th className="num">Amount</th></tr></thead>
            <tbody>{d.payments.map(({ r, amount }) => <tr key={r.id}><td><Link href={`${base}/requisitions/${r.id}`}>{r.number}</Link></td><td><Status status={r.isHistorical ? "historical" : r.status} label={r.isHistorical ? "Historical" : REQ_STATUS_LABEL[r.status]} /></td><td>{PAID_REQ_STATUSES.includes(r.status) ? "Yes" : "Not yet disbursed"}</td><td className="num"><Money minor={amount} /></td></tr>)}</tbody></table>
        ) : <Empty title="No payments linked">Link a requisition to this invoice when raising it, or link a historical payment through a change request.</Empty>}
      </Panel>
      <div className="grid-2">
        <Panel title="Files"><Attachments jv={jv} ownerType="supplier_invoice" ownerId={id} items={files} back={`${base}/supplier-invoices/${id}`} canUpload={can(ctx, "record_supplier_invoice")} /></Panel>
        <Panel title="Dispute">
          {can(ctx, "record_supplier_invoice") ? (
            <ActionForm action={disputeAction}><Hidden jv={jv} id={id} />
              <input type="hidden" name="disputed" value={d.si.disputed ? "0" : "1"} />
              {!d.si.disputed ? <div className="field"><label htmlFor="comment">What is disputed</label><textarea id="comment" name="comment" /></div> : null}
              <div className="form-actions"><Submit variant="secondary">{d.si.disputed ? "Clear dispute" : "Mark as disputed"}</Submit></div>
            </ActionForm>
          ) : <Facts items={[["Disputed", d.si.disputed ? "Yes" : "No"]]} />}
          <h3 style={{ marginTop: 16 }}>History</h3>
          <Timeline events={await eventsOf(ctx, "supplier_invoice", id)} />
        </Panel>
      </div>
    </>
  );
}
