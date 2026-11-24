# Build decisions and deviations from SPEC.md

| # | Decision | Why |
|---|---|---|
| 1 | Own session auth (argon2id, httpOnly cookie, 12 h absolute / 30 min idle, TOTP) instead of Auth.js | Fewer moving parts for credentials plus TOTP; same security properties. |
| 2 | Finance Officer is the CTO's counter-party for dual authorisation | Tich referred to a "Finance Manager"; no such role exists in the spec. If Bullion has one, add the role and switch `AUTHORISING_ROLES`. |
| 3 | Super Admin cannot see JV books, only admin screens and the platform audit log | Strict segregation; the CTO account sees the books. |
| 4 | Ledger stores signed `loan_delta` and `income_delta`; balances are sums per currency | Simple, auditable; reversal is the exact negative. DB triggers block UPDATE, DELETE and TRUNCATE on the ledger and audit log. |
| 5 | Change returned on acquittal is dated on the acquittal approval date | That is when the cash comes back. |
| 6 | A change request can change a requisition's amount only if it has one line | Multi-line amounts would need line-level editing; raise a correcting requisition instead. |
| 7 | A requisition links to at most one supplier invoice | Covers the developer-invoice case; split payments into separate requisitions. |
| 8 | Linking JV-income payments to specific receipts is FIFO and informational | The income-held balance in the ledger is authoritative. |
| 9 | Closed months cannot be reopened in the portal | Corrections go through dual-authorised change requests flagged as prior period adjustments. |
| 10 | Functional colours (Brand Manual section 4) are off by default; gains and losses in Deep Ink with signs/parentheses | Both are awaiting the brand owner's decision. Turn on with `FUNCTIONAL_COLOURS=on`. Error messages always use the Negative colour plus an icon, as section 5 requires. |
| 11 | ZiG uses ISO code ZWG | Brand Manual section 7 uses ZWG. |
| 12 | Validation errors show at the top of the form with an icon, not under each field | Brand Manual section 7 asks for messages under the field. Messages name the field and say how to fix it; per-field placement is a follow-up. |
| 13 | Actions that stay on the same page refresh the page instead of redirecting; no route-level loading boundary | Next.js 15 intermittently left the form stuck on "Working" after same-page redirects and with a loading boundary; found in browser testing. |
| 14 | Logo files are clearly marked placeholders | Brand Manual section 9: developers use the master artwork only, never redraw it. |
| 15 | PDFs carry the front-facing company's letterhead (Bullion Technologies), not the Earldeign logo | Invoices and receipts are Bullion's documents; Earldeign appears only in the footer line. |
| 16 | Each JV shows its own logo (sidebar, sign-in page on its subdomain, PDFs); Earldeign branding on the Super Admin console and default sign-in. Layout, type and colours stay on the Earldeign design system for every JV | One product to maintain and keep accessible; JV users still see their own company. Logos are PNG/JPG only because SVG files can carry scripts. |
| 17 | Notifications go out three ways: in the portal, by email (SMTP), and by SMS for items needing action and for decisions. "Invoice issued" and "receipt recorded" are email only | Keeps SMS short and limited to things a person must act on. Delivery happens after the database commit, so a failed email or SMS never blocks the work. |
| 18 | SMS gateway is configured with environment variables (`SMS_*`), not hard-coded | Econet's API details are pending; switching to another provider needs no code change. Sender ID is limited to 11 letters or digits. |
| 19 | Hard rule: one person holds at most one role per JV, enforced by a unique database index. Roles are set with one field per JV on the user's Account panel and when creating the user | Lean, auditable JVs; no doubled-up access. Cover for absence by changing the role for the period (audited), not by adding a second one. Migration 0004 removed extra roles, keeping the most recently given one, and logged each removal. |
