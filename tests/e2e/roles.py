import base64, hashlib, hmac, struct, time
from playwright.sync_api import sync_playwright
def totp(secret):
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8))
    h = hmac.new(key, struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest(); o = h[-1] & 15
    return "%06d" % ((struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000)
B="http://localhost:3000"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width":1440,"height":1000})
    pg.goto(B+"/login"); pg.fill("#email","tembanitich@outlook.com"); pg.fill("#password","ChangeMe!2026"); pg.click("button[type=submit]"); pg.wait_for_timeout(2500)
    pg.fill("#current","ChangeMe!2026"); pg.fill("#next","SuperAdmin2026pw"); pg.fill("#confirm","SuperAdmin2026pw"); pg.click("button[type=submit]"); pg.wait_for_timeout(3000)
    sec = pg.locator("code.secret").inner_text().replace(" ",""); pg.fill("#code", totp(sec)); pg.click("button[type=submit]"); pg.wait_for_timeout(3000)
    pg.goto(B+"/admin/users"); pg.click("text=Peter Coordinator"); pg.wait_for_timeout(1500)
    sel = pg.locator("select[id^=role_]")
    print("role fields:", sel.count(), "current:", sel.first.input_value())
    sel.first.select_option("finance_clerk"); pg.click("button:has-text('Save')"); pg.wait_for_timeout(2500)
    print("save:", pg.locator(".notice").all_inner_texts())
    pg.reload(); pg.wait_for_timeout(1500); print("now:", pg.locator("select[id^=role_]").first.input_value())
    pg.screenshot(path="/home/claude/shots/20-user-access.png", full_page=True)
    pg.goto(B+"/admin/users"); pg.fill("#name","New Clerk"); pg.fill("#email","new.clerk@earldeign.com"); pg.locator("select[id^=role_]").first.select_option("finance_clerk")
    pg.click("button:has-text('Create account')"); pg.wait_for_timeout(2500)
    print("create:", pg.locator(".notice").all_inner_texts()[0][:60])
    pg.reload(); pg.wait_for_timeout(1000); print("listed:", pg.locator("tr", has_text="new.clerk@earldeign.com").inner_text().replace("\t"," | "))
    b.close()
