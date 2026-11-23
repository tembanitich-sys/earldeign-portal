import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { clients, invoiceRequests, users } from "@/db/schema";
import { can } from "@/lib/access";
import { fmtDate } from "@/lib/dates";
import { IR_STATUS_LABEL } from "@/services/income";
import { Empty, Money, PageHead, Panel, Status } from "@/components/ui";

export const metadata = { title: "Invoice requests" };

export default async function InvoiceRequests({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  const conds = [eq(invoiceRequests.jvId, ctx.jv.id)];
  if (!can(ctx, "view_finance")) conds.push(eq(invoiceRequests.requesterId, ctx.userId));
  const rows = await db.select({ ir: invoiceRequests, client: clients.name, by: users.name }).from(invoiceRequests)
    .innerJoin(clients, eq(clients.id, invoiceRequests.clientId)).innerJoin(users, eq(users.id, invoiceRequests.requesterId))
    .where(and(...conds)).orderBy(desc(invoiceRequests.createdAt));
  return (
    <>
      <PageHead title="Invoice requests" context={<>The CTO or Project Coordinator asks for an invoice; the Finance Officer issues it. Project Coordinator requests go to the CTO first.</>}
        actions={can(ctx, "create_invoice_request") ? <Link className="btn btn-primary" href={`/j/${jv}/invoice-requests/new`}>Request an invoice</Link> : null} />
      <Panel flush>
        {rows.length ? (
          <table className="data"><thead><tr><th>Number</th><th>Date</th><th>Client</th><th>Requested by</th><th>Status</th><th className="num">Amount</th></tr></thead>
            <tbody>{rows.map(({ ir, client, by }) => <tr key={ir.id}><td><Link href={`/j/${jv}/invoice-requests/${ir.id}`}>{ir.number}</Link></td><td>{fmtDate(ir.createdAt)}</td><td>{client}</td><td>{by}</td><td><Status status={ir.status} label={IR_STATUS_LABEL[ir.status]} /></td><td className="num"><Money minor={ir.amount} currency={ir.currency} /></td></tr>)}</tbody></table>
        ) : <Empty title="No invoice requests yet" />}
      </Panel>
    </>
  );
}
