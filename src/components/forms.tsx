"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { IconError } from "./icons";

export type FormState = { error?: string; ok?: string } | undefined;
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function ActionForm({ action, children, className, encType }: { action: Action; children: ReactNode; className?: string; encType?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "form"} encType={encType} noValidate>
      {state?.error ? (
        <div className="notice error" role="alert">
          <IconError size={18} />
          <div className="body"><strong>This could not be saved. </strong>{state.error}</div>
        </div>
      ) : null}
      {state?.ok ? <div className="notice success" role="status"><div className="body">{state.ok}</div></div> : null}
      {children}
    </form>
  );
}

export function Submit({ children, variant = "primary", name, value, confirm, small }: {
  children: ReactNode; variant?: "primary" | "secondary" | "tertiary" | "destructive"; name?: string; value?: string; confirm?: string; small?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit" disabled={pending}
      className={`btn btn-${variant}${small ? " btn-sm" : ""}`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) { e.preventDefault(); return; }
        // Carry the clicked button's value in a hidden field: the submitter's own name/value
        // is not reliably included by form actions, and several buttons share one form.
        const form = e.currentTarget.form;
        if (form && name) {
          let input = form.querySelector<HTMLInputElement>(`input[type=hidden][data-submitter="${name}"]`);
          if (!input) {
            input = document.createElement("input");
            input.type = "hidden"; input.name = name; input.dataset.submitter = name;
            form.appendChild(input);
          }
          input.value = value ?? "";
        }
      }}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

function fmt(v: string) {
  const raw = v.replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(raw)) return v;
  const [w, f = ""] = raw.split(".");
  return `${Number(w).toLocaleString("en-US")}.${(f + "00").slice(0, 2)}`;
}

/** Amount field: right-aligned, currency code inside the field, formats on blur. */
export function AmountInput({ name, currency, defaultValue, required, id, ariaLabel }: { name: string; currency?: string; defaultValue?: string; required?: boolean; id?: string; ariaLabel?: string }) {
  const [v, setV] = useState(defaultValue ? fmt(defaultValue) : "");
  return (
    <div className="amount">
      <span className="code">{currency ?? ""}</span>
      <input id={id} name={name} inputMode="decimal" autoComplete="off" value={v} required={required} aria-label={ariaLabel}
        onChange={(e) => setV(e.target.value)} onBlur={() => setV(fmt(v))} />
    </div>
  );
}

