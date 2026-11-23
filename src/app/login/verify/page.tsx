import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Submit } from "@/components/forms";
import { logoutAction, verifyTotpAction } from "../actions";

export const metadata = { title: "Two-factor check" };

export default async function VerifyPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.user.totpEnabled || s.session.twoFactorPassed) redirect("/");
  return (
    <AuthShell title="Two-factor check" intro="Open your authenticator app and enter the 6-digit code for Earldeign Portal.">
      <ActionForm action={verifyTotpAction}>
        <div className="field"><label htmlFor="code">Code</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus /></div>
        <div className="form-actions"><Submit>Continue</Submit></div>
      </ActionForm>
      <form action={logoutAction}><button className="btn btn-tertiary btn-sm" type="submit">Sign out</button></form>
    </AuthShell>
  );
}
