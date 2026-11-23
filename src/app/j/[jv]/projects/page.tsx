import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";

import { projectCosts } from "@/services/suppliers";
import { Empty, Money, PageHead, Panel, PeriodContext } from "@/components/ui";

export const metadata = { title: "Project costs" };

export default async function Projects({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const rows = await projectCosts(db, ctx);
  const currencies = [...new Set(rows.map((r) => r.currency))];
  return (
    <>
      <PageHead title="Project costs" context={<PeriodContext jvName={ctx.jv.name} currencies={ctx.jv.currencies} />} />
      <p className="muted" style={{ maxWidth: 760 }}>Supplier invoices tagged to each project, what has been paid against them (split by who funded the payment) and what is still owed. Total spend includes every disbursed requisition tagged to the project, with or without a supplier invoice.</p>
      {currencies.length === 0 ? <Panel><Empty title="No project costs yet">Record supplier invoices and tag requisitions with projects.</Empty></Panel> : null}
      {currencies.map((c) => {
        const rs = rows.filter((r) => r.currency === c);
        const t = rs.reduce((s, r) => ({ invoiced: s.invoiced + r.invoiced, pp: s.pp + r.paidPartner, pi: s.pi + r.paidIncome, out: s.out + r.outstanding, spend: s.spend + r.totalSpend }), { invoiced: 0, pp: 0, pi: 0, out: 0, spend: 0 });
        return (
          <Panel key={c} title={c} flush>
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Project</th><th className="num">Supplier invoices</th><th className="num">Paid by {ctx.jv.fundingPartner}</th><th className="num">Paid from JV income</th><th className="num">Outstanding to suppliers</th><th className="num">Total spend recorded</th></tr></thead>
              <tbody>
                {rs.map((r) => <tr key={r.project}><td>{r.project}</td><td className="num"><Money minor={r.invoiced} /></td><td className="num"><Money minor={r.paidPartner} /></td><td className="num"><Money minor={r.paidIncome} /></td><td className="num"><Money minor={r.outstanding} /></td><td className="num"><Money minor={r.totalSpend} /></td></tr>)}
                <tr className="grand"><td>Total {c}</td><td className="num"><Money minor={t.invoiced} /></td><td className="num"><Money minor={t.pp} /></td><td className="num"><Money minor={t.pi} /></td><td className="num"><Money minor={t.out} /></td><td className="num"><Money minor={t.spend} /></td></tr>
              </tbody>
            </table></div>
          </Panel>
        );
      })}
    </>
  );
}
