import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { ROLE_LABEL } from "@/lib/access";
import { fmtDateTime } from "@/lib/dates";
import { listChanges, TARGET_LABEL, FIELD_LABEL, type TargetType } from "@/services/changes";
import { Empty, PageHead, Panel, Status } from "@/components/ui";

export const metadata = { title: "Change requests" };
const ST: Record<string, string> = { pending: "Pending authorisation", authorised: "Authorised", declined: "Declined", cancelled: "Cancelled" };

export default async function Changes({ params, searchParams }: { params: Promise<{ jv: string }>; searchParams: Promise<{ status?: string }> }) {
  const { jv } = await params;
  const { status = "pending" } = await searchParams;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const rows = await listChanges(db, ctx, status || undefined);
  return (
    <>
      <PageHead title="Change requests" context="Posted records change only when both the CTO and the Finance Officer agree: one proposes, the other authorises. Nothing changes while a request is pending." />
      <nav className="tabs" aria-label="Filter">{[["pending", "Pending"], ["authorised", "Authorised"], ["declined", "Declined"], ["", "All"]].map(([k, l]) => <Link key={k} href={`?status=${k}`} aria-current={status === k ? "page" : undefined}>{l}</Link>)}</nav>
      <Panel flush>
        {rows.length ? (
          <table className="data"><thead><tr><th>Number</th><th>Record</th><th>Fields</th><th>Proposed by</th><th>When</th><th>Status</th></tr></thead>
            <tbody>{rows.map(({ cr, proposer }) => (
              <tr key={cr.id}><td><Link href={`/j/${jv}/changes/${cr.id}`}>{cr.number}</Link></td><td>{TARGET_LABEL[cr.targetType as TargetType]} {cr.targetLabel}</td>
                <td className="wrap">{Object.keys(cr.changes).map((k) => FIELD_LABEL[k] ?? k).join(", ")}</td><td>{proposer} ({ROLE_LABEL[cr.proposerRole]})</td><td>{fmtDateTime(cr.proposedAt)}</td><td><Status status={cr.status} label={ST[cr.status]} /></td></tr>
            ))}</tbody></table>
        ) : <Empty title={status === "pending" ? "No changes waiting" : "No change requests"}>To change a posted record, open it and choose Propose a change.</Empty>}
      </Panel>
    </>
  );
}
