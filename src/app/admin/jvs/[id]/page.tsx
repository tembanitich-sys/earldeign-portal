import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories, jvBankAccounts, jvs, memberships, projects, users } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/access";
import { CURRENCIES, minorToInput } from "@/lib/money";
import { bankAction, budgetAction, listItemAction, logoAction, updateJvAction } from "../../actions";
import { ActionForm, AmountInput, Submit } from "@/components/forms";
import { JvSettingsFields } from "@/components/jv-settings-form";
import { Empty, PageHead, Panel } from "@/components/ui";

export default async function JvAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [jv] = await db.select().from(jvs).where(eq(jvs.id, id));
  if (!jv) notFound();
  const [projs, cats, banks, buds, members] = await Promise.all([
    db.select().from(projects).where(eq(projects.jvId, id)).orderBy(asc(projects.name)),
    db.select().from(categories).where(eq(categories.jvId, id)).orderBy(asc(categories.name)),
    db.select().from(jvBankAccounts).where(eq(jvBankAccounts.jvId, id)),
    db.select().from(budgets).where(eq(budgets.jvId, id)),
    db.select({ m: memberships, u: users }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.jvId, id)).orderBy(asc(users.name)),
  ]);
  const root = process.env.ROOT_DOMAIN ?? "earldeign.co.zw";
  const list = (kind: "project" | "category", rows: { id: string; name: string; active: boolean }[], label: string) => (
    <Panel title={label}>
      <table className="data"><tbody>{rows.map((r) => (
        <tr key={r.id}><td>{r.name}{r.active ? null : <span className="muted small"> (inactive)</span>}</td>
          <td className="num"><ActionForm action={listItemAction} className="inline-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="toggle" value={r.id} /><Submit variant="tertiary" small>{r.active ? "Deactivate" : "Activate"}</Submit></ActionForm></td></tr>
      ))}</tbody></table>
      <ActionForm action={listItemAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value={kind} />
        <div className="form-row" style={{ alignItems: "end", marginTop: 12 }}><div className="field"><label htmlFor={`new-${kind}`}>Add {kind}</label><input id={`new-${kind}`} name="name" /></div><div className="field"><Submit variant="secondary">Add</Submit></div></div>
      </ActionForm>
    </Panel>
  );
  return (
    <>
      <PageHead title={jv.name} crumbs={<Link href="/admin">Joint ventures</Link>} context={<>Served at {jv.code}.{root} and /j/{jv.code} · Prefix {jv.shortCode}</>} />
      <Panel title="People with access">
        {members.length ? <table className="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>{members.map(({ m, u }) => <tr key={m.id}><td><Link href={`/admin/users/${u.id}`}>{u.name}</Link></td><td>{u.email}</td><td>{ROLE_LABEL[m.role]}</td></tr>)}</tbody></table>
          : <Empty title="Nobody has a role in this JV yet"><Link href="/admin/users">Add users and assign roles</Link>.</Empty>}
      </Panel>
      <Panel title="JV branding">
        <p className="small muted">The JV&apos;s logo replaces the Earldeign logo in this JV&apos;s screens, on its sign-in page ({jv.code}.{root}) and on its invoices, receipts and requisitions. Layout, type and colours stay on the Earldeign design system for every JV.</p>
        <div className="form-row" style={{ alignItems: "center" }}>
          <div style={{ background: "var(--ei-white)", border: "1px solid var(--ei-border)", borderRadius: 4, padding: 16, textAlign: "center", minHeight: 96 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {jv.logoKey ? <img src={`/api/jv-logo/${jv.code}?v=${encodeURIComponent(jv.logoKey.slice(-12))}`} alt={`${jv.companyName} logo`} style={{ maxHeight: 80, maxWidth: "100%" }} /> : <span className="muted small">No logo yet: the company name is shown instead.</span>}
          </div>
          <div>
            <ActionForm action={logoAction}><input type="hidden" name="id" value={id} />
              <div className="field"><label htmlFor="logo">Logo file (PNG with transparent background, or JPG; up to 1 MB)</label><input id="logo" type="file" name="logo" accept="image/png,image/jpeg" /></div>
              <div className="form-actions"><Submit variant="secondary">Upload logo</Submit></div>
            </ActionForm>
            {jv.logoKey ? <ActionForm action={logoAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="remove" value="1" /><div className="form-actions"><Submit variant="tertiary" small confirm="Remove the logo?">Remove logo</Submit></div></ActionForm> : null}
          </div>
        </div>
      </Panel>
      <ActionForm action={updateJvAction}><input type="hidden" name="id" value={id} /><JvSettingsFields jv={jv} /><div className="form-actions" style={{ marginBottom: 24 }}><Submit>Save settings</Submit></div></ActionForm>
      <div className="grid-2">{list("project", projs, "Projects")}{list("category", cats, "Expense categories")}</div>
      <div className="grid-2">
        <Panel title="Bank accounts shown on invoices">
          {banks.length ? <table className="data"><tbody>{banks.map((b) => <tr key={b.id}><td className="wrap"><strong>{b.bank}</strong> ({b.currency})<div className="small pre">{b.accountName}{"\n"}{b.details}</div></td><td className="num"><ActionForm action={bankAction} className="inline-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="remove" value={b.id} /><Submit variant="tertiary" small confirm="Remove this bank account?">Remove</Submit></ActionForm></td></tr>)}</tbody></table> : <p className="muted small">None yet.</p>}
          <ActionForm action={bankAction}><input type="hidden" name="id" value={id} />
            <div className="form-row"><div className="field"><label htmlFor="bank">Bank</label><input id="bank" name="bank" /></div><div className="field"><label htmlFor="bcur">Currency</label><select id="bcur" name="currency">{jv.currencies.map((c) => <option key={c}>{c}</option>)}</select></div></div>
            <div className="field"><label htmlFor="accountName">Account name</label><input id="accountName" name="accountName" defaultValue={jv.companyName} /></div>
            <div className="field"><label htmlFor="details">Account number, branch, SWIFT</label><textarea id="details" name="details" style={{ minHeight: 64 }} /></div>
            <div className="form-actions"><Submit variant="secondary">Add bank account</Submit></div>
          </ActionForm>
        </Panel>
        <Panel title="Monthly budgets">
          <p className="small muted">Optional. The dashboard compares month-to-date spend with this figure, per currency.</p>
          <ActionForm action={budgetAction}><input type="hidden" name="id" value={id} />
            {CURRENCIES.filter((c) => jv.currencies.includes(c)).map((c) => (
              <div className="field" key={c}><input type="hidden" name="budget_ccy" value={c} /><label htmlFor={`budget_${c}`}>{c} per month</label>
                <AmountInput id={`budget_${c}`} name={`budget_${c}`} currency={c} defaultValue={minorToInput(buds.find((b) => b.currency === c)?.monthlyAmount ?? null)} /></div>
            ))}
            <div className="form-actions"><Submit variant="secondary">Save budgets</Submit></div>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
