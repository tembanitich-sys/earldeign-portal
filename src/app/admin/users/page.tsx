import Link from "next/link";
import { db } from "@/db";
import { ROLE_LABEL } from "@/lib/access";
import { listUsers } from "@/services/admin";
import { asc } from "drizzle-orm";
import { jvs, roleEnum } from "@/db/schema";
import { createUserAction } from "../actions";
import { ActionForm, Submit } from "@/components/forms";
import { PageHead, Panel, Status } from "@/components/ui";

export const metadata = { title: "Users and roles" };

export default async function Users() {
  const rows = await listUsers(db);
  const allJvs = await db.select().from(jvs).orderBy(asc(jvs.name));
  return (
    <>
      <PageHead title="Users and roles" context="Roles are given per JV. A person can hold different roles in different JVs. Super Admin accounts manage the platform only and cannot hold JV roles." />
      <Panel title="Add a user">
        <ActionForm action={createUserAction}>
          <div className="form-row">
            <div className="field"><label htmlFor="name">Full name</label><input id="name" name="name" /></div>
            <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" name="email" /></div>
            <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" placeholder="e.g. Finance Officer, Earldeign Director" /></div>
            <div className="field"><label htmlFor="phone">Mobile number (for SMS alerts)</label><input id="phone" name="phone" inputMode="tel" placeholder="0771 234 567" /></div>
          </div>
          {allJvs.length ? <div className="form-row">{allJvs.map((j) => (
            <div className="field" key={j.id}><input type="hidden" name="jvIds" value={j.id} />
              <label htmlFor={`role_${j.id}`}>Role in {j.name}</label>
              <select id={`role_${j.id}`} name={`role_${j.id}`} defaultValue=""><option value="">No access</option>{roleEnum.enumValues.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            </div>
          ))}</div> : null}
          <div className="checks"><label><input type="checkbox" name="superAdmin" value="1" />Super Admin (platform administration only; cannot hold a JV role)</label></div>
          <div className="form-actions"><Submit>Create account</Submit><span className="small muted">A temporary password is shown once. One person, one role per JV.</span></div>
        </ActionForm>
      </Panel>
      <Panel flush>
        <table className="data"><thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Access</th><th>Two-factor</th><th>Status</th></tr></thead>
          <tbody>{rows.map(({ user, roles }) => (
            <tr key={user.id}><td><Link href={`/admin/users/${user.id}`}>{user.name}</Link></td><td>{user.email}</td><td>{user.phone ?? <span className="muted">{"\u2013"}</span>}</td>
              <td className="wrap small">{user.isSuperAdmin ? "Super Admin" : roles.length ? roles.map((r) => `${ROLE_LABEL[r.m.role]} (${r.jv})`).join("; ") : <span className="muted">No roles yet</span>}</td>
              <td>{user.totpEnabled ? "On" : "Off"}</td><td><Status status={user.active ? "approved" : "cancelled"} label={user.active ? "Active" : "Deactivated"} /></td></tr>
          ))}</tbody></table>
      </Panel>
    </>
  );
}
