import { desc, eq } from "drizzle-orm";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { conversions } from "@/db/schema";

import { fmtDate, todayIso } from "@/lib/dates";
import { balances } from "@/lib/ledger";
import { ccyLabels } from "@/lib/lookups";
import { conversionAction } from "../actions";
import { ActionForm, CurrencyAmount, Submit } from "@/components/forms";
import { Hidden } from "@/components/doc-parts";
import { Empty, Money, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Currency conversions" };

export default async function Conversions({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "record_conversion");
  const rows = await db.select().from(conversions).where(eq(conversions.jvId, ctx.jv.id)).orderBy(desc(conversions.conversionDate));
  const bal = await balances(db, ctx.jv.id, ctx.jv.currencies);
  return (
    <>
      <PageHead title="Currency conversions" context="Each currency keeps its own balance. To use income received in one currency to pay an expense in another, record the conversion here at the actual rate." />
      <Panel title="Record a conversion of JV income held">
        <p className="small muted">Income held now: {bal.map((b) => `${b.currency} ${(b.incomeHeld / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`).join(" · ")}</p>
        <ActionForm action={conversionAction}><Hidden jv={jv} />
          <div className="field" style={{ maxWidth: 260 }}><label htmlFor="date">Date</label><input id="date" type="date" name="date" defaultValue={todayIso()} /></div>
          <CurrencyAmount currencies={ctx.jv.currencies} labels={ccyLabels} currencyName="fromCurrency" amountName="fromAmount" currencyLabel="From currency" amountLabel="Amount converted" />
          <CurrencyAmount currencies={ctx.jv.currencies} labels={ccyLabels} currencyName="toCurrency" amountName="toAmount" defaultCurrency={ctx.jv.currencies[1]} currencyLabel="To currency" amountLabel="Amount received" />
          <div className="field"><label htmlFor="note">Note (bank, dealer, reference)</label><input id="note" name="note" /></div>
          <div className="form-actions"><Submit confirm="Record this conversion? It moves income held between currency balances.">Record conversion</Submit></div>
        </ActionForm>
      </Panel>
      <Panel title="Conversions" flush>
        {rows.length ? <table className="data"><thead><tr><th>Number</th><th>Date</th><th className="num">From</th><th className="num">To</th><th className="num">Rate</th><th>Note</th></tr></thead>
          <tbody>{rows.map((c) => <tr key={c.id}><td>{c.number}</td><td>{fmtDate(c.conversionDate)}</td><td className="num"><Money minor={c.fromAmount} currency={c.fromCurrency} /></td><td className="num"><Money minor={c.toAmount} currency={c.toCurrency} /></td><td className="num">{c.rate}</td><td>{c.note}</td></tr>)}</tbody></table>
          : <Empty title="No conversions recorded" />}
      </Panel>
    </>
  );
}
