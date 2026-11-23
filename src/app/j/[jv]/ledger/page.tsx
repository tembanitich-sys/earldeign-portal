import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";

import { fmtDate } from "@/lib/dates";
import { balances, ENTRY_LABEL, statement } from "@/lib/ledger";
import { Empty, Money, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Loan book" };

const SOURCE_PATH: Record<string, string> = { requisition: "requisitions", receipt: "receipts" };

export default async function Ledger({ params, searchParams }: { params: Promise<{ jv: string }>; searchParams: Promise<{ currency?: string; from?: string; to?: string }> }) {
  const { jv } = await params;
  const sp = await searchParams;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const currency = ctx.jv.currencies.includes(sp.currency ?? "") ? sp.currency! : ctx.jv.currencies[0];
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from : undefined;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to : undefined;
  const st = await statement(db, ctx.jv.id, currency, from, to);
  const bal = await balances(db, ctx.jv.id, ctx.jv.currencies);
  const q = new URLSearchParams({ currency, ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const period = from || to ? `${from ? fmtDate(from) : "Start"} to ${to ? fmtDate(to) : "today"}` : "All dates";
  return (
    <>
      <PageHead title="Loan book" context={<>{ctx.jv.name} · {period} · {currency} only. What the JV owes {ctx.jv.fundingPartner}, interest free.</>}
        actions={<>
          <a className="btn btn-secondary" href={`/api/pdf/${jv}/loan-statement/x?${q}`} target="_blank" rel="noopener">Statement PDF</a>
          <a className="btn btn-secondary" href={`/api/export/${jv}/ledger?${q}`}>Export CSV</a>
        </>} />
      <nav className="tabs" aria-label="Currency">
        {ctx.jv.currencies.map((c) => <Link key={c} href={`?currency=${c}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`} aria-current={c === currency ? "page" : undefined}>{c}</Link>)}
      </nav>
      <div className="kpis">
        {(() => { const b = bal.find((x) => x.currency === currency)!; return (<>
          <div className="kpi"><div className="k-label">Loan balance</div><div className="k-value"><span className="ccy">{currency}</span><Money minor={b.loan} /></div><div className="k-sub">Today</div></div>
          <div className="kpi"><div className="k-label">JV income held</div><div className="k-value"><span className="ccy">{currency}</span><Money minor={b.incomeHeld} /></div><div className="k-sub">Today</div></div>
          <div className="kpi"><div className="k-label">Net position</div><div className="k-value"><span className="ccy">{currency}</span><Money minor={b.net} /></div><div className="k-sub">Loan less income held</div></div>
        </>); })()}
      </div>
      <Panel>
        <form method="get" className="form-row" style={{ alignItems: "end" }}>
          <input type="hidden" name="currency" value={currency} />
          <div className="field"><label htmlFor="from">From</label><input id="from" type="date" name="from" defaultValue={from} /></div>
          <div className="field"><label htmlFor="to">To</label><input id="to" type="date" name="to" defaultValue={to} /></div>
          <div className="field"><button className="btn btn-secondary" type="submit">Apply dates</button></div>
        </form>
      </Panel>
      <Panel flush>
        {st.lines.length || from ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Date</th><th>Reference</th><th>Entry</th><th>Description</th><th className="num">Drawdown</th><th className="num">Offset</th><th className="num">Loan balance</th><th className="num">Income held</th></tr></thead>
            <tbody>
              {from ? <tr><td>{fmtDate(from)}</td><td colSpan={5}>Opening balance brought forward</td><td className="num"><Money minor={st.openingLoan} /></td><td className="num"><Money minor={st.openingIncome} /></td></tr> : null}
              {st.lines.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.entryDate)}</td>
                  <td>{SOURCE_PATH[e.sourceType] ? <Link href={`/j/${jv}/${SOURCE_PATH[e.sourceType]}/${e.sourceId}`}>{e.reference}</Link> : e.reference}</td>
                  <td>{ENTRY_LABEL[e.type]}{e.priorPeriodAdjustment ? <span className="tag" style={{ marginLeft: 6 }}>Prior period</span> : null}</td>
                  <td className="wrap">{e.description}</td>
                  <td className="num">{e.loanDelta > 0 ? <Money minor={e.loanDelta} /> : ""}</td>
                  <td className="num">{e.loanDelta < 0 ? <Money minor={-e.loanDelta} /> : ""}</td>
                  <td className="num"><Money minor={e.loanBalance} /></td>
                  <td className="num"><Money minor={e.incomeBalance} /></td>
                </tr>
              ))}
              <tr className="grand"><td colSpan={6}>Closing balance {currency}</td><td className="num"><Money minor={st.closingLoan} /></td><td className="num"><Money minor={st.closingIncome} /></td></tr>
            </tbody>
          </table></div>
        ) : <Empty title={`No ${currency} entries yet`}>Entries appear when requisitions are disbursed, receipts are recorded or the historical import is authorised.</Empty>}
      </Panel>
    </>
  );
}
