import Link from "next/link";
import { notFound } from "next/navigation";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { fmtDate } from "@/lib/dates";
import { getClient, INVOICE_STATUS_LABEL } from "@/services/income";
import { clientStatement } from "@/services/reports";
import { ClientForm } from "@/components/client-form";
import { Empty, Money, PageHead, Panel, Status } from "@/components/ui";

export default async function ClientPage({ params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const ctx = await requireJv(jv);
  const c = await getClient(db, ctx, id).catch(() => null);
  if (!c || !can(ctx, "view_finance")) notFound();
  const st = await clientStatement(db, ctx, id);
  const ccys = [...new Set(st.map((x) => x.inv.currency))];
  return (
    <>
      <PageHead title={c.name} crumbs={<Link href={`/j/${jv}/clients`}>Clients</Link>} context={ctx.jv.name}
        actions={st.length ? <a className="btn btn-secondary" href={`/api/pdf/${jv}/client-statement/${id}`} target="_blank" rel="noopener">Statement PDF</a> : null} />
      <Panel title="Statement of account" flush>
        {st.length ? ccys.map((cc) => {
          const rows = st.filter((x) => x.inv.currency === cc);
          return (
            <table className="data" key={cc}><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Status</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Credited</th><th className="num">Outstanding</th></tr></thead>
              <tbody>{rows.map((x) => <tr key={x.inv.id}><td><Link href={`/j/${jv}/invoices/${x.inv.id}`}>{x.inv.number}</Link></td><td>{fmtDate(x.inv.issueDate)}</td><td>{fmtDate(x.inv.dueDate)}</td><td><Status status={x.inv.status} label={INVOICE_STATUS_LABEL[x.inv.status]} /></td><td className="num"><Money minor={x.inv.total} /></td><td className="num"><Money minor={x.paid} /></td><td className="num"><Money minor={x.credited} /></td><td className="num"><Money minor={x.outstanding} /></td></tr>)}
                <tr className="grand"><td colSpan={7}>Outstanding {cc}</td><td className="num"><Money minor={rows.reduce((s, x) => s + x.outstanding, 0)} currency={cc} /></td></tr></tbody></table>
          );
        }) : <Empty title="No invoices for this client yet" />}
      </Panel>
      {can(ctx, "manage_clients") ? <Panel title="Client details"><ClientForm jv={jv} c={c} /></Panel> : null}
    </>
  );
}
