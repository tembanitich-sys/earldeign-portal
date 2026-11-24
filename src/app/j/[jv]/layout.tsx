import type { ReactNode } from "react";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { can, ROLE_LABEL } from "@/lib/access";
import { requireJv, userJvs } from "@/lib/session";
import { NavLink } from "@/components/nav-link";
import { JvSwitcher } from "@/components/forms";
import { logoutAction } from "@/app/login/actions";

export default async function JvLayout({ children, params }: { children: ReactNode; params: Promise<{ jv: string }> }) {
  const { jv: code } = await params;
  const ctx = await requireJv(code);
  const base = `/j/${code}`;
  const fin = can(ctx, "view_finance");
  const [unread] = await db.select({ n: sql<string>`count(*)` }).from(notifications).where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt)));
  const jvs = await userJvs(ctx.userId);
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <a className="nav-brand" href={base}>
          {ctx.jv.logoKey
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/api/jv-logo/${code}?v=${encodeURIComponent(ctx.jv.logoKey.slice(-12))}`} alt={ctx.jv.companyName} />
            : <span className="nav-brand-name">{ctx.jv.companyName}</span>}
        </a>
        <div className="nav-jv">
          <div className="label-caps">Joint venture</div>
          <div className="nav-jv-name">{ctx.jv.name}</div>
          <JvSwitcher current={code} jvs={jvs} />
        </div>
        <NavLink href={base} exact>Dashboard</NavLink>
        <div className="nav-section">Spend</div>
        <NavLink href={`${base}/requisitions`}>Requisitions</NavLink>
        {fin ? <NavLink href={`${base}/supplier-invoices`}>Supplier invoices</NavLink> : null}
        {fin ? <NavLink href={`${base}/projects`}>Project costs</NavLink> : null}
        <div className="nav-section">Income</div>
        <NavLink href={`${base}/invoice-requests`}>Invoice requests</NavLink>
        {fin ? <NavLink href={`${base}/invoices`}>Invoices</NavLink> : null}
        {fin ? <NavLink href={`${base}/receipts`}>Receipts</NavLink> : null}
        {fin ? <NavLink href={`${base}/clients`}>Clients</NavLink> : null}
        {fin ? (
          <>
            <div className="nav-section">Books</div>
            <NavLink href={`${base}/ledger`}>Loan book</NavLink>
            <NavLink href={`${base}/changes`}>Change requests</NavLink>
            <NavLink href={`${base}/reports`}>Reports</NavLink>
            {can(ctx, "record_conversion") ? <NavLink href={`${base}/conversions`}>Currency conversions</NavLink> : null}
            {can(ctx, "import_history") ? <NavLink href={`${base}/import`}>Historical import</NavLink> : null}
            <NavLink href={`${base}/periods`}>Periods</NavLink>
            <NavLink href={`${base}/audit`}>Audit log</NavLink>
          </>
        ) : null}
        <div className="nav-section">You</div>
        <NavLink href={`${base}/notifications`}>Notifications{Number(unread.n) ? <span className="nav-count">{unread.n}</span> : null}</NavLink>
        <div className="nav-foot">
          <div style={{ color: "var(--ei-paper)", fontWeight: 600 }}>{ctx.userName}</div>
          <div>{ctx.roles.map((r) => ROLE_LABEL[r]).join(", ")}</div>
          <div style={{ marginTop: 8 }}><a href="/account/password">Change password</a> · <a href="/account/security">Two-factor</a></div>
          <form action={logoutAction} style={{ marginTop: 8 }}><button type="submit">Sign out</button></form>
          <div style={{ marginTop: 16, fontSize: 12, color: "rgba(250,248,243,0.55)" }}>Powered by Earldeign Investments</div>
        </div>
      </nav>
      <main className="main" id="main"><div className="main-inner">{children}</div></main>
    </div>
  );
}
