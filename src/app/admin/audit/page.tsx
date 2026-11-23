import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, jvs, users } from "@/db/schema";
import { fmtDateTime } from "@/lib/dates";
import { PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AdminAudit() {
  const rows = await db.select({ a: auditLog, who: users.name, jv: jvs.code }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).leftJoin(jvs, eq(jvs.id, auditLog.jvId)).orderBy(desc(auditLog.at)).limit(500);
  return (
    <>
      <PageHead title="Audit log" context="All JVs and platform events, including sign-ins and role changes. Last 500 events. Append-only." />
      <Panel flush><div className="table-wrap"><table className="data"><thead><tr><th>When</th><th>Who</th><th>JV</th><th>Action</th><th>Record</th><th>IP</th></tr></thead>
        <tbody>{rows.map(({ a, who, jv }) => <tr key={a.id}><td>{fmtDateTime(a.at)}</td><td>{who ?? "Unknown"}</td><td>{jv ?? "Platform"}</td><td>{a.action}</td><td className="small">{a.entityType} {a.entityId?.slice(0, 12)}</td><td className="small muted">{a.ip}</td></tr>)}</tbody></table></div></Panel>
    </>
  );
}
