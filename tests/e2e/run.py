import base64, hashlib, hmac, struct, time, re, sys
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:3000"
SHOTS = "/home/claude/shots"
CSV = "/home/claude/Bullion_JV_historical_import.csv"

def totp(secret):
    key = base64.b32decode(secret.replace(" ", "").upper() + "=" * ((8 - len(secret.replace(" ", "")) % 8) % 8))
    msg = struct.pack(">Q", int(time.time()) // 30)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[-1] & 15
    return "%06d" % ((struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000)

secrets = {}
errors = []

def step(name):
    print("--", name, flush=True)

def login(p, email, pw, newpw=None):
    ctx = p.new_context(viewport={"width": 1440, "height": 1000})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{email}: {e}"))
    page.goto(BASE + "/login")
    page.fill("#email", email); page.fill("#password", pw); page.click("button[type=submit]")
    settle(page)
    if "/account/password" in page.url:
        page.fill("#current", pw); page.fill("#next", newpw); page.fill("#confirm", newpw); page.click("button[type=submit]")
        settle(page)
    if "/account/two-factor" in page.url:
        sec = page.locator("code.secret").inner_text().replace(" ", "")
        secrets[email] = sec
        page.fill("#code", totp(sec)); page.click("button[type=submit]")
        settle(page)
    if "/login/verify" in page.url:
        page.fill("#code", totp(secrets[email])); page.click("button[type=submit]")
        settle(page)
    return ctx, page

def settle(page):
    page.wait_for_timeout(250)
    for _ in range(60):
        if page.locator("button:has-text('Working')").count() == 0: break
        page.wait_for_timeout(250)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)

def ok_notice(page):
    err = page.locator(".notice.error")
    if err.count():
        raise AssertionError("Form error: " + err.first.inner_text())

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pp = b

    step("Super Admin first sign-in, password change, 2FA enrolment")
    sa, sp = login(pp, "tembanitich@outlook.com", "ChangeMe!2026", "SuperAdmin2026pw")
    assert sp.url.endswith("/admin"), sp.url
    sp.screenshot(path=f"{SHOTS}/01-admin-jvs.png", full_page=True)
    sp.click("text=Bullion Technologies JV")
    settle(sp)
    sp.fill("#vatRatePercent", "15.5"); sp.fill("#vatNo", "10012345"); sp.fill("#bpNo", "200123456"); sp.fill("#taxClearanceNo", "ITF263-2026-001"); sp.fill("#taxClearanceExpiry", "2026-12-31")
    sp.click("text=Save settings"); settle(sp); ok_notice(sp)
    sp.screenshot(path=f"{SHOTS}/02-admin-jv-settings.png", full_page=True)

    step("CTO first sign-in (no 2FA required for CTO)")
    cto, cp = login(pp, "tich@bulliongroup.co.zw", "ChangeMe!2026", "CtoPassword2026")
    assert "/j/bullion" in cp.url, cp.url
    cp.screenshot(path=f"{SHOTS}/03-cto-dashboard-empty.png", full_page=True)

    step("CTO uploads historical import")
    cp.goto(BASE + "/j/bullion/import")
    cp.set_input_files("#file", CSV); cp.click("text=Check and upload"); settle(cp); ok_notice(cp)
    cp.goto(BASE + "/j/bullion/import")
    assert "Waiting for authorisation" in cp.content()
    cp.screenshot(path=f"{SHOTS}/03b-import-pending.png", full_page=True); assert "must authorise this import" in cp.content(), cp.locator(".notice").all_inner_texts()

    step("Finance Officer signs in (2FA required), authorises import")
    fo, fp = login(pp, "fo@demo.local", "DemoPass2026x")
    assert "/j/bullion" in fp.url, fp.url
    fp.goto(BASE + "/j/bullion/import")
    fp.once("dialog", lambda d: d.accept())
    fp.click("button:has-text('Authorise import')"); settle(fp); ok_notice(fp)
    fp.goto(BASE + "/j/bullion/ledger?currency=USD")
    txt = fp.content()
    assert "8,593.00" in txt, "loan balance 8,593 not shown"
    fp.screenshot(path=f"{SHOTS}/04-loan-book-after-import.png", full_page=True)

    step("CTO raises a requisition and submits it")
    cp.goto(BASE + "/j/bullion/requisitions/new"); cp.screenshot(path=f"{SHOTS}/05-new-requisition.png"); cp.reload(); settle(cp)
    cp.select_option("#projectId", label="InstaTickets")
    cp.select_option("#categoryId", label="Hosting & infrastructure")
    cp.fill("input[name=line_desc]", "Monthly server fees, November")
    cp.fill("input[name=line_unit]", "285")
    cp.fill("#justification", "Production hosting for InstaTickets.")
    cp.fill("#payee", "Vertico Solutions"); cp.fill("#payeeBankDetails", "CBZ Bank, Kwame Nkrumah, Acc 0123456789")
    import time as _t; t0=_t.time()
    cp.click("button:has-text('Save and submit')"); settle(cp); ok_notice(cp)
    req_url = cp.url
    cp.screenshot(path=f"{SHOTS}/dbg-req.png", full_page=True); assert "Pending finance approval" in cp.content(), (cp.url, cp.locator(".context").all_inner_texts(), cp.locator(".notice").all_inner_texts())

    step("FO approves")
    import time as _t; t0=_t.time()
    fp.goto(req_url); t0=_t.time(); fp.click("button:has-text('Approve')"); settle(fp); ok_notice(fp)
    assert "Approved, awaiting disbursement" in fp.content(), (fp.url, fp.locator(".context").all_inner_texts(), fp.locator(".notice").all_inner_texts(), fp.locator("button").all_inner_texts())

    step("Finance Clerk signs in (2FA), disburses")
    fc, cl = login(pp, "fc@demo.local", "DemoPass2026x")
    cl.goto(req_url); cl.fill("#reference", "TT-NOV-001")
    cl.once("dialog", lambda d: d.accept())
    cl.click("button:has-text('Record disbursement')"); settle(cl); ok_notice(cl)
    assert "acquittal pending" in cl.content().lower()
    cl.screenshot(path=f"{SHOTS}/06-requisition-disbursed.png", full_page=True)

    step("Project Coordinator requisition goes to CTO first")
    pc, pcp = login(pp, "pc@demo.local", "DemoPass2026x")
    pcp.goto(BASE + "/j/bullion/requisitions/new")
    pcp.fill("input[name=line_desc]", "Transport to RoadPort"); pcp.fill("input[name=line_unit]", "20")
    pcp.select_option("#paymentMethod", "cash"); pcp.fill("#payee", "Peter Coordinator")
    pcp.click("button:has-text('Save and submit')"); settle(pcp); ok_notice(pcp)
    assert "Pending CTO review" in pcp.content()
    r = pcp.request.get(BASE + "/j/bullion/ledger"); assert "This page is not available" in r.text() and "Closing balance" not in r.text(), ("PC can see loan book", r.status)
    pcp.goto(BASE + "/j/bullion"); pcp.screenshot(path=f"{SHOTS}/07-pc-dashboard.png", full_page=True)

    step("FO: client, invoice 9,000, issue")
    fp.goto(BASE + "/j/bullion/clients/new"); fp.fill("#name", "Land Fortune"); fp.click("button:has-text('Add client')"); settle(fp); ok_notice(fp)
    fp.goto(BASE + "/j/bullion/invoices/new")
    fp.fill("input[name=line_desc]", "System development, phase 1"); fp.fill("input[name=line_unit]", "9000")
    fp.select_option("select[name=line_vat]", "0")
    fp.click("button:has-text('Save draft invoice')"); settle(fp); ok_notice(fp)
    fp.wait_for_selector("#fiscalInvoiceNo", timeout=20000) if "/new" not in fp.url else None
    if "/new" in fp.url: fp.screenshot(path=f"{SHOTS}/dbg-inv.png"); raise AssertionError(("still on new", fp.locator(".notice").all_inner_texts(), fp.locator("button").all_inner_texts()))
    inv_url = fp.url
    fp.fill("#fiscalInvoiceNo", "FDMS-000123"); fp.click("button:has-text('Issue invoice')"); settle(fp); ok_notice(fp)
    assert "Issued" in fp.content()

    step("FC records Land Fortune receipt 4,500 against it")
    cl.goto(BASE + "/j/bullion/receipts/new")
    cl.select_option("#client", label="Land Fortune"); cl.click("button:has-text('Show open invoices')"); settle(cl)
    cl.fill("#amount", "4500"); cl.fill("#receivedDate", "2026-10-01"); cl.fill("#bankRef", "LF-50PCT")
    cl.fill("input[name=alloc_amount]", "4500")
    cl.click("button:has-text('Record receipt')"); settle(cl); ok_notice(cl)
    cl.screenshot(path=f"{SHOTS}/08-receipt.png", full_page=True)
    fp.goto(inv_url); assert "Part paid" in fp.content()

    step("CTO proposes switching a historical developer fee to JV income; FO authorises")
    cp.goto(BASE + "/j/bullion/requisitions?status=historical")
    cp.click("text=BT-HIST-0013"); settle(cp)
    cp.click("text=Propose a change"); settle(cp)
    cp.select_option("#f_payFrom", "jv_income"); cp.fill("#f_endSupplier", "Developer (to confirm)")
    cp.fill("#reason", "Paid from the Land Fortune 50% receipt")
    cp.click("button:has-text('Send for authorisation')"); settle(cp); ok_notice(cp)
    cr_url = cp.url
    assert "You cannot authorise your own change" in cp.content()
    fp.goto(cr_url); fp.screenshot(path=f"{SHOTS}/09-change-request.png", full_page=True); fp.reload(); settle(fp)
    fp.once("dialog", lambda d: d.accept())
    fp.click("button:has-text('Authorise change')"); settle(fp); ok_notice(fp)
    assert "Authorised" in fp.content()

    step("Dashboard balances")
    fp.goto(BASE + "/j/bullion"); fp.wait_for_selector(".kpi")
    t = fp.content()
    fp.screenshot(path=f"{SHOTS}/10-fo-dashboard.png", full_page=True)
    # loan = 8593 + 285 - 1800 = 7078; income held = 4500 - 1800 = 2700
    assert "7,078.00" in t, "loan 7,078 missing"
    assert "2,700.00" in t, "income held 2,700 missing"

    step("PDFs and CSV")
    for path in [req_url.replace(BASE + "/j/bullion/requisitions/", "/api/pdf/bullion/requisition/"), inv_url.replace(BASE + "/j/bullion/invoices/", "/api/pdf/bullion/invoice/"), "/api/pdf/bullion/loan-statement/x?currency=USD", "/api/pdf/bullion/opening-balance/x"]:
        r = fp.request.get(BASE + path)
        assert r.status == 200 and r.headers["content-type"] == "application/pdf", (path, r.status, r.text()[:200])
        open(f"{SHOTS}/{path.split('/')[4]}.pdf", "wb").write(r.body())
    r = fp.request.get(BASE + "/api/export/bullion/ledger?currency=USD"); assert r.status == 200 and "Historical" in r.text() and "7078.00" in r.text(), r.text()[-300:]

    step("Director is read-only; other JV invisible")
    di, dp = login(pp, "dir@demo.local", "DemoPass2026x")
    dp.goto(BASE + "/j/bullion/ledger"); assert "Loan book" in dp.content()
    dp.goto(BASE + "/j/bullion/requisitions/new"); assert "This page is not available" in dp.content()
    r = dp.request.get(BASE + "/j/doesnotexist"); assert r.status == 404 or "not available" in r.text()

    step("Super Admin cannot open JV pages")
    r = sp.request.get(BASE + "/j/bullion/ledger"); assert "This page is not available" in r.text() and "Closing balance" not in r.text(), r.status

    for pg, name in [(fp, "11-requisition-list"), ]:
        pg.goto(BASE + "/j/bullion/requisitions?status="); pg.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)
    fp.goto(BASE + "/j/bullion/projects"); fp.screenshot(path=f"{SHOTS}/12-project-costs.png", full_page=True)
    for u, n in [(req_url, "14-requisition-detail"), (cr_url, "15-change-authorised"), (inv_url, "16-invoice")]:
        fp.goto(u); fp.wait_for_selector("h1"); fp.screenshot(path=f"{SHOTS}/{n}.png", full_page=True)
    fp.goto(BASE + "/j/bullion/ledger?currency=USD"); fp.screenshot(path=f"{SHOTS}/13-loan-book-final.png", full_page=True)
    print("JS errors:", errors)
    print("ALL STEPS PASSED")
    b.close()
