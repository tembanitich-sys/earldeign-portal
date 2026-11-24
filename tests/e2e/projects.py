from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width":1440,"height":1000})
    pg.goto("http://localhost:3000/login"); pg.fill("#email","tich@bulliongroup.co.zw"); pg.fill("#password","ChangeMe!2026"); pg.click("button[type=submit]"); pg.wait_for_timeout(2500)
    pg.fill("#current","ChangeMe!2026"); pg.fill("#next","CtoPassword2026"); pg.fill("#confirm","CtoPassword2026"); pg.click("button[type=submit]"); pg.wait_for_timeout(3000)
    pg.goto("http://localhost:3000/j/bullion/projects"); pg.fill("#name","ZimBNB"); pg.click("button:has-text('Add project')"); pg.wait_for_timeout(2500)
    print("added:", "ZimBNB" in pg.content(), pg.locator(".notice").all_inner_texts())
    pg.screenshot(path="/home/claude/shots/17-projects.png")
    pg.goto("http://localhost:3000/j/bullion/requisitions/new"); print("in form:", pg.locator("#projectId option", has_text="ZimBNB").count())
    b.close()
