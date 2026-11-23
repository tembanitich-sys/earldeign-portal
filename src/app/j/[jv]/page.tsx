import Link from "next/link";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { fmtDate, todayIso, daysBetween } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { currencySummaries, myActions, overdueAcquittals, overdueInvoices, taxClearanceWarning } from "@/services/reports";
import { Empty, Money, Notice, PageHead, Panel, PeriodContext } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  const base = `/j/${jv}`;
  const actions = (await myActions(db, ctx)).filter((a) => a.count > 0);
  const fin = can(ctx, "view_finance");
  const sums = fin ? await currencySummaries(db, ctx) : [];
  const acq = fin ? await overdueAcquittals(db, ctx) : [];
  const inv = fin ? await overdueInvoices(db, ctx) : [];
  const tax = fin ? taxClearanceWarning(ctx) : null;
  return (
    <>
      <PageHead title="Dashboard" context={<PeriodContext jvName={ctx.jv.name} currencies={ctx.jv.currencies} />}
        actions={<>
          {can(ctx, "create_requisition") ? <Link className="btn btn-primary" href={`${base}/requisitions/new`}>New requisition</Link> : null}
          {can(ctx, "create_invoice_request") ? <Link className="btn btn-secondary" href={`${base}/invoice-requests/new`}>Request an invoice</Link> : null}
        </>} />
      {tax ? <Notice kind="warning" title="Tax clearance">{tax} Ask the Super Admin to update the JV settings.</Notice> : null}

      <Panel title="Waiting for you">
        {actions.length ? (
          <table className="data"><tbody>
            {actions.map((a) => <tr key={a.label}><td><Link href={a.href}>{a.label}</Link></td><td className="num" style={{ fontWeight: 600 }}>{a.count}</td></tr>)}
          </tbody></table>
        ) : <Empty title="Nothing is waiting for you">New requests that need your review will appear here.</Empty>}
      </Panel>

      {sums.map((c) => (
        <section key={c.currency}>
          <div className="ccy-head"><h2>{c.currency}</h2><span className="muted small">Balances in {c.currency} only, as at {fmtDate(todayIso())}</span></div>
          <div className="kpis">
            <div className="kpi"><div className="k-label">Loan owed to {ctx.jv.fundingPartner}</div><div className="k-value"><span className="ccy">{c.currency}</span>{formatMinor(c.loan)}</div><div className="k-sub">Advances less offsets</div></div>
            <div className="kpi"><div className="k-label">JV income held by {ctx.jv.fundingPartner}</div><div className="k-value"><span className="ccy">{c.currency}</span>{formatMinor(c.incomeHeld)}</div><div className="k-sub">Received, not yet applied</div></div>
            <div className="kpi"><div className="k-label">Net position</div><div className="k-value"><span className="ccy">{c.currency}</span>{formatMinor(c.net)}</div><div className="k-sub">Loan less income held</div></div>
            <div className="kpi"><div className="k-label">Receivables</div><div className="k-value"><span className="ccy">{c.currency}</span>{formatMinor(c.receivables)}</div><div className="k-sub">Supplier payables {formatMinor(c.payables)}</div></div>
          </div>
          {c.monthBudget !== null ? (
            <p className="small muted" style={{ marginTop: -12 }}>Month-to-date spend {c.currency} {formatMinor(c.monthSpend)} against a monthly budget of {formatMinor(c.monthBudget)} ({c.monthBudget ? ((c.monthSpend / c.monthBudget) * 100).toFixed(1) : "0.0"}%).</p>
          ) : null}
        </section>
      ))}

      {fin ? (
        <div className="grid-2">
          <Panel title="Overdue acquittals">
            {acq.length ? (
              <table className="data"><thead><tr><th>Requisition</th><th>Disbursed</th><th className="num">Days</th><th className="num">Amount</th></tr></thead><tbody>
                {acq.map((r) => <tr key={r.id}><td><Link href={`${base}/requisitions/${r.id}`}>{r.number}</Link></td><td>{fmtDate(r.disbursedAt)}</td><td className="num">{daysBetween(r.disbursedAt!, todayIso())}</td><td className="num"><Money minor={r.total} currency={r.currency} /></td></tr>)}
              </tbody></table>
            ) : <Empty title="No overdue acquittals" />}
          </Panel>
          <Panel title="Overdue invoices">
            {inv.length ? (
              <table className="data"><thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th className="num">Outstanding</th></tr></thead><tbody>
                {inv.map((o) => <tr key={o.inv.id}><td><Link href={`${base}/invoices/${o.inv.id}`}>{o.inv.number}</Link></td><td>{o.client}</td><td>{fmtDate(o.inv.dueDate)}</td><td className="num"><Money minor={o.outstanding} currency={o.inv.currency} /></td></tr>)}
              </tbody></table>
            ) : <Empty title="No overdue invoices" />}
          </Panel>
        </div>
      ) : null}
    </>
  );
}
