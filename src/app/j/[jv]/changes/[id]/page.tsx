import Link from "next/link";
import { notFound } from "next/navigation";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { can, ROLE_LABEL } from "@/lib/access";
import { fmtDateTime } from "@/lib/dates";
import { formatter } from "@/lib/change-format";
import { userName } from "@/lib/lookups";
import { currentValues, FIELD_LABEL, getChange, TARGET_LABEL, type TargetType } from "@/services/changes";
import { decideChangeAction } from "../../actions";
import { ActionForm, Submit } from "@/components/forms";
import { Hidden } from "@/components/doc-parts";
import { Facts, Notice, PageHead, Panel, Status } from "@/components/ui";

const PATH: Record<string, string> = { requisition: "requisitions", receipt: "receipts", invoice: "invoices", supplier_invoice: "supplier-invoices" };
const ST: Record<string, string> = { pending: "Pending authorisation", authorised: "Authorised", declined: "Declined", cancelled: "Cancelled" };

export default async function ChangePage({ params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const ctx = await requireJv(jv);
  const cr = await getChange(db, ctx, id).catch(() => null);
  if (!cr) notFound();
  const fmt = await formatter(ctx);
  const cur = await currentValues(db, ctx, cr.targetType as TargetType, cr.targetId).catch(() => null);
  const currency = String(cr.changes.currency?.from ?? cur?.values.currency ?? "");
  const counterRole = cr.proposerRole === "cto" ? "finance_officer" : "cto";
  const canDecide = cr.status === "pending" && can(ctx, "authorise_change") && ctx.roles.includes(counterRole) && cr.proposerId !== ctx.userId;
  const ledgerFields = ["date", "amount", "currency", "payFrom"].filter((f) => cr.changes[f]);
  return (
    <>
      <PageHead title={cr.number} crumbs={<Link href={`/j/${jv}/changes`}>Change requests</Link>}
        context={<>{TARGET_LABEL[cr.targetType as TargetType]} <Link href={`/j/${jv}/${PATH[cr.targetType]}/${cr.targetId}`}>{cr.targetLabel}</Link> · <Status status={cr.status} label={ST[cr.status]} /></>} />
      {cr.status === "pending" && ledgerFields.length && ["requisition", "receipt"].includes(cr.targetType) ? (
        <Notice kind="info" title="Effect on the loan book">On authorisation the existing entries for {cr.targetLabel} are reversed and new entries are posted with the new values. Both remain visible in the loan book.</Notice>
      ) : null}
      <Panel title="Proposed changes" flush>
        <table className="data diff"><thead><tr><th>Field</th><th>Current value</th><th>New value</th></tr></thead>
          <tbody>{Object.entries(cr.changes).map(([k, c]) => (
            <tr key={k}><td>{FIELD_LABEL[k] ?? k}</td><td className="wrap pre from">{fmt(k, c.from, currency)}</td><td className="wrap pre" style={{ fontWeight: 600 }}>{fmt(k, c.to, String(cr.changes.currency?.to ?? currency))}</td></tr>
          ))}</tbody></table>
      </Panel>
      <div className="grid-2">
        <Panel title="Request">
          <Facts items={[
            ["Reason", <span key="r" className="pre">{cr.reason}</span>],
            ["Proposed by", `${await userName(cr.proposerId)} (${ROLE_LABEL[cr.proposerRole]})`], ["Proposed", fmtDateTime(cr.proposedAt)],
            ["Must be decided by", ROLE_LABEL[counterRole]],
            ["Decided by", await userName(cr.deciderId)], ["Decided", cr.decidedAt ? fmtDateTime(cr.decidedAt) : null], ["Decision comment", cr.decisionComment],
          ]} />
        </Panel>
        <Panel title="Decision">
          {canDecide ? (
            <ActionForm action={decideChangeAction}><Hidden jv={jv} id={id} />
              <div className="field"><label htmlFor="comment">Comment</label><textarea id="comment" name="comment" /><span className="hint">Required when declining.</span></div>
              <div className="form-actions"><Submit name="decision" value="authorise" confirm="Authorise this change? It takes effect immediately.">Authorise change</Submit><Submit variant="secondary" name="decision" value="decline">Decline</Submit></div>
            </ActionForm>
          ) : cr.status === "pending" && cr.proposerId === ctx.userId ? (
            <ActionForm action={decideChangeAction}><Hidden jv={jv} id={id} />
              <p>Waiting for the {ROLE_LABEL[counterRole]} to decide. You cannot authorise your own change.</p>
              <div className="form-actions"><Submit variant="tertiary" name="decision" value="cancel" confirm="Withdraw this change request?">Withdraw request</Submit></div>
            </ActionForm>
          ) : cr.status === "pending" ? <p>Waiting for the {ROLE_LABEL[counterRole]} to decide.</p> : <p>This request has been decided.</p>}
        </Panel>
      </div>
    </>
  );
}
