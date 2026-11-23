import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { fmtDateTime } from "@/lib/dates";
import { markNotificationsReadAction } from "../actions";
import { Empty, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Notifications" };

export default async function Notifications({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  const rows = await db.select().from(notifications).where(and(eq(notifications.userId, ctx.userId), eq(notifications.jvId, ctx.jv.id))).orderBy(desc(notifications.createdAt)).limit(100);
  return (
    <>
      <PageHead title="Notifications" context="The same messages are emailed to you."
        actions={rows.some((r) => !r.readAt) ? <form action={markNotificationsReadAction}><input type="hidden" name="jv" value={jv} /><button className="btn btn-secondary" type="submit">Mark all as read</button></form> : null} />
      <Panel flush>{rows.length ? <table className="data"><tbody>{rows.map((n) => (
        <tr key={n.id}><td className="wrap" style={{ fontWeight: n.readAt ? 400 : 600 }}>{n.link ? <Link href={n.link}>{n.title}</Link> : n.title}{n.body ? <div className="small muted pre" style={{ fontWeight: 400 }}>{n.body}</div> : null}</td><td className="small muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(n.createdAt)}</td></tr>
      ))}</tbody></table> : <Empty title="No notifications" />}</Panel>
    </>
  );
}
