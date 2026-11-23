import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser, userJvs } from "@/lib/session";
import { portfolio } from "@/services/reports";
import { db } from "@/db";
import { AuthShell } from "@/components/auth-shell";
import { logoutAction } from "@/app/login/actions";
import { formatMinor } from "@/lib/money";

export const metadata = { title: "Portfolio" };

export default async function Home() {
  const u = await requireUser();
  if (u.isSuperAdmin) redirect("/admin");
  const jvs = await userJvs(u.id);
  if (jvs.length === 1) redirect(`/j/${jvs[0].code}`);
  if (jvs.length === 0) {
    return (
      <AuthShell title="No joint venture assigned" intro="Your account is active but has no role in any joint venture yet. Ask the Super Admin to assign you a role.">
        <form action={logoutAction}><button className="btn btn-secondary" type="submit">Sign out</button></form>
      </AuthShell>
    );
  }
  const p = await portfolio(db, u.id);
  return (
    <AuthShell title="Your joint ventures" intro="Choose a joint venture. Balances are shown per currency and are never combined.">
      <ul className="attach-list">
        {jvs.map((j) => {
          const row = p.find((x) => x.jv.code === j.code);
          return (
            <li key={j.code}>
              <Link href={`/j/${j.code}`}><strong>{j.name}</strong></Link>
              {row ? <div className="small muted num" style={{ textAlign: "left" }}>{row.balances.map((b) => `${b.currency} loan ${formatMinor(b.loan)}`).join(" · ")}</div> : null}
            </li>
          );
        })}
      </ul>
    </AuthShell>
  );
}
