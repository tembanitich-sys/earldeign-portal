import { describe, expect, it, beforeAll } from "vitest";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries } from "@/db/schema";
import { balances } from "@/lib/ledger";
import { loadCtx } from "@/lib/access";
import { todayIso } from "@/lib/dates";
import * as R from "@/services/requisitions";
import * as I from "@/services/income";
import * as S from "@/services/suppliers";
import * as C from "@/services/changes";
import * as M from "@/services/imports";
import * as P from "@/services/periods";
import * as A from "@/services/admin";
import { currencySummaries } from "@/services/reports";
import { world, line, makeUser, type World } from "./helpers";
import fs from "node:fs";

const usd = async (w: World) => (await balances(db, w.jv.id, ["USD"])).find((b) => b.currency === "USD")!;

async function paidRequisition(w: World, opts: { amount?: string; payFrom?: string; currency?: string; supplierInvoiceId?: string; method?: string } = {}) {
  const r = await R.createRequisition(db, w.cto, {
    currency: opts.currency ?? "USD", payee: "Dev House", paymentMethod: "bank_transfer", payeeBankDetails: "CBZ 123",
    payFrom: opts.payFrom ?? "funding_partner", supplierInvoiceId: opts.supplierInvoiceId, lines: [line("Development fees", opts.amount ?? "1000")],
  });
  await R.submitRequisition(db, w.cto, r.id);
  await R.financeReview(db, w.fo, r.id, "approve", { payFrom: opts.payFrom ?? "funding_partner" });
  await R.disburse(db, w.fc, r.id, { method: opts.method ?? "bank_transfer", date: todayIso(), reference: "TT1" });
  return r;
}

let landFortune: string;

