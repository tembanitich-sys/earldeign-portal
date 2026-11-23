import { requireUser } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Submit } from "@/components/forms";
import { changePasswordAction } from "@/app/login/actions";

export const metadata = { title: "Change password" };

export default async function PasswordPage() {
  const u = await requireUser({ allowPending: true });
  return (
    <AuthShell title="Change password" intro={u.mustChangePassword ? "Choose your own password before continuing. The temporary one stops working once you do." : undefined}>
      <ActionForm action={changePasswordAction}>
        <div className="field"><label htmlFor="current">Current or temporary password</label><input id="current" name="current" type="password" autoComplete="current-password" required /></div>
        <div className="field"><label htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" required /><span className="hint">At least 12 characters, with letters and a number.</span></div>
        <div className="field"><label htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div>
        <div className="form-actions"><Submit>Save password</Submit></div>
      </ActionForm>
    </AuthShell>
  );
}