export function CurrencyAmount({ currencies, labels, currencyName, amountName, defaultCurrency, defaultAmount, currencyLabel = "Currency", amountLabel = "Amount" }: {
  currencies: string[]; labels: Record<string, string>; currencyName: string; amountName: string; defaultCurrency?: string; defaultAmount?: string; currencyLabel?: string; amountLabel?: string;
}) {
  const [c, setC] = useState(defaultCurrency ?? currencies[0]);
  return (
    <div className="form-row">
      <div className="field">
        <label htmlFor={currencyName}>{currencyLabel}</label>
        <select id={currencyName} name={currencyName} value={c} onChange={(e) => setC(e.target.value)}>
          {currencies.map((x) => <option key={x} value={x}>{labels[x] ?? x}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={amountName}>{amountLabel}</label>
        <AmountInput id={amountName} name={amountName} currency={c} defaultValue={defaultAmount} />
      </div>
    </div>
  );
}

type ReqLine = { description: string; quantity: string; unitCost: string };

/** Requisition line items with currency selector; posts line_desc[], line_qty[], line_unit[]. */
export function RequisitionLines({ currencies, labels, defaultCurrency, defaultLines }: { currencies: string[]; labels: Record<string, string>; defaultCurrency?: string; defaultLines?: ReqLine[] }) {
  const [currency, setCurrency] = useState(defaultCurrency ?? currencies[0]);
  const [lines, setLines] = useState<ReqLine[]>(defaultLines?.length ? defaultLines : [{ description: "", quantity: "1", unitCost: "" }]);
  const total = lines.reduce((s, l) => {
    const q = Number(l.quantity || "1");
    const u = Number(l.unitCost.replace(/,/g, ""));
    return s + (Number.isFinite(q * u) ? Math.round(q * u * 100) : 0);
  }, 0);
  const set = (i: number, k: keyof ReqLine, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div className="form">
      <div className="form-row">
        <div className="field">
          <label htmlFor="currency">Currency</label>
          <select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => <option key={c} value={c}>{labels[c] ?? c}</option>)}
          </select>
        </div>
        <div />
      </div>
      <table className="lines">
        <thead><tr><th style={{ width: "55%" }}>Description</th><th style={{ width: 90 }}>Quantity</th><th>Unit cost</th><th className="num">Line total</th><th /></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const lt = Math.round(Number(l.quantity || "1") * Number(l.unitCost.replace(/,/g, "")) * 100);
            return (
              <tr key={i}>
                <td><input name="line_desc" aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => set(i, "description", e.target.value)} /></td>
                <td><input name="line_qty" aria-label={`Line ${i + 1} quantity`} inputMode="decimal" value={l.quantity} onChange={(e) => set(i, "quantity", e.target.value)} /></td>
                <td>
                  <div className="amount"><span className="code">{currency}</span>
                    <input name="line_unit" aria-label={`Line ${i + 1} unit cost`} inputMode="decimal" value={l.unitCost} onChange={(e) => set(i, "unitCost", e.target.value)} onBlur={() => set(i, "unitCost", fmt(l.unitCost))} />
                  </div>
                </td>
                <td className="num" style={{ paddingTop: 12 }}>{Number.isFinite(lt) ? (lt / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–"}</td>
                <td>{lines.length > 1 ? <button type="button" className="btn btn-tertiary btn-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button> : null}</td>
              </tr>
            );
          })}
          <tr className="total"><td colSpan={3} style={{ paddingTop: 8 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines([...lines, { description: "", quantity: "1", unitCost: "" }])}>Add line</button></td>
            <td className="num" style={{ fontWeight: 600, paddingTop: 16 }}>{currency} {(total / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td /></tr>
        </tbody>
      </table>
    </div>
  );
}

type InvLine = { description: string; quantity: string; unitPrice: string; vat: string };

export function InvoiceLines({ currencies, labels, defaultCurrency, vatRateBp, defaultLines }: { currencies: string[]; labels: Record<string, string>; defaultCurrency?: string; vatRateBp: number; defaultLines?: InvLine[] }) {
  const [currency, setCurrency] = useState(defaultCurrency ?? currencies[0]);
  const blank = { description: "", quantity: "1", unitPrice: "", vat: String(vatRateBp) };
  const [lines, setLines] = useState<InvLine[]>(defaultLines?.length ? defaultLines : [blank]);
  const set = (i: number, k: keyof InvLine, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const calc = (l: InvLine) => {
    const net = Math.round(Number(l.quantity || "1") * Number(l.unitPrice.replace(/,/g, "")) * 100);
    const vat = Math.round((net * Number(l.vat)) / 10000);
    return { net: Number.isFinite(net) ? net : 0, vat: Number.isFinite(vat) ? vat : 0 };
  };
  const totals = lines.reduce((s, l) => { const c = calc(l); return { net: s.net + c.net, vat: s.vat + c.vat }; }, { net: 0, vat: 0 });
  const f = (m: number) => (m / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="form">
      <div className="form-row">
        <div className="field">
          <label htmlFor="currency">Currency</label>
          <select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => <option key={c} value={c}>{labels[c] ?? c}</option>)}
          </select>
        </div>
        <div />
      </div>
      <table className="lines">
        <thead><tr><th style={{ width: "45%" }}>Description</th><th style={{ width: 80 }}>Quantity</th><th>Unit price</th><th style={{ width: 150 }}>VAT</th><th className="num">Net</th><th /></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><input name="line_desc" aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => set(i, "description", e.target.value)} /></td>
              <td><input name="line_qty" aria-label={`Line ${i + 1} quantity`} inputMode="decimal" value={l.quantity} onChange={(e) => set(i, "quantity", e.target.value)} /></td>
              <td><div className="amount"><span className="code">{currency}</span><input name="line_unit" aria-label={`Line ${i + 1} unit price`} inputMode="decimal" value={l.unitPrice} onChange={(e) => set(i, "unitPrice", e.target.value)} onBlur={() => set(i, "unitPrice", fmt(l.unitPrice))} /></div></td>
              <td>
                <select name="line_vat" aria-label={`Line ${i + 1} VAT`} value={l.vat} onChange={(e) => set(i, "vat", e.target.value)}>
                  <option value={String(vatRateBp)}>Standard {(vatRateBp / 100).toFixed(vatRateBp % 100 ? 1 : 0)}%</option>
                  <option value="0">Zero-rated / exempt</option>
                </select>
              </td>
              <td className="num" style={{ paddingTop: 12 }}>{f(calc(l).net)}</td>
              <td>{lines.length > 1 ? <button type="button" className="btn btn-tertiary btn-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button> : null}</td>
            </tr>
          ))}
          <tr><td colSpan={6}><button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines([...lines, blank])}>Add line</button></td></tr>
          <tr className="total"><td colSpan={4} style={{ paddingTop: 8 }}>Subtotal</td><td className="num" style={{ paddingTop: 8 }}>{f(totals.net)}</td><td /></tr>
          <tr><td colSpan={4}>VAT</td><td className="num">{f(totals.vat)}</td><td /></tr>
          <tr className="grand"><td colSpan={4}>Total</td><td className="num">{currency} {f(totals.net + totals.vat)}</td><td /></tr>
        </tbody>
      </table>
    </div>
  );
}

