import base64, hashlib, hmac, struct, time, subprocess
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
    pg.goto(B+"/admin/users"); pg.click("text=Chipo Clerk"); pg.wait_for_timeout(1500)
    pg.fill("#email","chipo.clerk@earldeign.com"); pg.fill("#phone","0772 111 222"); pg.click("button:has-text('Save')"); pg.wait_for_timeout(2500)
    print("admin:", pg.locator(".notice").all_inner_texts())
    pg.reload(); pg.wait_for_timeout(1500); pg.screenshot(path="/home/claude/shots/18-user-admin.png", full_page=True)
    c = b.new_page(viewport={"width":1440,"height":1000})
    c.goto(B+"/login"); c.fill("#email","pc@demo.local"); c.fill("#password","DemoPass2026x"); c.click("button[type=submit]"); c.wait_for_timeout(3000)
    c.goto(B+"/account/profile?jv=bullion"); c.fill("#name","Peter Coordinator (Ops)"); c.fill("#phone","+263 77 333 4444"); c.click("button:has-text('Save')"); c.wait_for_timeout(2500)
    print("self:", c.locator(".notice").all_inner_texts(), "email input present:", c.locator("input[name=email]").count())
    c.screenshot(path="/home/claude/shots/19-my-profile.png", full_page=True)
    b.close()
