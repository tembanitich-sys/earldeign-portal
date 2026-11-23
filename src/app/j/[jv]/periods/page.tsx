import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { fmtDateTime, fmtYearMonth, todayIso } from "@/lib/dates";
import { listPeriods } from "@/services/periods";
import { closePeriodAction } from "../actions";
import { ActionForm, Submit } from "@/components/forms";
import { Hidden } from "@/components/doc-parts";
import { Empty, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Periods" };

export default async function Periods({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const rows = await listPeriods(db, ctx);
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return (
    <>
      <PageHead title="Periods" context="Closed months accept no new postings. Corrections to a closed month go through an authorised change request and are labelled prior period adjustments. Keep months open until catch-up items (for example the Land Fortune invoice and receipt) are captured." />
      {can(ctx, "close_period") ? (
        <Panel title="Close a month">
          <ActionForm action={closePeriodAction}><Hidden jv={jv} />
            <div className="field" style={{ maxWidth: 260 }}><label htmlFor="month">Month</label><input id="month" type="month" name="month" defaultValue={d.toISOString().slice(0, 7)} max={todayIso().slice(0, 7)} /></div>
            <div className="form-actions"><Submit variant="destructive" confirm="Close this month? New postings into it will be rejected. This cannot be reopened from the portal.">Close month</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}
      <Panel title="Closed months" flush>
        {rows.length ? <table className="data"><thead><tr><th>Month</th><th>Closed by</th><th>When</th></tr></thead><tbody>{rows.map(({ p, by }) => <tr key={p.yearMonth}><td>{fmtYearMonth(p.yearMonth)}</td><td>{by}</td><td>{fmtDateTime(p.closedAt)}</td></tr>)}</tbody></table> : <Empty title="No months closed yet" />}
      </Panel>
    </>
  );
}