describe("SPEC section 14 acceptance tests", () => {
  let w: World;
  beforeAll(async () => {
    w = await world();
    landFortune = (await I.saveClient(db, w.fo, { name: "Land Fortune" })).id;
  });

  it("1. Land Fortune worked example produces the stated balances", async () => {
    const inv = await I.createInvoice(db, w.fo, { clientId: landFortune, currency: "USD", issueDate: todayIso(), lines: [{ description: "System development", quantity: "1", unitPrice: "9000", vatRateBp: 0 }] });
    await I.issueInvoice(db, w.fo, inv.id, "FDMS-001");
    let b = await usd(w);
    expect(b.loan).toBe(0);
    expect(b.incomeHeld).toBe(0);
    let open = await I.openInvoices(db, w.fo, landFortune);
    expect(open[0].outstanding).toBe(900000);

    await I.recordReceipt(db, w.fc, { clientId: landFortune, receivedDate: todayIso(), currency: "USD", amount: "4500", method: "bank_transfer", bankRef: "LF50", allocations: [{ invoiceId: inv.id, amount: "4500" }] });
    b = await usd(w);
    open = await I.openInvoices(db, w.fo, landFortune);
    expect(open[0].outstanding).toBe(450000);
    expect(b.incomeHeld).toBe(450000);
    expect(b.loan).toBe(0);

    await paidRequisition(w, { amount: "4500", payFrom: "jv_income" });
    b = await usd(w);
    expect(b.loan).toBe(0);
    expect(b.incomeHeld).toBe(0);
    const types = await db.select({ t: ledgerEntries.type, l: ledgerEntries.loanDelta }).from(ledgerEntries).where(eq(ledgerEntries.jvId, w.jv.id));
    expect(types.some((t) => t.t === "drawdown" && t.l === 450000)).toBe(true);
    expect(types.some((t) => t.t === "income_applied_offset" && t.l === -450000)).toBe(true);
  });

  it("2. currencies are never combined", async () => {
    await paidRequisition(w, { amount: "100", currency: "ZAR" });
    const all = await balances(db, w.jv.id, w.jv.currencies);
    expect(all.find((b) => b.currency === "ZAR")!.loan).toBe(10000);
    expect(all.find((b) => b.currency === "USD")!.loan).toBe(0);
    const sums = await currencySummaries(db, w.fo);
    expect(sums.map((s) => s.currency).sort()).toEqual(["USD", "ZAR", "ZWG"]);
  });

  it("3. a Project Coordinator requisition cannot reach finance without CTO approval", async () => {
    const r = await R.createRequisition(db, w.pc, { currency: "USD", payee: "Taxi", paymentMethod: "cash", lines: [line("Transport", "20")] });
    await R.submitRequisition(db, w.pc, r.id);
    expect((await R.getRequisition(db, w.cto, r.id)).status).toBe("cto_review");
    await expect(R.financeReview(db, w.fo, r.id, "approve")).rejects.toThrow(/not waiting for finance/);
    await R.ctoReview(db, w.cto, r.id, "approve");
    expect((await R.getRequisition(db, w.cto, r.id)).status).toBe("finance_review");
  });

  it("4. nobody approves their own requisition; approver and disburser must differ", async () => {
    const both = await makeUser("FO and FC");
    await A.grantRole(db, w.admin, both.id, w.jv.id, "finance_officer");
    await A.grantRole(db, w.admin, both.id, w.jv.id, "finance_clerk");
    const ctx = (await loadCtx(db, both.id, w.jv.code))!;
    const r = await R.createRequisition(db, w.cto, { currency: "USD", payee: "X", paymentMethod: "cash", lines: [line("Item", "10")] });
    await R.submitRequisition(db, w.cto, r.id);
    await expect(R.ctoReview(db, w.cto, r.id, "approve")).rejects.toThrow();
    await R.financeReview(db, ctx, r.id, "approve");
    await expect(R.disburse(db, ctx, r.id, { method: "cash", date: todayIso() })).rejects.toThrow(/approved this requisition cannot also disburse/);

    const own = await R.createRequisition(db, w.cto, { currency: "USD", payee: "Y", paymentMethod: "cash", lines: [line("Item", "10")] });
    const cfo = await makeUser("CTO and FO");
    await A.grantRole(db, w.admin, cfo.id, w.jv.id, "cto");
    await A.grantRole(db, w.admin, cfo.id, w.jv.id, "finance_officer");
    const cfoCtx = (await loadCtx(db, cfo.id, w.jv.code))!;
    const own2 = await R.createRequisition(db, cfoCtx, { currency: "USD", payee: "Z", paymentMethod: "cash", lines: [line("Item", "10")] });
    await R.submitRequisition(db, cfoCtx, own2.id);
    await expect(R.financeReview(db, cfoCtx, own2.id, "approve")).rejects.toThrow(/you raised/);
    expect(own.status).toBe("draft");
  });

  it("5. the Super Admin cannot hold JV roles or post entries", async () => {
    await expect(A.grantRole(db, w.admin, w.admin.userId, w.jv.id, "cto")).rejects.toThrow(/Super Admin accounts cannot hold JV roles/);
    expect(await loadCtx(db, w.admin.userId, w.jv.code)).toBeNull();
  });

  it("6. a user with roles only in JV A gets nothing from JV B", async () => {
    const other = await world();
    const r = await R.createRequisition(db, other.cto, { currency: "USD", payee: "Secret", paymentMethod: "cash", lines: [line("Item", "10")] });
    expect(await loadCtx(db, w.fo.userId, other.jv.code)).toBeNull();
    // Even with a forged context pointing at JV A, a JV B record id is not found.
    await expect(R.getRequisition(db, w.fo, r.id)).rejects.toThrow(/not found/);
    const listA = await R.listRequisitions(db, w.fo);
    expect(listA.some((x) => x.r.id === r.id)).toBe(false);
  });

  it("7. ledger rows cannot be updated or deleted; reversal restores the balance", async () => {
    const cause = async (q: Promise<unknown>) => { try { await q; return "no error"; } catch (e) { return String((e as { cause?: Error }).cause?.message ?? e); } };
    expect(await cause(db.execute(sql`update ledger_entries set loan_delta = 0 where jv_id = ${w.jv.id}`))).toMatch(/append-only/);
    expect(await cause(db.execute(sql`delete from ledger_entries where jv_id = ${w.jv.id}`))).toMatch(/append-only/);
    expect(await cause(db.execute(sql`truncate ledger_entries cascade`))).toMatch(/append-only/);
  });

  it("8. a JV-income payment is blocked when income held is insufficient", async () => {
    const r = await R.createRequisition(db, w.cto, { currency: "ZWG", payee: "X", paymentMethod: "cash", payFrom: "jv_income", lines: [line("Item", "50")] });
    await R.submitRequisition(db, w.cto, r.id);
    await R.financeReview(db, w.fo, r.id, "approve", { payFrom: "jv_income" });
    await expect(R.disburse(db, w.fc, r.id, { method: "cash", date: todayIso() })).rejects.toThrow(/Not enough JV income held in ZWG/);
    expect((await R.getRequisition(db, w.cto, r.id)).status).toBe("approved");
  });

  it("9. posting into a closed period is rejected", async () => {
    const w2 = await world();
    const lastMonth = new Date(); lastMonth.setUTCDate(1); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const ym = lastMonth.toISOString().slice(0, 7);
    await P.closePeriod(db, w2.fo, ym);
    const c = await I.saveClient(db, w2.fo, { name: "Late Payer" });
    await expect(I.recordReceipt(db, w2.fc, { clientId: c.id, receivedDate: `${ym}-15`, currency: "USD", amount: "10", method: "cash", allocations: [] })).rejects.toThrow(/closed/);
  });

  it("10. a duplicate external invoice from the same source is rejected", async () => {
    const input = { sourceSystem: "InstaTickets", externalNumber: "IT-0042", clientId: landFortune, issueDate: todayIso(), currency: "USD", amount: "120" };
    await I.createExternalInvoice(db, w.fo, input);
    await expect(I.createExternalInvoice(db, w.fo, input)).rejects.toThrow(/already recorded/);
    await I.createExternalInvoice(db, w.fo, { ...input, sourceSystem: "BusRep / TrackStar" });
  });

  it("11. the supplied historical CSV totals USD 8,593 and stays inactive until authorised", async () => {
    const w3 = await world();
    const csv = fs.readFileSync("tests/fixtures/Bullion_JV_historical_import.csv", "utf8");
    const parsed = await M.parseImport(db, w3.cto, csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.length).toBe(22);
    expect(parsed.totals.USD).toBe(859300);
    const batch = await M.createImportBatch(db, w3.cto, "recon.csv", csv);
    expect((await usd(w3)).loan).toBe(0);
    await expect(M.decideImport(db, w3.cto, batch.id, "authorise")).rejects.toThrow(/counter-party/);
    await M.decideImport(db, w3.fo, batch.id, "authorise");
    expect((await usd(w3)).loan).toBe(859300);
    const report = await M.openingBalanceReport(db, w3.fo);
    expect(report.byCurrency.USD).toBe(859300);
    expect(report.flagged.length).toBe(22);
  });

  it("12. an acquittal with change returned reduces the loan by the change", async () => {
    const w4 = await world();
    const r = await paidRequisition(w4, { amount: "500", method: "cash" });
    expect((await usd(w4)).loan).toBe(50000);
    await R.submitAcquittal(db, w4.cto, r.id, { actual: "430" });
    await R.decideAcquittal(db, w4.fo, r.id, "approve");
    expect((await usd(w4)).loan).toBe(43000);
    expect((await R.getRequisition(db, w4.cto, r.id)).status).toBe("closed");
  });

  it("13. a change request has no effect until the counter-party authorises it", async () => {
    const w5 = await world();
    const r = await paidRequisition(w5, { amount: "1000" });
    const cr = await C.proposeChange(db, w5.cto, "requisition", r.id, { amount: "800" }, "Supplier invoice was 800");
    expect((await usd(w5)).loan).toBe(100000);
    await expect(C.decideChange(db, w5.cto, cr.id, "authorise")).rejects.toThrow(/proposed/);
    await expect(C.proposeChange(db, w5.fo, "requisition", r.id, { amount: "700" }, "x")).rejects.toThrow(/already pending/);
    await C.decideChange(db, w5.fo, cr.id, "authorise");
    expect((await usd(w5)).loan).toBe(80000);
    const hist = await C.changesFor(db, "requisition", r.id);
    expect(hist[0].changes.amount).toEqual({ from: 100000, to: 80000 });
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.sourceId, r.id));
    expect(entries.map((e) => e.type)).toEqual(["drawdown", "reversal", "drawdown"]);
  });

  it("14. a new JV starts empty with numbering at 0001 and is invisible to other JVs", async () => {
    const fresh = await A.createJv(db, w.admin, { code: `fresh${Date.now() % 100000}`, shortCode: "FRS" + String.fromCharCode(65 + (Date.now() % 26)), name: "Fresh JV", companyName: "Fresh Co", fundingPartner: "Partner", currencies: ["USD"] });
    const u = await makeUser("Fresh CTO");
    await A.grantRole(db, w.admin, u.id, fresh.id, "cto");
    const ctx = (await loadCtx(db, u.id, fresh.code))!;
    expect((await balances(db, fresh.id, ["USD"]))[0].loan).toBe(0);
    const r = await R.createRequisition(db, ctx, { currency: "USD", payee: "X", paymentMethod: "cash", lines: [line("Item", "1")] });
    expect(r.number).toBe(`${fresh.shortCode}-REQ-${todayIso().slice(0, 4)}-0001`);
    expect(await loadCtx(db, w.cto.userId, fresh.code)).toBeNull();
  });

  it("15. supplier invoice USD 5,000 with two USD 1,000 payments", async () => {
    const w6 = await world();
    const it = await w6.projectId("InstaTickets");
    const si = await S.createSupplierInvoice(db, w6.cto, { supplier: "Phils & Phats", supplierInvoiceNo: "PP-01", invoiceDate: todayIso(), currency: "USD", lines: [{ projectId: it, description: "InstaTickets build", amount: "5000" }] });
    await paidRequisition(w6, { amount: "1000", supplierInvoiceId: si.id });
    await paidRequisition(w6, { amount: "1000", supplierInvoiceId: si.id });
    const d = await S.supplierInvoiceDetail(db, w6.fo, si.id);
    expect(d.outstanding).toBe(300000);
    const costs = await S.projectCosts(db, w6.fo);
    const row = costs.find((c) => c.project === "InstaTickets" && c.currency === "USD")!;
    expect(row.invoiced).toBe(500000);
    expect(row.paidPartner).toBe(200000);
    expect(row.outstanding).toBe(300000);
    expect((await usd(w6)).loan).toBe(200000);
  });
});

