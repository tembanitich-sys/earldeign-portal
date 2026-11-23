import type { ReactNode } from "react";

export function AuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="auth-logo" src="/brand/earldeign-compact-lockup-light.svg" alt="Earldeign Investments" width={300} height={64} />
        <div className="panel">
          <h1>{title}</h1>
          <hr className="gold-rule" />
          {intro ? <p className="muted">{intro}</p> : null}
          {children}
        </div>
        <p className="auth-foot">Earldeign Investments (Pvt) Ltd · Authorised users only. Activity is recorded.</p>
      </div>
    </main>
  );
}
