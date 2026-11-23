import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { fmtDate } from "@/lib/dates";
import { INVOICE_STATUS_LABEL, listInvoices } from "@/services/income";
import { Empty, Money, PageHead, Panel, PeriodContext, Status } from "@/components/ui";

export const metadata = { title: "Invoices" };

export default async function Invoices({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const rows = await listInvoices(db, ctx);
  return (
    <>
      <PageHead title="Invoices" context={<PeriodContext jvName={ctx.jv.name} currencies={ctx.jv.currencies} />}
        actions={can(ctx, "issue_invoice") ? <><Link className="btn btn-primary" href={`/j/${jv}/invoices/new`}>New invoice</Link><Link className="btn btn-secondary" href={`/j/${jv}/invoices/external`}>Record BusRep / InstaTickets invoice</Link></> : null} />
      <Panel flush>
        {rows.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Number</th><th>Source</th><th>Date</th><th>Client</th><th>Due</th><th>Status</th><th className="num">Total</th><th className="num">Outstanding</th></tr></thead>
            <tbody>{rows.map(({ inv, client, outstanding }) => (
              <tr key={inv.id}><td><Link href={`/j/${jv}/invoices/${inv.id}`}>{inv.number}</Link></td><td>{inv.kind === "external" ? `${inv.sourceSystem} ${inv.externalNumber}` : "Portal"}</td><td>{fmtDate(inv.issueDate)}</td><td>{client}</td><td>{fmtDate(inv.dueDate)}</td>
                <td><Status status={inv.status} label={INVOICE_STATUS_LABEL[inv.status]} /></td><td className="num"><Money minor={inv.total} currency={inv.currency} /></td><td className="num"><Money minor={outstanding} /></td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title="No invoices yet">Invoices are created by the Finance Officer, usually from an invoice request.</Empty>}
      </Panel>
    </>
  );
}
