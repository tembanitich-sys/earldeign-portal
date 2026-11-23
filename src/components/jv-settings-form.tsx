import { CURRENCIES, CURRENCY_LABEL } from "@/lib/money";
import type { JvRow } from "@/lib/access";

export function JvSettingsFields({ jv, creating }: { jv?: JvRow; creating?: boolean }) {
  return (
    <>
      <section className="panel"><h2>Joint venture</h2><div className="form">
        <div className="form-row">
          <div className="field"><label htmlFor="name">JV name</label><input id="name" name="name" defaultValue={jv?.name} placeholder="Bullion Technologies JV" /></div>
          <div className="field"><label htmlFor="fundingPartner">Funding partner</label><input id="fundingPartner" name="fundingPartner" defaultValue={jv?.fundingPartner} placeholder="Bullion Technologies" /><span className="hint">The party advancing funds; the loan book is owed to them.</span></div>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="code">Subdomain code</label><input id="code" name="code" defaultValue={jv?.code} placeholder="bullion" /><span className="hint">Becomes code.earldeign.co.zw and /j/code.</span></div>
          <div className="field"><label htmlFor="shortCode">Numbering prefix</label><input id="shortCode" name="shortCode" defaultValue={jv?.shortCode} placeholder="BT" readOnly={!creating} /><span className="hint">{creating ? "2 to 5 capitals, e.g. BT gives BT-REQ-2026-0001. Cannot change later." : "Fixed once the JV exists."}</span></div>
          <div className="field"><label htmlFor="acquittalDays">Acquittal period (days)</label><input id="acquittalDays" name="acquittalDays" inputMode="numeric" defaultValue={jv?.acquittalDays ?? 14} /></div>
        </div>
        <div className="field"><span className="label">Currencies (each keeps its own balance)</span>
          <div className="checks">{CURRENCIES.map((c) => <label key={c}><input type="checkbox" name="currencies" value={c} defaultChecked={jv ? jv.currencies.includes(c) : true} />{CURRENCY_LABEL[c]}</label>)}</div></div>
        <div className="field" style={{ maxWidth: 260 }}><label htmlFor="goLiveDate">Go-live date</label><input id="goLiveDate" type="date" name="goLiveDate" defaultValue={jv?.goLiveDate ?? ""} /></div>
      </div></section>
      <section className="panel"><h2>Front-facing company</h2><p className="small muted">Shown on invoices, receipts and printed requisitions.</p><div className="form">
        <div className="form-row">
          <div className="field"><label htmlFor="companyName">Registered name</label><input id="companyName" name="companyName" defaultValue={jv?.companyName} placeholder="Bullion Technologies Private Limited" /></div>
          <div className="field"><label htmlFor="companyEmail">Email</label><input id="companyEmail" name="companyEmail" defaultValue={jv?.companyEmail ?? ""} /></div>
          <div className="field"><label htmlFor="companyPhone">Phone</label><input id="companyPhone" name="companyPhone" defaultValue={jv?.companyPhone ?? ""} /></div>
        </div>
        <div className="field"><label htmlFor="companyAddress">Registered address</label><textarea id="companyAddress" name="companyAddress" defaultValue={jv?.companyAddress ?? ""} style={{ minHeight: 64 }} /></div>
      </div></section>
      <section className="panel"><h2>Tax</h2><div className="form">
        <div className="form-row">
          <div className="field"><label htmlFor="vatNo">VAT registration number</label><input id="vatNo" name="vatNo" defaultValue={jv?.vatNo ?? ""} /></div>
          <div className="field"><label htmlFor="bpNo">BP number</label><input id="bpNo" name="bpNo" defaultValue={jv?.bpNo ?? ""} /></div>
          <div className="field"><label htmlFor="tin">TIN</label><input id="tin" name="tin" defaultValue={jv?.tin ?? ""} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="vatRatePercent">Standard VAT rate (%)</label><input id="vatRatePercent" name="vatRatePercent" inputMode="decimal" defaultValue={jv ? (jv.vatRateBp / 100).toString() : ""} /><span className="hint">Confirm the current rate with your accountant; it is never hard-coded.</span></div>
          <div className="field"><label htmlFor="taxClearanceNo">Tax clearance certificate number</label><input id="taxClearanceNo" name="taxClearanceNo" defaultValue={jv?.taxClearanceNo ?? ""} /></div>
          <div className="field"><label htmlFor="taxClearanceExpiry">Tax clearance expiry</label><input id="taxClearanceExpiry" type="date" name="taxClearanceExpiry" defaultValue={jv?.taxClearanceExpiry ?? ""} /><span className="hint">The dashboard warns 30 days before expiry.</span></div>
        </div>
      </div></section>
    </>
  );
}
