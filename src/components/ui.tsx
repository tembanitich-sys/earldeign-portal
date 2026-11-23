import type { ReactNode } from "react";
import { formatMinor } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { IconAlert, IconCheck, IconClock, IconDraft, IconError, IconInfo, IconLock, IconReturn, IconX } from "./icons";

export function PageHead({ title, crumbs, context, actions }: { title: string; crumbs?: ReactNode; context?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs ? <div className="crumbs">{crumbs}</div> : null}
        <h1>{title}</h1>
        {context ? <div className="context">{context}</div> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

/** Reporting context shown at the top of every finance view: period and currencies. */
export function PeriodContext({ jvName, currencies, period }: { jvName: string; currencies: string[]; period?: string }) {
  return <>{jvName} · {period ?? `As at ${fmtDate(new Date())}`} · Currencies {currencies.join(", ")} (reported separately)</>;
}

export function Money({ minor, currency, strong }: { minor: number | null | undefined; currency?: string; strong?: boolean }) {
  if (minor === null || minor === undefined) return <span className="num" title="No value recorded">{"–"}</span>;
  const s = formatMinor(minor);
  return (
    <span className={`num${minor < 0 ? " neg" : ""}`} style={strong ? { fontWeight: 600 } : undefined}>
      {currency ? <span className="muted" style={{ marginRight: 6, fontWeight: 500 }}>{currency}</span> : null}{s}
    </span>
  );
}

type Tone = "neutral" | "positive" | "negative" | "warning";
const ICONS = { check: IconCheck, clock: IconClock, alert: IconAlert, x: IconX, draft: IconDraft, info: IconInfo, lock: IconLock, ret: IconReturn };

const STATUS: Record<string, { tone: Tone; icon: keyof typeof ICONS }> = {
  draft: { tone: "neutral", icon: "draft" },
  cto_review: { tone: "warning", icon: "clock" },
  finance_review: { tone: "warning", icon: "clock" },
  approved: { tone: "neutral", icon: "check" },
  returned: { tone: "warning", icon: "ret" },
  rejected: { tone: "negative", icon: "x" },
  cancelled: { tone: "neutral", icon: "x" },
  acquittal_pending: { tone: "warning", icon: "clock" },
  closed: { tone: "positive", icon: "lock" },
  issued: { tone: "neutral", icon: "check" },
  part_paid: { tone: "warning", icon: "clock" },
  paid: { tone: "positive", icon: "check" },
  credit_noted: { tone: "neutral", icon: "check" },
  void: { tone: "neutral", icon: "x" },
  invoiced: { tone: "positive", icon: "check" },
  pending: { tone: "warning", icon: "clock" },
  authorised: { tone: "positive", icon: "check" },
  declined: { tone: "negative", icon: "x" },
  open: { tone: "warning", icon: "clock" },
  overdue: { tone: "negative", icon: "alert" },
  disputed: { tone: "negative", icon: "alert" },
  historical: { tone: "neutral", icon: "info" },
};

export function Status({ status, label }: { status: string; label: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as Tone, icon: "info" as const };
  const I = ICONS[s.icon];
  return <span className={`status s-${s.tone}`}><I size={15} />{label}</span>;
}

export function Notice({ kind = "info", title, children }: { kind?: "info" | "error" | "warning" | "success"; title?: string; children?: ReactNode }) {
  const I = kind === "error" ? IconError : kind === "warning" ? IconAlert : kind === "success" ? IconCheck : IconInfo;
  return (
    <div className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <I size={18} />
      <div className="body">{title ? <strong>{title}{children ? ". " : ""}</strong> : null}{children}</div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children}</div>;
}

export function Panel({ title, actions, children, flush }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className={`panel${flush ? " flush" : ""}`}>
      {title || actions ? <div className="panel-head">{title ? <h2>{title}</h2> : <span />}{actions}</div> : null}
      {children}
    </section>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v === null || v === undefined || v === "" ? <span className="muted" title="Not recorded">{"–"}</span> : v}</dd>])}
    </dl>
  );
}
