import type { ReactNode } from "react";
import { brandFor } from "@/lib/brand";

/** Sign-in and account pages. On a JV subdomain (or with ?jv=) they carry the JV's brand; otherwise Earldeign's. */
export async function AuthShell({ title, intro, children, jv }: { title: string; intro?: ReactNode; children: ReactNode; jv?: string | null }) {
  const brand = await brandFor(jv);
  return (
    <main className="auth">
      <div className="auth-card">
        {brand.kind === "jv" ? (
          brand.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className="auth-logo jv" src={brand.logoUrl} alt={brand.companyName} />
            : <div className="auth-jv-name">{brand.companyName}</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="auth-logo" src="/brand/earldeign-compact-lockup-light.svg" alt="Earldeign Investments" width={300} height={64} />
        )}
        <div className="panel">
          <h1>{title}</h1>
          <hr className="gold-rule" />
          {intro ? <p className="muted">{intro}</p> : null}
          {children}
        </div>
        <p className="auth-foot">
          {brand.kind === "jv" ? <>{brand.name} · Portal operated by Earldeign Investments (Pvt) Ltd.</> : <>Earldeign Investments (Pvt) Ltd.</>} Authorised users only. Activity is recorded.
        </p>
      </div>
    </main>
  );
}