type SupLine = { projectId: string; description: string; amount: string };

export function SupplierLines({ projects, currency, defaultLines, currencies, labels, withCurrency }: { projects: { id: string; name: string }[]; currency?: string; defaultLines?: SupLine[]; currencies?: string[]; labels?: Record<string, string>; withCurrency?: boolean }) {
  const [ccy, setCcy] = useState(currency ?? currencies?.[0] ?? "");
  const blank = { projectId: projects[0]?.id ?? "", description: "", amount: "" };
  const [lines, setLines] = useState<SupLine[]>(defaultLines?.length ? defaultLines : [blank]);
  const set = (i: number, k: keyof SupLine, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = lines.reduce((s, l) => s + (Math.round(Number(l.amount.replace(/,/g, "")) * 100) || 0), 0);
  return (
    <div className="form">
      {withCurrency && currencies ? (
        <div className="form-row">
          <div className="field"><label htmlFor="currency">Currency</label>
            <select id="currency" name="currency" value={ccy} onChange={(e) => setCcy(e.target.value)}>{currencies.map((c) => <option key={c} value={c}>{labels?.[c] ?? c}</option>)}</select>
          </div><div />
        </div>
      ) : null}
      <table className="lines">
        <thead><tr><th style={{ width: 220 }}>Project</th><th>Description</th><th style={{ width: 200 }}>Amount</th><th /></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><select name="sl_project" aria-label={`Line ${i + 1} project`} value={l.projectId} onChange={(e) => set(i, "projectId", e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
              <td><input name="sl_desc" aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => set(i, "description", e.target.value)} /></td>
              <td><div className="amount"><span className="code">{ccy}</span><input name="sl_amount" aria-label={`Line ${i + 1} amount`} inputMode="decimal" value={l.amount} onChange={(e) => set(i, "amount", e.target.value)} onBlur={() => set(i, "amount", fmt(l.amount))} /></div></td>
              <td>{lines.length > 1 ? <button type="button" className="btn btn-tertiary btn-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button> : null}</td>
            </tr>
          ))}
          <tr className="total"><td colSpan={2} style={{ paddingTop: 8 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines([...lines, blank])}>Add line</button></td>
            <td className="num" style={{ paddingTop: 16, fontWeight: 600 }}>{ccy} {(total / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td /></tr>
        </tbody>
      </table>
    </div>
  );
}

export function JvSwitcher({ current, jvs }: { current: string; jvs: { code: string; name: string }[] }) {
  if (jvs.length < 2) return null;
  return (
    <select aria-label="Switch joint venture" value={current} onChange={(e) => { window.location.href = `/j/${e.target.value}`; }}>
      {jvs.map((j) => <option key={j.code} value={j.code}>{j.name}</option>)}
    </select>
  );
}
