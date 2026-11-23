import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jvs, memberships } from "@/db/schema";
import { Empty, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Joint ventures" };

export default async function AdminHome() {
  const rows = await db.select({ jv: jvs, members: sql<string>`(select count(distinct ${memberships.userId}) from ${memberships} where ${memberships.jvId} = ${jvs.id})` }).from(jvs).orderBy(asc(jvs.name));
  void eq;
  return (
    <>
      <PageHead title="Joint ventures" context="Each JV is an independent space: its own settings, users, numbering and books. Nothing is shared between JVs." actions={<Link className="btn btn-primary" href="/admin/jvs/new">Create a JV</Link>} />
      <Panel flush>
        {rows.length ? <table className="data"><thead><tr><th>JV</th><th>Address</th><th>Prefix</th><th>Front-facing company</th><th>Currencies</th><th className="num">Users</th></tr></thead>
          <tbody>{rows.map(({ jv, members }) => <tr key={jv.id}><td><Link href={`/admin/jvs/${jv.id}`}>{jv.name}</Link></td><td className="small">{jv.code}.{process.env.ROOT_DOMAIN ?? "earldeign.co.zw"}</td><td>{jv.shortCode}</td><td>{jv.companyName}</td><td>{jv.currencies.join(", ")}</td><td className="num">{members}</td></tr>)}</tbody></table>
          : <Empty title="No joint ventures yet">Create the first JV, then add users and give them roles.</Empty>}
      </Panel>
    </>
  );
}
