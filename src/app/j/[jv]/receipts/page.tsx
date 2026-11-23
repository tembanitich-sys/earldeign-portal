import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { fmtDate } from "@/lib/dates";
import { listReceipts, RECEIPT_METHODS } from "@/services/income";
import { Empty, Money, PageHead, Panel, PeriodContext } from "@/components/ui";

export const metadata = { title: "Receipts" };

export default async function Receipts({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const rows = await listReceipts(db, ctx);
  return (
    <>
      <PageHead title="Receipts" context={<>Money received from clients into {ctx.jv.fundingPartner}&apos;s account. Receipts increase JV income held; they reduce the loan only when applied to JV expenses. <PeriodContext jvName={ctx.jv.name} currencies={ctx.jv.currencies} /></>}
        actions={can(ctx, "record_receipt") ? <Link className="btn btn-primary" href={`/j/${jv}/receipts/new`}>Record receipt</Link> : null} />
      <Panel flush>
        {rows.length ? (
          <table className="data"><thead><tr><th>Number</th><th>Date</th><th>Client</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
            <tbody>{rows.map(({ rc, client }) => <tr key={rc.id}><td><Link href={`/j/${jv}/receipts/${rc.id}`}>{rc.number}</Link></td><td>{fmtDate(rc.receivedDate)}</td><td>{client}</td><td>{RECEIPT_METHODS[rc.method]}</td><td>{rc.bankRef}</td><td className="num"><Money minor={rc.amount} currency={rc.currency} /></td></tr>)}</tbody></table>
        ) : <Empty title="No receipts yet">Record client payments when they reach the bank.</Empty>}
      </Panel>
    </>
  );
}
