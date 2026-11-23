import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { can } from "@/lib/access";
import { clientsOf } from "@/lib/lookups";
import { Empty, PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Clients" };

export default async function Clients({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const rows = await clientsOf(ctx);
  return (
    <>
      <PageHead title="Clients" context={ctx.jv.name} actions={can(ctx, "manage_clients") ? <Link className="btn btn-primary" href={`/j/${jv}/clients/new`}>Add client</Link> : null} />
      <Panel flush>
        {rows.length ? (
          <table className="data"><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>{rows.map((c) => <tr key={c.id}><td><Link href={`/j/${jv}/clients/${c.id}`}>{c.name}</Link></td><td>{c.contactPerson}</td><td>{c.email}</td><td>{c.phone}</td></tr>)}</tbody></table>
        ) : <Empty title="No clients yet">Add a client before invoicing them or recording their payments.</Empty>}
      </Panel>
    </>
  );
}
