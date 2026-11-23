import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Submit } from "@/components/forms";
import { loginAction } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <AuthShell title="Sign in" intro="Use the email address your Super Admin registered for you.">
      <ActionForm action={loginAction}>
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
        <div className="form-actions"><Submit>Sign in</Submit></div>
        <p className="small muted">Forgotten your password? Ask the Super Admin to issue a new temporary one.</p>
      </ActionForm>
    </AuthShell>
  );
}
