import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";

import { debtorsAgeing } from "@/services/reports";
import { listSupplierInvoices } from "@/services/suppliers";
import { Empty, Money, PageHead, Panel, PeriodContext } from "@/components/ui";

export const metadata = { title: "Reports" };

export default async function Reports({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const ageing = await debtorsAgeing(db, ctx);
  const payables = (await listSupplierInvoices(db, ctx)).filter((x) => x.outstanding > 0);
  const base = `/j/${jv}`;
  return (
    <>
      <PageHead title="Reports" context={<PeriodContext jvName={ctx.jv.name} currencies={ctx.jv.currencies} />} />
      <Panel title="Exports and statements">
        <ul className="attach-list">
          {ctx.jv.currencies.map((c) => <li key={c}><a href={`/api/pdf/${jv}/loan-statement/x?currency=${c}`} target="_blank" rel="noopener">Loan statement {c} (PDF)</a> · <a href={`/api/export/${jv}/ledger?currency=${c}`}>Loan book {c} (CSV)</a></li>)}
          <li><a href={`/api/export/${jv}/requisitions`}>Requisition register (CSV)</a></li>
          <li><a href={`/api/export/${jv}/invoices`}>Invoice register (CSV)</a></li>
          <li><a href={`/api/export/${jv}/receipts`}>Receipt register (CSV)</a></li>
          <li><a href={`/api/pdf/${jv}/opening-balance/x`} target="_blank" rel="noopener">Opening balance report (PDF)</a></li>
          <li><Link href={`${base}/projects`}>Project costs</Link></li>
        </ul>
      </Panel>
      <Panel title="Debtors ageing" flush>
        {ageing.length ? <div className="table-wrap"><table className="data"><thead><tr><th>Client</th><th>Currency</th><th className="num">Not yet due</th><th className="num">1 to 30 days</th><th className="num">31 to 60</th><th className="num">61 to 90</th><th className="num">Over 90</th><th className="num">Total</th></tr></thead>
          <tbody>{ageing.map((r) => <tr key={r.client + r.currency}><td>{r.client}</td><td>{r.currency}</td><td className="num"><Money minor={r.current} /></td><td className="num"><Money minor={r.d30} /></td><td className="num"><Money minor={r.d60} /></td><td className="num"><Money minor={r.d90} /></td><td className="num"><Money minor={r.d90p} /></td><td className="num"><Money minor={r.total} strong /></td></tr>)}</tbody></table></div>
          : <Empty title="No outstanding receivables" />}
      </Panel>
      <Panel title="Supplier payables outstanding" flush>
        {payables.length ? <table className="data"><thead><tr><th>Supplier</th><th>Invoice</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Outstanding</th></tr></thead>
          <tbody>{payables.map(({ si, paid, outstanding }) => <tr key={si.id}><td><Link href={`${base}/supplier-invoices/${si.id}`}>{si.supplier}</Link></td><td>{si.supplierInvoiceNo}</td><td className="num"><Money minor={si.total} currency={si.currency} /></td><td className="num"><Money minor={paid} /></td><td className="num"><Money minor={outstanding} /></td></tr>)}</tbody></table>
          : <Empty title="No outstanding supplier invoices" />}
      </Panel>
    </>
  );
}
