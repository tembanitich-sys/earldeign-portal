import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/session";
import { NavLink } from "@/components/nav-link";
import { logoutAction } from "@/app/login/actions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const u = await requireSuperAdmin();
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <a className="nav-logo" href="/admin">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/earldeign-compact-lockup-dark.svg" alt="Earldeign Investments" width={260} height={56} />
        </a>
        <div className="nav-jv"><div className="label-caps">Platform administration</div><div className="nav-jv-name">Super Admin</div></div>
        <NavLink href="/admin" exact>Joint ventures</NavLink>
        <NavLink href="/admin/users">Users and roles</NavLink>
        <NavLink href="/admin/audit">Audit log</NavLink>
        <div className="nav-foot">
          <div style={{ color: "var(--ei-paper)", fontWeight: 600 }}>{u.name}</div>
          <div>Super Admin (cannot transact)</div>
          <div style={{ marginTop: 8 }}><a href="/account/profile">My profile</a> · <a href="/account/password">Change password</a></div>
          <form action={logoutAction} style={{ marginTop: 8 }}><button type="submit">Sign out</button></form>
        </div>
      </nav>
      <main className="main" id="main"><div className="main-inner">{children}</div></main>
    </div>
  );
}
