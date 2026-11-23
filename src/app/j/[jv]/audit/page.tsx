import { desc, eq } from "drizzle-orm";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";

import { fmtDateTime } from "@/lib/dates";
import { Empty, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function Audit({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const rows = await db.select({ a: auditLog, who: users.name }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).where(eq(auditLog.jvId, ctx.jv.id)).orderBy(desc(auditLog.at)).limit(300);
  return (
    <>
      <PageHead title="Audit log" context={`${ctx.jv.name} · Last 300 events. The log cannot be edited or deleted.`} />
      <Panel flush>{rows.length ? <div className="table-wrap"><table className="data"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>IP</th></tr></thead>
        <tbody>{rows.map(({ a, who }) => <tr key={a.id}><td>{fmtDateTime(a.at)}</td><td>{who ?? "System"}</td><td>{a.action}</td><td className="small">{a.entityType} {a.entityId?.slice(0, 8)}</td><td className="small muted">{a.ip}</td></tr>)}</tbody></table></div> : <Empty title="No activity yet" />}</Panel>
    </>
  );
}
