import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditNotes, invoiceLines, jvBankAccounts, receiptAllocations, invoices, clients } from "@/db/schema";
import { can, loadCtx, ROLE_LABEL } from "@/lib/access";
import { getSession } from "@/lib/session";
import { fmtDate, fmtDateTime, todayIso } from "@/lib/dates";
import { amountInWords } from "@/lib/money";
import { ENTRY_LABEL, statement } from "@/lib/ledger";
import { eventsOf, projectsOf, categoriesOf, userName } from "@/lib/lookups";
import { Box, Facts, H3, m, P, renderDoc, Signatures, Table } from "@/lib/pdf";
import { requisitionDetail, REQ_STATUS_LABEL } from "@/services/requisitions";
import { getClient, getInvoice, getReceipt, RECEIPT_METHODS, invoiceSettlement } from "@/services/income";
import { clientStatement } from "@/services/reports";
import { openingBalanceReport } from "@/services/imports";

export async function GET(req: Request, { params }: { params: Promise<{ jv: string; type: string; id: string }> }) {
  const { jv, type, id } = await params;
  const s = await getSession();
  if (!s || (s.user.totpEnabled && !s.session.twoFactorPassed) || s.user.mustChangePassword) return new Response("Sign in first.", { status: 401 });
  const ctx = await loadCtx(db, s.user.id, jv);
  if (!ctx) return new Response("Not found", { status: 404 });
  const app = process.env.APP_URL ?? new URL(req.url).origin;
  const base = `${app}/j/${jv}`;
  const url = new URL(req.url);
  try {
    let buf: Buffer;
    let filename: string;
    if (type === "requisition") {
      const { r, lines, supplierLink } = await requisitionDetail(db, ctx, id);
      const events = await eventsOf(ctx, "requisition", id);
      const project = (await projectsOf(ctx, false)).find((p) => p.id === r.projectId)?.name;
      const category = (await categoriesOf(ctx, false)).find((c) => c.id === r.categoryId)?.name;
      filename = `${r.number}.pdf`;
      buf = await renderDoc({
        jv: ctx.jv, title: "Requisition", number: r.number, subtitle: r.isHistorical ? "Historical entry" : REQ_STATUS_LABEL[r.status], verifyUrl: `${base}/requisitions/${id}`,
        children: (<>
          <Facts items={[
            ["Requested by", `${await userName(r.requesterId)} (${ROLE_LABEL[r.requesterRole]})`], ["Date raised", fmtDate(r.createdAt)],
            ["Project", project], ["Category", category], ["Payee", r.payee], ["End supplier", r.endSupplier],
            ["Payment method", r.paymentMethod === "cash" ? "Cash" : r.paymentMethod === "bank_transfer" ? "Bank transfer" : "Not recorded"],
            ["Funding", r.payFrom === "jv_income" ? "JV income held" : ctx.jv.fundingPartner], ["Urgency", r.urgency === "urgent" ? "Urgent" : "Normal"], ["Required by", r.requiredBy ? fmtDate(r.requiredBy) : null],
            ["Payee bank details", r.payeeBankDetails], ["Supplier invoice", supplierLink ? `${supplierLink.si.supplier} ${supplierLink.si.supplierInvoiceNo}` : null],
          ]} />
          {r.justification || r.historicalDescription ? <><H3>{r.isHistorical ? "Description" : "Justification"}</H3><P>{r.isHistorical ? r.historicalDescription : r.justification}</P></> : null}
          <H3>Line items ({r.currency})</H3>
          <Table cols={[{ label: "Description", width: "52%" }, { label: "Qty", width: "10%", num: true }, { label: "Unit cost", width: "19%", num: true }, { label: "Total", width: "19%", num: true }]}
            rows={lines.map((l) => [l.description, l.quantity, m(l.unitCost), m(l.lineTotal)])} totals={[[`Total ${r.currency}`, null, null, m(r.total)]]} />
          <H3>Approvals recorded in the portal</H3>
          {events.length ? <Table cols={[{ label: "When", width: "24%" }, { label: "Who", width: "26%" }, { label: "Action", width: "50%" }]}
            rows={events.map(({ e, who }) => [fmtDateTime(e.at), `${who}${e.actorRole ? `, ${ROLE_LABEL[e.actorRole as keyof typeof ROLE_LABEL] ?? e.actorRole}` : ""}`, `${e.action}${e.comment ? `: "${e.comment}"` : ""}`])} /> : <P small>None yet.</P>}
          <H3>Disbursement</H3>
          <Facts items={[["Method", r.disbursementMethod === "cash" ? "Cash" : r.disbursementMethod ? "Bank transfer" : null], ["Date", r.disbursedAt ? fmtDate(r.disbursedAt) : null], ["Reference", r.disbursementRef], ["Disbursed by", await userName(r.disbursedById)]]} />
          <H3>Acquittal</H3>
          <Facts items={[["Actual spent", r.acquittalActual !== null ? `${r.currency} ${m(r.acquittalActual)}` : null], ["Change returned", r.acquittalChange !== null ? `${r.currency} ${m(r.acquittalChange)}` : null]]} />
          <Signatures labels={["Requested by", "Reviewed by (CTO)", "Approved by (Finance Officer)"]} />
          <Signatures labels={["Disbursed by (Finance Clerk)", "Received by (payee)", "Acquittal checked by"]} />
        </>),
      });
    } else if (type === "invoice") {
      const inv = await getInvoice(db, ctx, id);
      if (inv.status === "draft") throw new Error("Draft invoices cannot be printed; issue the invoice first.");
      const client = await getClient(db, ctx, inv.clientId);
      const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.position));
      const banks = (await db.select().from(jvBankAccounts).where(eq(jvBankAccounts.jvId, ctx.jv.id))).filter((b) => b.currency === inv.currency);
      const st = (await invoiceSettlement(db, [id])).get(id)!;
      filename = `${inv.number}.pdf`;
      buf = await renderDoc({
        jv: ctx.jv, title: "Tax invoice", number: inv.number, subtitle: inv.fiscalInvoiceNo ? `Fiscal no. ${inv.fiscalInvoiceNo}` : undefined, verifyUrl: `${base}/invoices/${id}`,
        children: (<>
          <Facts items={[["Bill to", `${client.name}${client.address ? `\n${client.address}` : ""}`], ["Client VAT number", client.vatNo], ["Issue date", fmtDate(inv.issueDate)], ["Due date", fmtDate(inv.dueDate)], ["Currency", inv.currency], ["Fiscal invoice number", inv.fiscalInvoiceNo]]} />
          <H3>Details</H3>
          <Table cols={[{ label: "Description", width: "44%" }, { label: "Qty", width: "8%", num: true }, { label: "Unit price", width: "15%", num: true }, { label: "VAT", width: "9%", num: true }, { label: "Net", width: "12%", num: true }, { label: "VAT amount", width: "12%", num: true }]}
            rows={lines.map((l) => [l.description, l.quantity, m(l.unitPrice), `${(l.vatRateBp / 100).toFixed(1)}%`, m(l.lineNet), m(l.lineVat)])}
            totals={[["Subtotal", null, null, null, m(inv.subtotal), m(inv.vatTotal)], [`Total due ${inv.currency}`, null, null, null, null, m(inv.total)]]} />
          {st.paid + st.credited > 0 ? <P small>Paid {inv.currency} {m(st.paid)}; credited {m(st.credited)}; balance {m(inv.total - st.paid - st.credited)}.</P> : null}
          {inv.notes ? <><H3>Notes</H3><P>{inv.notes}</P></> : null}
          {banks.length ? <><H3>Pay to</H3>{banks.map((b) => <Box key={b.id}><P>{b.bank} ({b.currency})</P><P>{b.accountName}</P><P>{b.details}</P></Box>)}</> : null}
        </>),
      });
    } else if (type === "receipt") {
      const rc = await getReceipt(db, ctx, id);
      const client = await getClient(db, ctx, rc.clientId);
      const allocs = await db.select({ a: receiptAllocations, inv: invoices }).from(receiptAllocations).innerJoin(invoices, eq(invoices.id, receiptAllocations.invoiceId)).where(eq(receiptAllocations.receiptId, id));
      filename = `${rc.number}.pdf`;
      buf = await renderDoc({
        jv: ctx.jv, title: "Receipt", number: rc.number, verifyUrl: `${base}/receipts/${id}`,
        children: (<>
          <Facts items={[["Received from", client.name], ["Date received", fmtDate(rc.receivedDate)], ["Amount", `${rc.currency} ${m(rc.amount)}`], ["Method", RECEIPT_METHODS[rc.method]], ["Bank reference", rc.bankRef], ["Recorded by", await userName(rc.recordedById)]]} />
          <Box><P>{amountInWords(rc.amount, rc.currency)}</P></Box>
          <H3>Applied to</H3>
          {allocs.length ? <Table cols={[{ label: "Invoice", width: "60%" }, { label: "Amount", width: "40%", num: true }]} rows={allocs.map(({ a, inv }) => [inv.number + (inv.externalNumber ? ` (${inv.sourceSystem} ${inv.externalNumber})` : ""), m(a.amount)])}
            totals={[["Unallocated credit", m(rc.amount - allocs.reduce((s, x) => s + x.a.amount, 0))]]} /> : <P small>Held as client credit.</P>}
          <Signatures labels={["Received by (Finance Clerk)", "Checked by"]} />
        </>),
      });
    } else if (type === "loan-statement") {
      if (!can(ctx, "view_finance")) throw new Error("No access");
      const currency = ctx.jv.currencies.includes(url.searchParams.get("currency") ?? "") ? url.searchParams.get("currency")! : ctx.jv.currencies[0];
      const from = url.searchParams.get("from") || undefined, to = url.searchParams.get("to") || undefined;
      const s0 = await statement(db, ctx.jv.id, currency, from, to);
      filename = `loan-statement-${ctx.jv.code}-${currency}-${todayIso()}.pdf`;
      buf = await renderDoc({
        jv: ctx.jv, title: `Loan statement, ${currency}`, number: `${from ? fmtDate(from) : "Start"} to ${to ? fmtDate(to) : fmtDate(todayIso())}`, verifyUrl: `${base}/ledger?currency=${currency}`,
        subtitle: `Owed to ${ctx.jv.fundingPartner}, interest free`, landscape: true,
        children: (<>
          <Table cols={[{ label: "Date", width: "10%" }, { label: "Reference", width: "14%" }, { label: "Entry", width: "13%" }, { label: "Description", width: "27%" }, { label: "Drawdown", width: "9%", num: true }, { label: "Offset", width: "9%", num: true }, { label: "Loan balance", width: "9%", num: true }, { label: "Income held", width: "9%", num: true }]}
            rows={[
              ...(from ? [[fmtDate(from), "", "Brought forward", "", "", "", m(s0.openingLoan), m(s0.openingIncome)]] : []),
              ...s0.lines.map((e) => [fmtDate(e.entryDate), e.reference, ENTRY_LABEL[e.type] + (e.priorPeriodAdjustment ? " (prior period)" : ""), e.description, e.loanDelta > 0 ? m(e.loanDelta) : "", e.loanDelta < 0 ? m(-e.loanDelta) : "", m(e.loanBalance), m(e.incomeBalance)]),
            ]}
            totals={[[`Closing ${currency}`, null, null, null, null, null, m(s0.closingLoan), m(s0.closingIncome)]]} />
          <P small>Net position (loan less income held): {currency} {m(s0.closingLoan - s0.closingIncome)}. Balances in other currencies are reported on their own statements.</P>
          <Signatures labels={[`For ${ctx.jv.fundingPartner}`, "For Earldeign Investments", "Date"]} />
        </>),
      });
    } else if (type === "client-statement") {
      if (!can(ctx, "view_finance")) throw new Error("No access");
      const client = await getClient(db, ctx, id);
      const rows = await clientStatement(db, ctx, id);
      const cns = await db.select().from(creditNotes).where(eq(creditNotes.jvId, ctx.jv.id));
      void cns; void clients;
      filename = `statement-${client.name.replace(/\W+/g, "-")}-${todayIso()}.pdf`;
      const ccys = [...new Set(rows.map((r) => r.inv.currency))];
      buf = await renderDoc({
        jv: ctx.jv, title: "Statement of account", number: client.name, subtitle: `As at ${fmtDate(todayIso())}`, verifyUrl: `${base}/clients/${id}`,
        children: (<>{ccys.map((c) => {
          const rs = rows.filter((r) => r.inv.currency === c);
          return (<><H3>{c}</H3><Table cols={[{ label: "Invoice", width: "20%" }, { label: "Date", width: "14%" }, { label: "Due", width: "14%" }, { label: "Total", width: "13%", num: true }, { label: "Paid", width: "13%", num: true }, { label: "Credited", width: "13%", num: true }, { label: "Outstanding", width: "13%", num: true }]}
            rows={rs.map((r) => [r.inv.number, fmtDate(r.inv.issueDate), fmtDate(r.inv.dueDate), m(r.inv.total), m(r.paid), m(r.credited), m(r.outstanding)])}
            totals={[[`Outstanding ${c}`, null, null, null, null, null, m(rs.reduce((x, r) => x + r.outstanding, 0))]]} /></>);
        })}</>),
      });
    } else if (type === "opening-balance") {
      const rep = await openingBalanceReport(db, ctx);
      filename = `opening-balance-${ctx.jv.code}.pdf`;
      buf = await renderDoc({
        jv: ctx.jv, title: "Opening balance report", number: "Historical entries from the manual cash recon", verifyUrl: `${base}/import`, landscape: true,
        children: (<>
          {Object.entries(rep.byCurrency).map(([c, total]) => (<>
            <H3>{c} by category</H3>
            <Table cols={[{ label: "Category", width: "70%" }, { label: "Amount", width: "30%", num: true }]} rows={Object.entries(rep.byCategory[c]).sort().map(([k, v]) => [k, m(v)])} totals={[[`Total ${c}`, m(total)]]} />
          </>))}
          <H3>Entries</H3>
          <Table cols={[{ label: "Ref", width: "11%" }, { label: "Date", width: "9%" }, { label: "Payee", width: "11%" }, { label: "End supplier", width: "11%" }, { label: "Description", width: "22%" }, { label: "Category", width: "13%" }, { label: "Flags", width: "13%" }, { label: "Amount", width: "10%", num: true }]}
            rows={rep.rows.map(({ r, category }) => [r.number, fmtDate(r.historicalDate), r.payee, r.endSupplier ?? "", r.historicalDescription ?? "", category ?? "", r.reviewFlags ?? "", `${r.currency} ${m(r.total)}`])} />
          <Signatures labels={["Prepared by", "Checked by", "Checked by", "CEO"]} />
        </>),
      });
    } else return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    const msg = (e as Error).message;
    return new Response(/not found|permission|No access/i.test(msg) ? "Not found" : msg, { status: /not found|permission|No access/i.test(msg) ? 404 : 400 });
  }
}
