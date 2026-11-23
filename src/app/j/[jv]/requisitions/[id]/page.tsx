import Link from "next/link";
import { notFound } from "next/navigation";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { can, ROLE_LABEL } from "@/lib/access";
import { addDays, fmtDate, todayIso } from "@/lib/dates";
import { formatMinor, minorToInput } from "@/lib/money";
import { categoriesOf, eventsOf, projectsOf, userName } from "@/lib/lookups";
import { entriesForSources, ENTRY_LABEL } from "@/lib/ledger";
import { POSTED_STATUSES, REQ_STATUS_LABEL, requisitionDetail } from "@/services/requisitions";
import { listAttachments } from "@/services/attachments";
import { pendingChangeFor } from "@/services/changes";
import { requisitionStepAction } from "../../actions";
import { ActionForm, AmountInput, Submit } from "@/components/forms";
import { Attachments, Hidden, Timeline } from "@/components/doc-parts";
import { Facts, Money, Notice, PageHead, Panel, Status } from "@/components/ui";

export default async function RequisitionPage({ params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const ctx = await requireJv(jv);
  const d = await requisitionDetail(db, ctx, id).catch(() => null);
  if (!d) notFound();
  const { r, lines, supplierLink } = d;
  const base = `/j/${jv}`;
  const projects = await projectsOf(ctx, false);
  const cats = await categoriesOf(ctx, false);
  const events = await eventsOf(ctx, "requisition", id);
  const files = await listAttachments(db, ctx, "requisition", id);
  const entries = can(ctx, "view_finance") ? await entriesForSources(db, "requisition", [id]) : [];
  const pending = await pendingChangeFor(db, "requisition", id);
  const mine = r.requesterId === ctx.userId;
  const posted = r.isHistorical || POSTED_STATUSES.includes(r.status);
  const step = (name: string) => <Hidden jv={jv} id={id} />;

  return (
    <>
      <PageHead title={r.number} crumbs={<Link href={`${base}/requisitions`}>Requisitions</Link>}
        context={<>{ctx.jv.name} · {r.currency} · <Status status={r.isHistorical ? "historical" : r.status} label={r.isHistorical ? "Historical entry (imported)" : REQ_STATUS_LABEL[r.status]} /></>}
        actions={<>
          <a className="btn btn-secondary" href={`/api/pdf/${jv}/requisition/${id}`} target="_blank" rel="noopener">Print PDF</a>
          {mine && ["draft", "returned"].includes(r.status) ? <Link className="btn btn-secondary" href={`${base}/requisitions/${id}/edit`}>Edit</Link> : null}
          {posted && can(ctx, "propose_change") && !pending ? <Link className="btn btn-secondary" href={`${base}/changes/new?type=requisition&id=${id}`}>Propose a change</Link> : null}
        </>} />

      {pending ? <Notice kind="warning" title={`Change pending: ${pending.number}`}>A proposed change to this requisition is waiting for authorisation. Balances do not change until it is authorised. <Link href={`${base}/changes/${pending.id}`}>View the change request</Link>.</Notice> : null}
      {r.reviewFlags ? <Notice kind="warning" title="Review flags from the manual recon">{r.reviewFlags}</Notice> : null}

      {/* -------- workflow actions -------- */}
      {mine && ["draft", "returned"].includes(r.status) ? (
        <Panel title={r.status === "returned" ? "Returned for correction" : "Draft"}>
          <p>{r.status === "returned" ? "Edit the requisition to address the comments below, then resubmit." : "This requisition has not been submitted yet."}</p>
          <ActionForm action={requisitionStepAction}>{step("submit")}<input type="hidden" name="step" value="submit" />
            <div className="form-actions"><Submit>Submit for {r.requesterRole === "project_coordinator" ? "CTO review" : "finance approval"}</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}

      {r.status === "cto_review" && can(ctx, "cto_review") && !mine ? (
        <Panel title="CTO review">
          <ActionForm action={requisitionStepAction}>{step("cto")}<input type="hidden" name="step" value="cto" />
            <div className="field"><label htmlFor="comment">Comment</label><textarea id="comment" name="comment" /><span className="hint">Required when returning or rejecting.</span></div>
            <div className="form-actions"><Submit name="decision" value="approve">Forward to finance</Submit><Submit variant="secondary" name="decision" value="return">Return for correction</Submit><Submit variant="destructive" name="decision" value="reject" confirm="Reject this requisition? This cannot be undone.">Reject</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}

      {r.status === "finance_review" && can(ctx, "finance_review") && !mine ? (
        <Panel title="Finance approval">
          <ActionForm action={requisitionStepAction}>{step("finance")}<input type="hidden" name="step" value="finance" />
            <div className="field"><span className="label">Pay from</span>
              <div className="radio-cards">
                <label><input type="radio" name="payFrom" value="funding_partner" defaultChecked={r.payFrom === "funding_partner"} /><span><strong>{ctx.jv.fundingPartner}</strong><br /><span className="small muted">Increases the loan by {r.currency} {formatMinor(r.total)}.</span></span></label>
                <label><input type="radio" name="payFrom" value="jv_income" defaultChecked={r.payFrom === "jv_income"} /><span><strong>JV income held</strong><br /><span className="small muted">Uses income already received; the loan does not change overall.</span></span></label>
              </div>
            </div>
            <div className="field"><label htmlFor="comment">Comment</label><textarea id="comment" name="comment" /><span className="hint">Required when returning or rejecting.</span></div>
            <div className="form-actions"><Submit name="decision" value="approve">Approve</Submit><Submit variant="secondary" name="decision" value="return">Return for correction</Submit><Submit variant="destructive" name="decision" value="reject" confirm="Reject this requisition? This cannot be undone.">Reject</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}

      {r.status === "approved" && can(ctx, "disburse") ? (
        r.approvedById === ctx.userId || mine ? <Notice>You approved or raised this requisition, so another Finance Clerk must disburse it.</Notice> : (
          <Panel title="Disburse funds">
            <ActionForm action={requisitionStepAction}>{step("disburse")}<input type="hidden" name="step" value="disburse" />
              <div className="form-row">
                <div className="field"><label htmlFor="method">Method</label><select id="method" name="method" defaultValue={r.paymentMethod}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option></select></div>
                <div className="field"><label htmlFor="date">Date paid</label><input id="date" type="date" name="date" defaultValue={todayIso()} max={todayIso()} /></div>
                <div className="field"><label htmlFor="reference">Bank or cash reference</label><input id="reference" name="reference" /><span className="hint">Required for bank transfers.</span></div>
              </div>
              <div className="field"><label htmlFor="pop">Proof of payment</label><input id="pop" type="file" name="pop" accept=".pdf,.jpg,.jpeg,.png" /></div>
              <div className="form-actions"><Submit confirm={`Record disbursement of ${r.currency} ${formatMinor(r.total)} to ${r.payee}? This posts to the loan book.`}>Record disbursement of {r.currency} {formatMinor(r.total)}</Submit></div>
            </ActionForm>
          </Panel>
        )
      ) : null}

      {r.status === "acquittal_pending" && !r.acquittalSubmittedAt && (mine || can(ctx, "disburse")) ? (
        <Panel title="Acquittal">
          <p className="small muted">Due by {fmtDate(addDays(r.disbursedAt!, ctx.jv.acquittalDays))}. Upload the supplier receipts and state what was actually spent. Return any change to finance.</p>
          <ActionForm action={requisitionStepAction}>{step("acquit")}<input type="hidden" name="step" value="acquit" />
            <div className="form-row">
              <div className="field"><label htmlFor="actual">Actual amount spent</label><AmountInput id="actual" name="actual" currency={r.currency} defaultValue={minorToInput(r.total)} /><span className="hint">The difference from {formatMinor(r.total)} is recorded as change returned.</span></div>
              <div className="field"><label htmlFor="receipts">Receipts and invoices</label><input id="receipts" type="file" name="receipts" multiple accept=".pdf,.jpg,.jpeg,.png" /></div>
            </div>
            <div className="field"><label htmlFor="note">Note</label><textarea id="note" name="note" /></div>
            <div className="form-actions"><Submit>Submit acquittal</Submit><Link className="btn btn-tertiary" href={`${base}/requisitions/new?parent=${id}`}>Spent more? Raise a supplementary requisition</Link></div>
          </ActionForm>
        </Panel>
      ) : null}

      {r.status === "acquittal_pending" && r.acquittalSubmittedAt && can(ctx, "approve_acquittal") && !mine ? (
        <Panel title="Approve acquittal">
          <p>Spent {r.currency} {formatMinor(r.acquittalActual ?? 0)}; change returned {formatMinor(r.acquittalChange ?? 0)}. Check the receipts in the files below.</p>
          <ActionForm action={requisitionStepAction}>{step("acq")}<input type="hidden" name="step" value="acquittal_decision" />
            <div className="field"><label htmlFor="comment">Comment</label><textarea id="comment" name="comment" /><span className="hint">Required when returning.</span></div>
            <div className="form-actions"><Submit name="decision" value="approve">Approve and close</Submit><Submit variant="secondary" name="decision" value="return">Return acquittal</Submit></div>
          </ActionForm>
        </Panel>
      ) : null}

      {mine && ["draft", "returned", "cto_review", "finance_review"].includes(r.status) ? (
        <ActionForm action={requisitionStepAction} className="no-print">{step("cancel")}<input type="hidden" name="step" value="cancel" />
          <div className="form-actions" style={{ marginBottom: 24 }}><Submit variant="tertiary" confirm="Cancel this requisition?">Cancel this requisition</Submit></div>
        </ActionForm>
      ) : null}

      <div className="grid-2">
        <Panel title="Details">
          <Facts items={[
            ["Requested by", `${await userName(r.requesterId)} (${ROLE_LABEL[r.requesterRole]})`],
            ["Project", projects.find((p) => p.id === r.projectId)?.name],
            ["Category", cats.find((c) => c.id === r.categoryId)?.name],
            ["Payee", r.payee],
            ["End supplier", r.endSupplier],
            ["Payment method", r.paymentMethod === "cash" ? "Cash" : r.paymentMethod === "bank_transfer" ? "Bank transfer" : "Not recorded"],
            ["Payee bank details", r.payeeBankDetails ? <span className="pre">{r.payeeBankDetails}</span> : null],
            ["Funding", r.payFrom === "jv_income" ? "JV income held" : ctx.jv.fundingPartner],
            ["Urgency", r.urgency === "urgent" ? "Urgent" : "Normal"],
            ["Required by", r.requiredBy ? fmtDate(r.requiredBy) : null],
            [r.isHistorical ? "Description" : "Justification", r.isHistorical ? r.historicalDescription : r.justification],
            ["Supplier invoice", supplierLink ? <Link href={`${base}/supplier-invoices/${supplierLink.si.id}`}>{supplierLink.si.supplier} {supplierLink.si.supplierInvoiceNo}</Link> : null],
            ...(r.parentRequisitionId ? [["Supplementary to", <Link key="p" href={`${base}/requisitions/${r.parentRequisitionId}`}>Original requisition</Link>] as [string, React.ReactNode]] : []),
            ...(r.isHistorical ? [["Supporting documents", r.supportingDocs] as [string, React.ReactNode]] : []),
          ]} />
        </Panel>
        <Panel title="Payment">
          <Facts items={[
            ["Amount", <Money key="a" minor={r.total} currency={r.currency} strong />],
            [r.isHistorical ? "Historical date" : "Disbursed", fmtDate(r.isHistorical ? r.historicalDate : r.disbursedAt)],
            ["Disbursed by", await userName(r.disbursedById)],
            ["Reference", r.disbursementRef],
            ["Actual spent", r.acquittalActual !== null ? <Money key="b" minor={r.acquittalActual} currency={r.currency} /> : null],
            ["Change returned", r.acquittalChange !== null ? <Money key="c" minor={r.acquittalChange} currency={r.currency} /> : null],
          ]} />
        </Panel>
      </div>

      <Panel title="Line items" flush>
        <table className="data">
          <thead><tr><th>Description</th><th className="num">Quantity</th><th className="num">Unit cost</th><th className="num">Total</th></tr></thead>
          <tbody>
            {lines.map((l) => <tr key={l.id}><td className="wrap">{l.description}</td><td className="num">{l.quantity}</td><td className="num"><Money minor={l.unitCost} /></td><td className="num"><Money minor={l.lineTotal} /></td></tr>)}
            <tr className="grand"><td colSpan={3}>Total</td><td className="num"><Money minor={r.total} currency={r.currency} /></td></tr>
          </tbody>
        </table>
      </Panel>

      {entries.length ? (
        <Panel title="Loan book entries" flush>
          <table className="data">
            <thead><tr><th>Date</th><th>Entry</th><th>Description</th><th className="num">Loan effect</th><th className="num">Income held effect</th></tr></thead>
            <tbody>{entries.map((e) => <tr key={e.id}><td>{fmtDate(e.entryDate)}</td><td>{ENTRY_LABEL[e.type]}{e.priorPeriodAdjustment ? <span className="tag" style={{ marginLeft: 6 }}>Prior period</span> : null}</td><td className="wrap">{e.description}</td><td className="num"><Money minor={e.loanDelta} /></td><td className="num"><Money minor={e.incomeDelta} /></td></tr>)}</tbody>
          </table>
        </Panel>
      ) : null}

      <div className="grid-2">
        <Panel title="Files">
          <Attachments jv={jv} ownerType="requisition" ownerId={id} items={files} back={`${base}/requisitions/${id}`}
            canUpload={(mine || (can(ctx, "view_finance") && !ctx.roles.every((x) => x === "director" || x === "partner_viewer"))) && r.status !== "cancelled"} />
        </Panel>
        <Panel title="History"><Timeline events={events} /></Panel>
      </div>
    </>
  );
}