describe("Further rules", () => {
  it("historical row switched to JV income after the receipt is captured", async () => {
    const w = await world();
    const csv = fs.readFileSync("tests/fixtures/Bullion_JV_historical_import.csv", "utf8");
    const b = await M.createImportBatch(db, w.fo, "recon.csv", csv);
    await M.decideImport(db, w.cto, b.id, "authorise");
    const c = await I.saveClient(db, w.fo, { name: "Land Fortune" });
    await I.recordReceipt(db, w.fc, { clientId: c.id, receivedDate: "2026-10-01", currency: "USD", amount: "4500", method: "bank_transfer", allocations: [] });
    const [dev] = (await R.listRequisitions(db, w.fo, { status: "historical" })).filter((x) => x.r.total === 180000);
    const cr = await C.proposeChange(db, w.cto, "requisition", dev.r.id, { payFrom: "jv_income" }, "Paid from Land Fortune receipt");
    await C.decideChange(db, w.fo, cr.id, "authorise");
    const bal = await usd(w);
    expect(bal.loan).toBe(859300 - 180000);
    expect(bal.incomeHeld).toBe(450000 - 180000);
  });

  it("receipt amount cannot drop below what is allocated", async () => {
    const w = await world();
    const c = await I.saveClient(db, w.fo, { name: "Client" });
    const inv = await I.createInvoice(db, w.fo, { clientId: c.id, currency: "USD", issueDate: todayIso(), lines: [{ description: "Work", quantity: "1", unitPrice: "100", vatRateBp: 1550 }] });
    expect(inv.total).toBe(11550);
    await I.issueInvoice(db, w.fo, inv.id, "F-1");
    const rc = await I.recordReceipt(db, w.fc, { clientId: c.id, receivedDate: todayIso(), currency: "USD", amount: "115.50", method: "cash", allocations: [{ invoiceId: inv.id, amount: "115.50" }] });
    expect((await I.getInvoice(db, w.fo, inv.id)).status).toBe("paid");
    await expect(C.proposeChange(db, w.fo, "receipt", rc.id, { amount: "100" }, "typo")).rejects.toThrow(/allocated/);
  });

  it("conversion moves income between currency balances", async () => {
    const w = await world();
    const c = await I.saveClient(db, w.fo, { name: "Client" });
    await I.recordReceipt(db, w.fc, { clientId: c.id, receivedDate: todayIso(), currency: "USD", amount: "100", method: "cash", allocations: [] });
    await I.recordConversion(db, w.fo, { date: todayIso(), fromCurrency: "USD", fromAmount: "100", toCurrency: "ZAR", toAmount: "1800" });
    const all = await balances(db, w.jv.id, w.jv.currencies);
    expect(all.find((b) => b.currency === "USD")!.incomeHeld).toBe(0);
    expect(all.find((b) => b.currency === "ZAR")!.incomeHeld).toBe(180000);
    await expect(I.recordConversion(db, w.fo, { date: todayIso(), fromCurrency: "USD", fromAmount: "1", toCurrency: "ZAR", toAmount: "18" })).rejects.toThrow(/Only USD/);
  });

  it("an issued invoice needs a fiscal number; Project Coordinator cannot see the loan book", async () => {
    const w = await world();
    const c = await I.saveClient(db, w.fo, { name: "Client" });
    const inv = await I.createInvoice(db, w.fo, { clientId: c.id, currency: "USD", issueDate: todayIso(), lines: [{ description: "Work", quantity: "2", unitPrice: "50", vatRateBp: 0 }] });
    await expect(I.issueInvoice(db, w.fo, inv.id, " ")).rejects.toThrow(/fiscal/);
    await expect(I.getInvoice(db, w.pc, inv.id)).rejects.toThrow(/permission/);
  });

  it("supplier invoice line change through dual authorisation", async () => {
    const w = await world();
    const it = await w.projectId("InstaTickets");
    const tr = await w.projectId("TrackStar / BusRep");
    const si = await S.createSupplierInvoice(db, w.fo, { supplier: "Dev", supplierInvoiceNo: "D-1", invoiceDate: todayIso(), currency: "USD", lines: [{ projectId: it, description: "Build", amount: "3000" }] });
    const cr = await C.proposeChange(db, w.fo, "supplier_invoice", si.id, { lines: [{ projectId: it, description: "Build", amount: "2000" }, { projectId: tr, description: "Integration", amount: "1500" }] }, "Split per project");
    await C.decideChange(db, w.cto, cr.id, "authorise");
    const d = await S.supplierInvoiceDetail(db, w.fo, si.id);
    expect(d.si.total).toBe(350000);
    expect(d.lines.length).toBe(2);
  });
});

