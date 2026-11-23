import Link from "next/link";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { fmtDate } from "@/lib/dates";
import { listRequisitions, REQ_STATUS_LABEL } from "@/services/requisitions";
import { Empty, Money, PageHead, Panel, PeriodContext, Status } from "@/components/ui";

export const metadata = { title: "Requisitions" };

const TABS: [string, string][] = [["open", "Open"], ["cto_review", "CTO review"], ["finance_review", "Finance approval"], ["approved", "To disburse"], ["acquittal_pending", "Acquittal"], ["closed", "Closed"], ["historical", "Historical"], ["", "All"]];

export default async function Requisitions({ params, searchParams }: { params: Promise<{ jv: string }>; searchParams: Promise<{ status?: string }> }) {
  const { jv } = await params;
  const { status = "open" } = await searchParams;
  const ctx = await requireJv(jv);
  const rows = await listRequisitions(db, ctx, { status: status || undefined });
  const base = `/j/${jv}/requisitions`;
  const totals = new Map<string, number>();
  rows.forEach((x) => totals.set(x.r.currency, (totals.get(x.r.currency) ?? 0) + x.r.total));
  return (
    <>
      <PageHead title="Requisitions" context={<PeriodContext jvName={ctx.jv.name} currencies={ctx.jv.currencies} />}
        actions={can(ctx, "create_requisition") ? <Link className="btn btn-primary" href={`${base}/new`}>New requisition</Link> : null} />
      <nav className="tabs" aria-label="Filter">
        {TABS.map(([k, label]) => <Link key={k} href={`${base}?status=${k}`} aria-current={status === k ? "page" : undefined}>{label}</Link>)}
      </nav>
      <Panel flush>
        {rows.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Number</th><th>Date</th><th>Payee</th><th>Project</th><th>Requested by</th><th>Status</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {rows.map(({ r, requester, project }) => (
                <tr key={r.id}>
                  <td><Link href={`${base}/${r.id}`}>{r.number}</Link></td>
                  <td>{fmtDate(r.isHistorical ? r.historicalDate : r.disbursedAt ?? r.createdAt)}</td>
                  <td className="wrap">{r.payee}{r.endSupplier ? <span className="muted small"> for {r.endSupplier}</span> : null}</td>
                  <td>{project ?? <span className="muted">{"–"}</span>}</td>
                  <td>{requester}</td>
                  <td><Status status={r.isHistorical ? "historical" : r.status} label={r.isHistorical ? "Historical" : REQ_STATUS_LABEL[r.status]} /></td>
                  <td className="num"><Money minor={r.total} currency={r.currency} /></td>
                </tr>
              ))}
              {[...totals.entries()].map(([c, v], i) => (
                <tr key={c} className={i === 0 ? "total" : undefined}><td colSpan={6}>Total {c} ({rows.filter((x) => x.r.currency === c).length})</td><td className="num"><Money minor={v} currency={c} /></td></tr>
              ))}
            </tbody>
          </table></div>
        ) : <Empty title="No requisitions here">{can(ctx, "create_requisition") ? "Use New requisition to raise one." : "Requisitions you can see will appear here."}</Empty>}
      </Panel>
    </>
  );
}
