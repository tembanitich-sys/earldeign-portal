import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Two-factor sign-in" };

export default async function SecurityPage() {
  const u = await requireUser();
  if (!u.totpEnabled) redirect("/account/two-factor");
  return (
    <AuthShell title="Two-factor sign-in" intro="Two-factor sign-in is on for your account.">
      <p className="small">If you lose your phone, ask the Super Admin to reset two-factor for your account. You will set it up again at your next sign-in.</p>
      <a className="btn btn-secondary" href="/">Back</a>
    </AuthShell>
  );
}