describe("Projects", () => {
  it("CTO and Finance Officer add projects in their own JV only; others cannot; no duplicates", async () => {
    const { addProject, setProjectActive } = await import("@/services/projects");
    const w = await world();
    const p = await addProject(db, w.cto, "ZimBNB");
    await expect(addProject(db, w.fo, "zimbnb")).rejects.toThrow(/already exists/);
    await expect(addProject(db, w.pc, "Other")).rejects.toThrow(/permission/);
    await expect(addProject(db, w.viewer, "Other")).rejects.toThrow(/permission/);
    const other = await world();
    await expect(setProjectActive(db, other.cto, p.id, false)).rejects.toThrow(/not found/);
    await setProjectActive(db, w.fo, p.id, false);
    await expect(addProject(db, w.cto, "ZimBNB")).rejects.toThrow(/inactive/);
  });
});

describe("Notifications", () => {
  it("normalises Zimbabwean numbers and keeps SMS to one message", async () => {
    const { normalisePhone, smsText } = await import("@/lib/sms");
    expect(normalisePhone("0771 234 567")).toBe("+263771234567");
    expect(normalisePhone("263771234567")).toBe("+263771234567");
    expect(normalisePhone("+263 77 123 4567")).toBe("+263771234567");
    expect(normalisePhone("12345")).toBeNull();
    const t = smsText("BT-REQ-2026-0001 awaits your review: a very long payee name ".repeat(4), "https://earldeign-portal-preview.vercel.app/j/bullion/requisitions/0f6c2f0e-1111-4c8e-9b0b-2a1e0c9d8e7f");
    expect(t.length).toBeLessThanOrEqual(160);
  });

  it("CTO submission notifies the Finance Officer; the decision goes back to the CTO, by email and SMS", async () => {
    const { notifications, users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const w = await world();
    await db.update(users).set({ phone: "+263771234567" }).where(eq(users.id, w.fo.userId));
    const r = await R.createRequisition(db, w.cto, { currency: "USD", payee: "X", paymentMethod: "cash", lines: [line("Item", "10")] });
    await R.submitRequisition(db, w.cto, r.id);
    const toFo = await db.select().from(notifications).where(eq(notifications.userId, w.fo.userId));
    expect(toFo.some((n) => n.title.includes("awaits your review") && n.smsWanted)).toBe(true);
    await R.financeReview(db, w.fo, r.id, "approve");
    const toCto = await db.select().from(notifications).where(eq(notifications.userId, w.cto.userId));
    expect(toCto.some((n) => n.title.includes("Approved"))).toBe(true);
    process.env.SMS_DRIVER = "log";
    const { flushNotifications } = await import("@/lib/notify");
    await flushNotifications(db);
    const after = await db.select().from(notifications).where(eq(notifications.userId, w.fo.userId));
    expect(after.every((n) => n.emailed && n.smsSent)).toBe(true);
    delete process.env.SMS_DRIVER;
  });
});

describe("Econet SMS gateway", () => {
  it("reads success and failure replies in JSON and XML", async () => {
    const { parseEconetResponse } = await import("@/lib/sms");
    expect(parseEconetResponse(200, JSON.stringify({ status: { "error-code": "000", "error-status": "Success" }, "sms-response-details": [{ "success-count": "1", "failed-sms-details": [], "sent-sms-details": [{ "message-id": "1" }] }] })).ok).toBe(true);
    expect(parseEconetResponse(200, JSON.stringify({ status: { "error-code": "002", "error-description": "invalid senderid" } })).ok).toBe(false);
    expect(parseEconetResponse(200, '<sms-response><status><error-code>000</error-code></status><sms-response-details><failed-sms-details><count>0</count></failed-sms-details></sms-response-details></sms-response>').ok).toBe(true);
    expect(parseEconetResponse(200, '<sms-response><status><error-code>000</error-code></status><sms-response-details><failed-sms-details><count>1</count></failed-sms-details></sms-response-details></sms-response>').ok).toBe(false);
    expect(parseEconetResponse(500, "").ok).toBe(false);
  });

  it("sends the documented request: GET with apikey, mobiles 263..., sms, senderid", async () => {
    const http = await import("node:http");
    let seen = "";
    const srv = http.createServer((req, res) => { seen = req.url ?? ""; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ status: { "error-code": "000" }, "sms-response-details": [{ "failed-sms-details": [] }] })); });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as { port: number }).port;
    Object.assign(process.env, { SMS_DRIVER: "econet", SMS_API_KEY: "testkey123", SMS_SENDER_ID: "EarldeignJV", SMS_API_BASE: `http://127.0.0.1:${port}` });
    const { sendSms } = await import("@/lib/sms");
    const r = await sendSms("0771 234 567", "BT-REQ-2026-0001 awaits your review", "abc-123");
    srv.close();
    for (const k of ["SMS_DRIVER", "SMS_API_KEY", "SMS_SENDER_ID", "SMS_API_BASE"]) delete process.env[k];
    expect(r.ok).toBe(true);
    const u = new URL(seen, "http://x");
    expect(u.pathname).toBe("/client/api/sendmessage");
    expect(u.searchParams.get("apikey")).toBe("testkey123");
    expect(u.searchParams.get("mobiles")).toBe("263771234567");
    expect(u.searchParams.get("senderid")).toBe("EarldeignJV");
    expect(u.searchParams.get("sms")).toBe("BT-REQ-2026-0001 awaits your review");
    expect(u.searchParams.get("client-sms-ids")).toBe("abc123");
  });
});

