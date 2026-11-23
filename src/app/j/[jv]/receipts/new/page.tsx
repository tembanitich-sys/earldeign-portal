import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { fmtDate, todayIso } from "@/lib/dates";
import { ccyLabels, clientsOf } from "@/lib/lookups";
import { openInvoices, RECEIPT_METHODS } from "@/services/income";
import { recordReceiptAction } from "../../actions";
import { ActionForm, AmountInput, CurrencyAmount, Submit } from "@/components/forms";
import { Hidden } from "@/components/doc-parts";
import { Money, Notice, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Record receipt" };

export default async function NewReceipt({ params, searchParams }: { params: Promise<{ jv: string }>; searchParams: Promise<{ client?: string; currency?: string }> }) {
  const { jv } = await params;
  const sp = await searchParams;
  const ctx = await requireJv(jv);
  guard(ctx, "record_receipt");
  const cl = await clientsOf(ctx);
  const client = cl.find((c) => c.id === sp.client);
  const currency = ctx.jv.currencies.includes(sp.currency ?? "") ? sp.currency! : ctx.jv.currencies[0];
  const open = client ? (await openInvoices(db, ctx, client.id)).filter((o) => o.inv.currency === currency) : [];
  return (
    <>
      <PageHead title="Record receipt" crumbs={<Link href={`/j/${jv}/receipts`}>Receipts</Link>} context={`Money received into ${ctx.jv.fundingPartner}'s account for this JV.`} />
      {cl.length === 0 ? <Notice kind="warning" title="No clients yet">{can(ctx, "manage_clients") ? <Link href={`/j/${jv}/clients/new?back=/j/${jv}/receipts/new`}>Add the client first</Link> : "Ask the Finance Officer to add the client."}</Notice> : null}
      <Panel title="1. Client and currency">
        <form method="get" className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="client">Client</label><select id="client" name="client" defaultValue={client?.id ?? ""}><option value="">Choose a client</option>{cl.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label htmlFor="cur">Currency received</label><select id="cur" name="currency" defaultValue={currency}>{ctx.jv.currencies.map((c) => <option key={c} value={c}>{ccyLabels[c]}</option>)}</select></div>
          </div>
          <div className="form-actions"><button className="btn btn-secondary" type="submit">Show open invoices</button></div>
        </form>
      </Panel>
      {client ? (
        <ActionForm action={recordReceiptAction}>
          <Hidden jv={jv} /><input type="hidden" name="clientId" value={client.id} /><input type="hidden" name="currency" value={currency} />
          <Panel title={`2. Payment from ${client.name} in ${currency}`}>
            <div className="form">
              <div className="form-row">
                <div className="field"><label htmlFor="amount">Amount received</label><AmountInput id="amount" name="amount" currency={currency} /></div>
                <div className="field"><label htmlFor="receivedDate">Date received</label><input id="receivedDate" type="date" name="receivedDate" defaultValue={todayIso()} max={todayIso()} /></div>
              </div>
              <div className="form-row">
                <div className="field"><label htmlFor="method">Method</label><select id="method" name="method">{Object.entries(RECEIPT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="field"><label htmlFor="bankRef">Bank reference</label><input id="bankRef" name="bankRef" /></div>
              </div>
              <div className="field"><label htmlFor="file">Proof of payment</label><input id="file" type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" /></div>
            </div>
          </Panel>
          <Panel title="3. Allocate to invoices" flush>
            {open.length ? (
              <table className="data"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th className="num">Outstanding</th><th style={{ width: 220 }}>Allocate</th></tr></thead>
                <tbody>{open.map((o) => (
                  <tr key={o.inv.id}><td>{o.inv.number}{o.inv.kind === "external" ? <span className="muted small"> ({o.inv.sourceSystem} {o.inv.externalNumber})</span> : null}</td><td>{fmtDate(o.inv.issueDate)}</td><td>{fmtDate(o.inv.dueDate)}</td><td className="num"><Money minor={o.outstanding} /></td>
                    <td><input type="hidden" name="alloc_invoice" value={o.inv.id} /><AmountInput name="alloc_amount" currency={currency} ariaLabel={`Allocate to ${o.inv.number}`} /></td></tr>
                ))}</tbody></table>
            ) : <p className="muted" style={{ padding: "16px 24px" }}>No open {currency} invoices for this client. The full amount is held as client credit and can be allocated later.</p>}
          </Panel>
          <div className="form-actions"><Submit>Record receipt</Submit><span className="small muted">Any unallocated amount is kept as client credit.</span></div>
        </ActionForm>
      ) : null}
    </>
  );
}
