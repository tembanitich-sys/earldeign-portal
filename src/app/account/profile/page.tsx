import { requireUser, userJvs } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Submit } from "@/components/forms";
import { updateProfileAction } from "@/app/login/actions";

export const metadata = { title: "My profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ jv?: string }> }) {
  const { jv } = await searchParams;
  const u = await requireUser();
  const jvs = await userJvs(u.id);
  const back = u.isSuperAdmin ? "/admin" : jv && jvs.some((j) => j.code === jv) ? `/j/${jv}` : "/";
  const smsOn = (process.env.SMS_DRIVER ?? "off") !== "off";
  return (
    <AuthShell jv={jv} title="My profile" intro="Keep your details current so notifications reach you.">
      <ActionForm action={updateProfileAction}>
        <div className="field"><span className="label">Email (sign-in)</span><div>{u.email}</div><span className="hint">To change your sign-in email, ask the Super Admin. This protects where approvals are sent.</span></div>
        <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" defaultValue={u.name} autoComplete="name" /></div>
        <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" defaultValue={u.title ?? ""} autoComplete="organization-title" /></div>
        <div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" name="phone" inputMode="tel" defaultValue={u.phone ?? ""} placeholder="0771 234 567" autoComplete="tel" /></div>
        {smsOn ? <div className="checks"><label><input type="checkbox" name="smsEnabled" value="1" defaultChecked={u.smsEnabled} />Send me SMS alerts for items needing my action</label></div> : <input type="hidden" name="smsEnabled" value={u.smsEnabled ? "1" : "0"} />}
        <div className="form-actions"><Submit>Save</Submit><a className="btn btn-tertiary" href={back}>Back to the portal</a></div>
      </ActionForm>
    </AuthShell>
  );
}