describe("User profiles", () => {
  it("Super Admin can change a user's email (unique, audited); users edit their own profile but not their email", async () => {
    const { updateUser, updateOwnProfile } = await import("@/services/admin");
    const { users, auditLog } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const w = await world();
    const target = await makeUser("Changing Email");
    const other = await makeUser("Taken");
    await expect(updateUser(db, w.admin, target.id, { name: target.name, email: other.email })).rejects.toThrow(/already uses/);
    await expect(updateUser(db, { userId: w.cto.userId, isSuperAdmin: false }, target.id, { name: "x", email: "x@y.zz" })).rejects.toThrow(/Super Admin/);
    const newEmail = `new-${Date.now()}@earldeign.com`;
    const r = await updateUser(db, w.admin, target.id, { name: target.name, email: newEmail.toUpperCase() });
    expect(r.newEmail).toBe(newEmail);
    const [u] = await db.select().from(users).where(eq(users.id, target.id));
    expect(u.email).toBe(newEmail);
    const logs = await db.select().from(auditLog).where(and(eq(auditLog.entityId, target.id), eq(auditLog.action, "user.update_email")));
    expect(logs.length).toBe(1);
    await updateOwnProfile(db, target.id, { name: "Renamed Person", phone: "0771 234 567", email: "hijack@evil.test" } as never);
    const [u2] = await db.select().from(users).where(eq(users.id, target.id));
    expect(u2.name).toBe("Renamed Person");
    expect(u2.phone).toBe("+263771234567");
    expect(u2.email).toBe(newEmail);
  });
});
