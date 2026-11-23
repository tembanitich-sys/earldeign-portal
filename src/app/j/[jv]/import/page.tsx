import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { can, ROLE_LABEL } from "@/lib/access";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { listImports, openingBalanceReport, IMPORT_TEMPLATE_HEADER } from "@/services/imports";
import { decideImportAction, uploadImportAction } from "../actions";
import { ActionForm, Submit } from "@/components/forms";
import { Hidden } from "@/components/doc-parts";
import { Empty, Money, Notice, PageHead, Panel, Status } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Historical import" };

export default async function ImportPage({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const batches = await listImports(db, ctx);
  const pending = batches.find((b) => b.b.status === "pending");
  const report = await openingBalanceReport(db, ctx);
  const counterOk = (role: string) => ctx.roles.includes(role === "cto" ? "finance_officer" : "cto");
  return (
    <>
      <PageHead title="Historical import" context="Brings the manual cash recon into the loan book as itemised historical entries. One party uploads; the counter-party authorises. Corrections afterwards go through change requests."
        actions={report.rows.length ? <a className="btn btn-secondary" href={`/api/pdf/${jv}/opening-balance/x`} target="_blank" rel="noopener">Opening balance report PDF</a> : null} />
      {pending ? (
        <Panel title={`Waiting for authorisation: ${pending.b.filename}`}>
          <p>Uploaded by {pending.uploader} ({ROLE_LABEL[pending.b.uploadedRole]}) on {fmtDateTime(pending.b.uploadedAt)}. {pending.b.rows.length} rows: {Object.entries(pending.b.totals).map(([c, v]) => `${c} ${(v / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`).join(", ")}. Nothing is in the loan book until it is authorised.</p>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: "auto", marginBottom: 16 }}><table className="data">
            <thead><tr><th>Ref</th><th>Date</th><th>Payee</th><th>Description</th><th>Category</th><th>Flags</th><th className="num">Amount</th></tr></thead>
            <tbody>{pending.b.rows.map((r) => <tr key={r.entryRef}><td>{r.entryRef}</td><td>{fmtDate(r.date)}</td><td>{r.payee}</td><td className="wrap">{r.description}</td><td>{r.category}</td><td className="wrap small muted">{r.reviewFlags}</td><td className="num"><Money minor={r.amount} currency={r.currency} /></td></tr>)}</tbody>
          </table></div>
          {pending.b.uploadedById !== ctx.userId && counterOk(pending.b.uploadedRole) ? (
            <ActionForm action={decideImportAction}><Hidden jv={jv} id={pending.b.id} />
              <div className="field"><label htmlFor="comment">Comment</label><textarea id="comment" name="comment" /><span className="hint">Required when declining.</span></div>
              <div className="form-actions"><Submit name="decision" value="authorise" confirm="Authorise the import? All rows post to the loan book as historical entries.">Authorise import</Submit><Submit variant="secondary" name="decision" value="decline">Decline</Submit></div>
            </ActionForm>
          ) : <Notice>The {pending.b.uploadedRole === "cto" ? "Finance Officer" : "CTO"} must authorise this import.</Notice>}
        </Panel>
      ) : can(ctx, "import_history") ? (
        <Panel title="Upload the historical CSV">
          <p className="small muted">Columns: <code>{IMPORT_TEMPLATE_HEADER}</code>. Dates as YYYY-MM-DD. Categories and projects must exist in the JV settings. pay_from is &ldquo;{ctx.jv.fundingPartner}&rdquo; or &ldquo;JV income&rdquo;.</p>
          <ActionForm action={uploadImportAction}><Hidden jv={jv} />
            <div className="field"><label htmlFor="file">CSV file</label><input id="file" type="file" name="file" accept=".csv,text/csv" /></div>
            <div className="form-actions"><Submit>Check and upload</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}
      <Panel title="Opening position from historical entries">
        {report.rows.length ? (
          <>
            {Object.entries(report.byCurrency).map(([c, v]) => (
              <table className="data" key={c} style={{ marginBottom: 16 }}><thead><tr><th>Category ({c})</th><th className="num">Amount</th></tr></thead>
                <tbody>{Object.entries(report.byCategory[c]).sort().map(([cat, amt]) => <tr key={cat}><td>{cat}</td><td className="num"><Money minor={amt} /></td></tr>)}
                  <tr className="grand"><td>Total {c}</td><td className="num"><Money minor={v} currency={c} /></td></tr></tbody></table>
            ))}
            <p className="small">{report.flagged.length} of {report.rows.length} historical entries carry review flags or missing documents. <Link href={`/j/${jv}/requisitions?status=historical`}>Review them</Link>.</p>
          </>
        ) : <Empty title="No historical entries yet" />}
      </Panel>
      <Panel title="Import history" flush>
        {batches.length ? <table className="data"><thead><tr><th>File</th><th>Uploaded</th><th>By</th><th>Rows</th><th>Status</th><th>Comment</th></tr></thead>
          <tbody>{batches.map(({ b, uploader }) => <tr key={b.id}><td>{b.filename}</td><td>{fmtDateTime(b.uploadedAt)}</td><td>{uploader}</td><td className="num">{b.rows.length}</td><td><Status status={b.status} label={b.status === "pending" ? "Pending authorisation" : b.status === "authorised" ? "Authorised" : "Declined"} /></td><td className="wrap">{b.decisionComment}</td></tr>)}</tbody></table>
          : <Empty title="No imports yet" />}
      </Panel>
    </>
  );
}
