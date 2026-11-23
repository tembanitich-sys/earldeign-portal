import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jvs, memberships, roleEnum, users } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/access";
import { fmtDateTime } from "@/lib/dates";
import { userAdminAction } from "../../actions";
import { ActionForm, Submit } from "@/components/forms";
import { Empty, Facts, PageHead, Panel } from "@/components/ui";

export default async function UserAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) notFound();
  const ms = await db.select({ m: memberships, jv: jvs }).from(memberships).innerJoin(jvs, eq(jvs.id, memberships.jvId)).where(eq(memberships.userId, id));
  const allJvs = await db.select().from(jvs).orderBy(asc(jvs.name));
  const h = (op: string) => <><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} /></>;
  return (
    <>
      <PageHead title={u.name} crumbs={<Link href="/admin/users">Users and roles</Link>} context={`${u.email}${u.isSuperAdmin ? " · Super Admin" : ""}${u.active ? "" : " · Deactivated"}`} />
      <div className="grid-2">
        <Panel title="Account">
          <Facts items={[["Email", u.email], ["Title", u.title], ["Two-factor", u.totpEnabled ? "On" : "Off"], ["Must change password", u.mustChangePassword ? "Yes" : "No"], ["Locked until", u.lockedUntil ? fmtDateTime(u.lockedUntil) : null], ["Created", fmtDateTime(u.createdAt)]]} />
          <ActionForm action={userAdminAction}>{h("update")}
            <div className="form-row" style={{ marginTop: 16 }}><div className="field"><label htmlFor="name">Name</label><input id="name" name="name" defaultValue={u.name} /></div><div className="field"><label htmlFor="title">Title</label><input id="title" name="title" defaultValue={u.title ?? ""} /></div></div>
            <div className="form-actions"><Submit variant="secondary">Save</Submit></div>
          </ActionForm>
        </Panel>
        <Panel title="Security">
          <ActionForm action={userAdminAction}>{h("reset")}<p className="small">Issue a new temporary password. Existing sessions are signed out.</p><div className="form-actions"><Submit variant="secondary" confirm="Reset this user's password?">Reset password</Submit></div></ActionForm>
          <ActionForm action={userAdminAction}>{h("reset2fa")}<p className="small">Lost phone: reset the password and two-factor together.</p><div className="form-actions"><Submit variant="secondary" confirm="Reset password and two-factor?">Reset password and two-factor</Submit></div></ActionForm>
          <ActionForm action={userAdminAction}>{h(u.active ? "deactivate" : "activate")}<div className="form-actions"><Submit variant={u.active ? "destructive" : "secondary"} confirm={u.active ? "Deactivate this account? They are signed out immediately." : undefined}>{u.active ? "Deactivate account" : "Reactivate account"}</Submit></div></ActionForm>
        </Panel>
      </div>
      {u.isSuperAdmin ? <Panel title="JV roles"><p>Super Admin accounts cannot hold JV roles. Create a separate account for this person&apos;s JV work.</p></Panel> : (
        <Panel title="JV roles">
          {ms.length ? <table className="data"><tbody>{ms.map(({ m, jv }) => <tr key={m.id}><td>{jv.name}</td><td>{ROLE_LABEL[m.role]}</td><td className="num"><ActionForm action={userAdminAction} className="inline-form">{h("revoke")}<input type="hidden" name="membershipId" value={m.id} /><Submit variant="tertiary" small confirm="Remove this role?">Remove</Submit></ActionForm></td></tr>)}</tbody></table> : <Empty title="No roles yet" />}
          <ActionForm action={userAdminAction}>{h("grant")}
            <div className="form-row" style={{ alignItems: "end", marginTop: 16 }}>
              <div className="field"><label htmlFor="jvId">Joint venture</label><select id="jvId" name="jvId">{allJvs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select></div>
              <div className="field"><label htmlFor="role">Role</label><select id="role" name="role">{roleEnum.enumValues.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
              <div className="field"><Submit>Give role</Submit></div>
            </div>
            <p className="small muted">Directors and Partner Viewers are read-only. Finance roles must set up two-factor at their next sign-in.</p>
          </ActionForm>
        </Panel>
      )}
    </>
  );
}
