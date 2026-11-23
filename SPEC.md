# Earldeign Portfolio Portal: Build Specification

Version 1.0, 23 November 2026
Owner: Tich Tembani (Earldeign Investments (Pvt) Ltd)
First JV: Bullion Technologies JV, served at `bullion.earldeign.co.zw`

This file is the project brief for the developer (Claude Code). Read it fully before writing code. Where this spec is silent, choose the simplest option that keeps the ledger correct and auditable, and record the decision in `DECISIONS.md`.

---

## 1. Purpose

A web portal owned by Earldeign Investments that gives Earldeign and each JV partner a single, real-time source of truth for a joint venture's money:

- Expenses funded by the partner (requisitions, approvals, disbursements, acquittals)
- The **loan book**: what the JV owes the funding partner (interest free)
- JV income: invoices, receipts, debtors
- Printable documents for signature and filing; the system remains the source of truth for reconciliation

The portal is **multi-JV** from day one. Bullion Technologies is the first JV. Future JVs (brought in by Earldeign shareholders) are added as new spaces with their own subdomain, users, settings and books.

## 2. Glossary

| Term | Meaning |
|---|---|
| Organisation | Earldeign Investments, the owner of the platform |
| JV | A joint venture space. Each JV has a front-facing company, a funding partner, its own users, numbering, currencies and books |
| Front-facing company | The legal entity that appears on JV documents (for the Bullion JV: Bullion Technologies Private Limited) |
| Funding partner | The party advancing funds to the JV (for the Bullion JV: Bullion Technologies) |
| Drawdown | A ledger entry that increases the loan (the JV owes more) |
| Offset | A ledger entry that reduces the loan |
| Income held | JV income received into the funding partner's account and not yet applied to JV expenses |
| Net position | Loan balance minus income held, per currency |

## 3. Technology and hosting

### 3.1 Stack
- **Next.js (App Router), TypeScript**, server components and server actions
- **PostgreSQL 15+** via **Drizzle ORM** with versioned migrations
- **Auth.js** (credentials provider) with **TOTP two-factor authentication**, passwords hashed with argon2id
- **Storage adapter interface** for attachments with two implementations: S3-compatible / Vercel Blob (production on Vercel) and local disk (for a future VPS). Files never served from a public path; downloads go through an authorised route
- **Email via SMTP** (nodemailer) so the provider can be Resend SMTP, Vertico SMTP or any other without code changes
- **PDF generation** with `@react-pdf/renderer`; QR codes with `qrcode`
- UI: Tailwind CSS with a simple component library (shadcn/ui acceptable)
- Validation: Zod on every server action
- Money stored as **integer minor units** (cents) with a currency code. Never use floating point for money

### 3.2 Hosting
- Initial: **Vercel Pro** with **Neon PostgreSQL** (point-in-time recovery enabled)
- Domain `earldeign.co.zw` registered with Vertico in the name of Earldeign Investments (Pvt) Ltd; `bullion.earldeign.co.zw` points to Vercel
- **Portability requirement:** no Vercel-only runtime features (no Edge Config, no KV). `next build` with `output: "standalone"` must run on a plain Node 20 server. Provide a `Dockerfile` and a `DEPLOY.md` covering both Vercel and a Linux VPS
- Configuration only through environment variables, documented in `.env.example`

### 3.3 Tenancy (multi-JV)
- Every business table carries `jv_id`. Every query is scoped by the current JV, enforced in one data-access layer, not in individual pages
- The JV is resolved from the subdomain (`bullion.` maps to the Bullion JV). Users with access to several JVs can switch JV inside the app
- **Hard rule:** a user without a role in a JV must never see any data from that JV. Automated tests must prove this (section 14)
- **Creating a JV:** the Super Admin creates a new JV from the platform admin screen. This opens a new, fully independent JV space: its own settings, front-facing company, currencies, projects, categories, numbering sequences (starting at 0001), users, ledger and documents. Nothing is shared with or copied from another JV, except optional "copy categories from" at creation
- A new JV is reachable at its own subdomain once a DNS record is added for it (e.g. `newjv.earldeign.co.zw`). The app also serves every JV at `portal.earldeign.co.zw/{jv-code}` so a JV works before its DNS record exists. Document in `DEPLOY.md` how to add a subdomain in Vercel and at the DNS provider

## 4. Roles and permissions

### 4.1 Platform level
| Role | Scope |
|---|---|
| **Super Admin** | Creates JVs, users and role assignments; edits JV settings; views audit logs. **Cannot create, approve, disburse, invoice or post any financial entry** |
| **Earldeign Director / Shareholder** | Read-only access to the JVs assigned to them (one, several or all) |

### 4.2 JV level (assigned per JV; a user can hold different roles in different JVs)
| Role | Main permissions |
|---|---|
| **CTO** | Create requisitions and invoice requests; review Project Coordinator submissions; view all JV data and reports |
| **Project Coordinator** | Create requisitions and invoice requests (always routed to CTO first); view own submissions and their status |
| **Finance Officer** | Review, approve, reject or return requisitions; confirm pay-from source; create and issue invoices; record exchange rates; approve acquittals; post reversals; sign off opening balance and period closes |
| **Finance Clerk** | Prepare and disburse approved requisitions (cash or bank transfer); record receipts; capture acquittal documents |
| **Partner Viewer / Auditor** | Read-only: loan book, debtors, documents, reports, audit trail |

### 4.3 Segregation rules (enforced in code)
- Nobody approves a document they created
- The Finance Clerk who disburses cannot be the Finance Officer who approved the same requisition
- Super Admin accounts cannot hold JV transacting roles
- Every role change is written to the audit log
- **Dual authorisation for ledger changes** (section 6.6): CTO and Finance Officer are the two authorising parties for the JV. A change initiated by one only takes effect when authorised by the other

### 4.4 Seed users
| Email | Role |
|---|---|
| tembanitich@outlook.com | Super Admin |
| tich@bulliongroup.co.zw | CTO, Bullion Technologies JV |

Other users are created by the Super Admin after deployment. First login forces password change and 2FA enrolment.

## 5. JV settings

Per JV, editable by Super Admin:
- JV name, short code (used in numbering, e.g. `BT`), subdomain
- Front-facing company: registered name, registered address, phone, email, logo
- Tax: VAT registration number, BP number, TIN, tax clearance certificate number and **expiry date** (dashboard warning 30 days before expiry), VAT rate (configurable, default stored as a setting, never hard-coded)
- Funding partner name
- Enabled currencies (Bullion JV: **USD, ZAR, ZiG**)
- Monthly budget per currency (optional, for budget vs actual)
- Projects (Bullion JV seed: InstaTickets, TrackStar / BusRep, NMTAS, NITS, RoadPort, General)
- Expense categories (seed: Development, Development / consulting, Hosting & infrastructure, Travel & transport, Equipment (asset), Office equipment & supplies, Licences & compliance, Other)
- Bank accounts of the front-facing company used for receipts (name, bank, currency) for display on invoices
- Bullion JV seed: Bullion Technologies Private Limited, 153 Sam Nujoma Street Extension, Belgravia, Harare, Zimbabwe

## 6. The ledger (core of the system)

### 6.1 Principles
- One `ledger_entries` table per the whole platform, scoped by `jv_id`
- **Separate balance per currency.** Balances are never summed across currencies
- Entries are **immutable**: no update, no delete. Corrections are reversal entries linked to the original
- Every entry links to its source document (requisition, receipt, conversion, opening balance, reversal)
- Closed periods are locked; posting into a locked period is rejected

### 6.2 Entry types
| Type | Effect | Created by |
|---|---|---|
| `opening_balance` | Sets historical position (itemised historical entries) | Import, approved as a batch |
| `drawdown` | Loan +amount | Disbursement of any requisition |
| `income_applied_offset` | Loan -amount; income held -amount | Automatic, when a requisition paid from JV income is disbursed |
| `advance_refund` | Loan -amount | Acquittal where cash change is returned |
| `receipt` | Income held +amount (does **not** change the loan) | Recording a client payment |
| `conversion_out` / `conversion_in` | Moves value between currency balances at a recorded rate | Finance Officer |
| `reversal` | Exact negative of the linked entry | Finance Officer, with mandatory reason |

### 6.3 Balances (per JV, per currency)
- **Loan balance** = sum(drawdown + opening_balance) - sum(income_applied_offset + advance_refund), adjusted by reversals
- **Income held** = sum(receipt) - sum(income_applied_offset), adjusted by conversions and reversals
- **Net position** = loan balance - income held

### 6.4 Pay-from rule
- Every requisition has `pay_from`: `funding_partner` or `jv_income`. Requester proposes; Finance Officer confirms at approval
- On disbursement **both** cases post a `drawdown` for the full amount (so the loan statement shows full JV spend)
- If `jv_income`, the system also posts an `income_applied_offset` of the same amount and currency, linked to the receipt(s) it draws from
- A `jv_income` disbursement is blocked if income held in that currency is less than the amount
- Cross-currency funding requires a conversion entry first

### 6.5 Worked example (must pass as an automated test)
1. Invoice Land Fortune USD 9,000: receivable USD 9,000; loan unchanged; income held unchanged
2. Receipt USD 4,500 against that invoice: receivable USD 4,500; income held USD 4,500; loan unchanged
3. Requisition USD 4,500, pay from JV income, disbursed: drawdown USD 4,500 and income_applied_offset USD 4,500; loan net change 0; income held USD 0

### 6.6 Changing posted records (dual authorisation)
Users see this as "editing"; underneath, the ledger stays immutable.

- Only the **CTO** or the **Finance Officer** can propose a change to a posted record (ledger entry, requisition, historical entry, invoice, receipt, supplier invoice)
- The proposal is a **change request**: which record, which fields, old value, new value, mandatory reason, optional attachment
- A pending change request has **no effect** on balances, reports or documents. The record shows a "change pending" badge
- The **counter-party** (CTO if the Finance Officer proposed it, and vice versa) authorises or declines it. Nobody can authorise their own change request
- On authorisation the system automatically posts a `reversal` of the original entry and a new corrected entry, both linked to the change request. Reports show the corrected figures; the record's history shows original, change, reason, proposer, authoriser and timestamps
- Changes to entries in a closed period are allowed through the same flow and are labelled "prior period adjustment" on reports
- Exempt from dual authorisation (single user, still audited): adding attachments, adding comments
- Fields requiring dual authorisation: amount, currency, date, pay-from, project, category, payee, end supplier, linked invoice, description
- Notifications: counter-party is emailed when a change request is raised; proposer is emailed on decision

## 7. Workflows

### 7.1 Requisition
States: `draft` > `submitted` > `cto_review` (only if created by Project Coordinator) > `finance_review` > `approved` > `disbursed` > `acquittal_pending` > `closed`

Side states: `returned` (back to creator for correction, keeps history), `rejected` (final, reason required), `cancelled` (by creator before approval)

Rules:
- CTO-created requisitions go straight to `finance_review`
- Project Coordinator requisitions must pass CTO review; there is no route from Project Coordinator directly to finance
- On `disbursed` the ledger posts (section 6.4). Disbursement captures method (cash or bank transfer), date, reference, proof of payment upload, disbursing clerk
- **Acquittal:** creator uploads supplier invoices/receipts and states actual spend. If actual < disbursed, record change returned (posts `advance_refund`). If actual > disbursed, a supplementary requisition is raised. Finance Officer approves the acquittal to close
- Overdue acquittals (default 14 days after disbursement, configurable) appear on the dashboard

Fields:
- Number `{JV}-REQ-{YYYY}-{0001}`, date, requester, project, category, currency, urgency (normal / urgent), required-by date
- Line items: description, quantity, unit cost, line total (computed)
- Justification, payee name, **end supplier** (if different from payee), payment method, payee bank details (for transfers)
- Attachments: quotations, supplier invoices
- Approval history: actor, role, action, timestamp, comment

### 7.2 Invoice request
States: `draft` > `submitted` > `cto_review` (Project Coordinator only) > `finance_review` > `invoiced` | `rejected` | `returned`

Fields: client, project, description of work/services, amounts and currency, supporting documents, requested due date. The Finance Officer converts an approved request into an invoice in one click.

### 7.3 Invoice (issued by Finance Officer only)
- Number `{JV}-INV-{YYYY}-{0001}`, client, issue date, due date, currency, line items, VAT per line (rate from settings, can be zero-rated), totals
- **Fiscal invoice number** field (from the front-facing company's fiscal device), required before status can move to `issued`
- States: `draft` > `issued` > `part_paid` > `paid`; `credit_noted` via credit note document (`{JV}-CN-{YYYY}-{0001}`)
- Ageing buckets: current, 30, 60, 90+ days

### 7.4 External invoices (BusRep / TrackStar, InstaTickets)
- Recorded, not generated: source system, external invoice number, client, date, currency, amount, PDF upload, optional project
- Unique constraint on (`jv_id`, source system, external number)
- Receipts allocate to external invoices the same way as to native invoices
- Phase 2: API ingestion from those systems

### 7.5 Receipt (recorded by Finance Clerk)
- Number `{JV}-RCT-{YYYY}-{0001}`, client, date received, currency, amount, method, bank reference, proof upload
- Allocation to one or more open invoices (native or external); unallocated remainder held as client credit
- Posts `receipt` to the ledger

### 7.6 Clients
Name, contact person, email, phone, address, VAT number (optional). Statement of account per client.

### 7.7 Period close and opening balance
- Finance Officer closes a month; closed months reject new postings except authorised change requests (6.6)
- The ledger opens **as is** from the historical import (section 11). The import itself follows dual authorisation: one party uploads, the counter-party authorises, then all entries become active together
- Corrections to imported rows (e.g. funding source, supplier, project) are made afterwards through change requests (6.6)
- Items not in the manual recon (e.g. the Land Fortune invoice and receipt) are captured after go-live as normal records, dated with their actual dates. Periods before go-live stay open until these catch-up items are captured
- An opening balance report (totals per currency, per category, list of flagged rows) is printable with the recon sign-off block: Prepared by, Checked by, Checked by, CEO

### 7.8 Supplier invoices (e.g. developer invoices per project)
Tracks what the JV owes its suppliers, separately from the loan book.

- Recorded by Finance Officer or CTO: supplier, supplier invoice number, date, currency, line items each tagged with a **project**, total, PDF upload
- Unique constraint on (`jv_id`, supplier, supplier invoice number)
- Requisitions can be linked to one or more supplier invoices as payments against them. Historical entries can be linked the same way (through a change request if already posted)
- Outstanding payable = invoice total - linked disbursed payments
- States: `open` > `part_paid` > `paid`; `disputed` flag with comment
- **Project cost view:** per project and currency: total invoiced by suppliers, paid to date (split by funded by partner vs JV income), outstanding payable. Example: InstaTickets total development cost, paid to date, balance owed to developers
- Loan rule unchanged: the loan increases only when a payment is disbursed (drawdown), never when a supplier invoice is recorded. A supplier invoice is a commitment, not a loan movement
- Dashboard tile: outstanding supplier payables per currency
- Report: supplier statement and payables ageing

## 8. Documents (PDF)

All documents carry: front-facing company letterhead, document number, QR code linking to the record's verification page (authenticated), generated timestamp, and page numbers.

| Document | Specifics |
|---|---|
| Requisition | All fields in 7.1; approval history; signature blocks for Requested by, Reviewed by (CTO), Approved by (Finance Officer), Disbursed by (Finance Clerk), Received by; acquittal section |
| Invoice | Tax details (VAT no, BP no, TIN), fiscal invoice number, bank details, line items with VAT, totals |
| Receipt | Amount in figures and words, allocation to invoices |
| Credit note | Linked invoice, reason |
| Loan statement | Per currency: date, reference, description, drawdown, offset, running balance; summary of loan, income held, net position; date range filter |
| Client statement | Invoices, receipts, balance, ageing |

Signed scans can be uploaded back against the record (`signed_copy` attachment type).

## 9. Dashboard and reports

Dashboard per JV, per currency tiles: loan balance, income held, net position, receivables, month-to-date spend vs budget. Lists: items awaiting my action, overdue acquittals, overdue invoices, tax clearance expiry warning.

Reports (filterable by date range, project, category, currency; export CSV and PDF): loan statement, spend by project, spend by category, debtors ageing, requisition register, invoice register, receipt register, audit log.

Directors with access to several JVs see a portfolio summary: one row per JV per currency.

## 10. Notifications

Email on: submission awaiting my review, returned, rejected, approved, disbursed, acquittal due/overdue, invoice request awaiting action, invoice issued, receipt recorded, tax clearance expiry. In-app notification list mirrors emails.

## 11. Historical import

Input: `Bullion_JV_historical_import.csv` (prepared from the manual cash recon, 22 rows, USD 8,593 total as at 11 Nov 2026).

Columns: `entry_ref, date, jv, currency, payee, end_supplier, description, category, project, amount, pay_from, entry_type, requisition_ref, receipt_ref, supporting_docs, review_flags`

Behaviour:
- Admin upload screen with a preview, validation errors per row, and totals per currency before committing
- Each row becomes a historical requisition record (status `closed`, flagged `historical`) plus an `opening_balance` ledger entry. Entries are inactive until the counter-party authorises the import (7.7), then activate together
- `review_flags` and `supporting_docs = Missing` are shown as warnings on the record until resolved
- Missing historical items can be added later through the historical form, which follows dual authorisation
- Developer fee rows can be linked to supplier invoices (7.8) once those are recorded

## 12. Security and audit

- 2FA mandatory for Super Admin, Finance Officer, Finance Clerk; optional (configurable) for others
- Session timeout after 30 minutes idle; login rate limiting and lockout after repeated failures
- Audit log for every create, state change, posting, reversal, login, failed login, role change and settings change: actor, timestamp, IP, before/after values
- Attachments: type and size limits (PDF, JPG, PNG, XLSX; 10 MB), stored privately, served through authorised download route
- Daily automated database backup plus provider point-in-time recovery; documented restore procedure in `DEPLOY.md`

## 13. Build phases

1. **Foundation:** project setup, database schema and migrations, auth with 2FA, tenancy layer, roles, Super Admin user and JV management, JV settings, audit log
2. **Ledger and requisitions:** ledger engine with balance calculations and tests, requisition workflow end to end, disbursement, acquittal, requisition PDF
3. **Income:** clients, invoice requests, invoices, credit notes, external invoices, receipts and allocation, conversions, PDFs
4. **Migration and reporting:** historical import and sign-off, dashboard, reports, loan and client statements, period close, notifications
5. **Hardening and deployment:** tenancy and permission tests, backup and restore drill, Vercel deployment, `DEPLOY.md`, handover to Blessing

Each phase ends with seeded demo data and a short walkthrough note.

## 14. Acceptance tests (automated, must pass)

1. Worked example in 6.5 produces exactly the stated balances
2. Balances in different currencies are never combined in any query, report or dashboard tile
3. Project Coordinator requisition cannot reach finance without CTO approval
4. A user cannot approve their own requisition; approver and disburser must differ
5. Super Admin cannot post any financial entry
6. A user with roles only in JV A receives no data from JV B on any page, API route, download or report
7. Ledger rows cannot be updated or deleted at database level (revoke UPDATE/DELETE or use triggers); reversal restores the prior balance
8. `jv_income` disbursement is blocked when income held in that currency is insufficient
9. Posting into a closed period is rejected
10. Duplicate external invoice number from the same source system is rejected
11. Historical import of the supplied CSV totals USD 8,593 and stays inactive until the counter-party authorises it
12. Acquittal with change returned reduces the loan by the change amount
13. A change request has no effect on any balance until authorised; the proposer cannot authorise it; on authorisation balances reflect the new value and the history shows both
14. A new JV created by Super Admin starts with empty books and numbering at 0001, and no Bullion JV user can see it
15. Supplier invoice USD 5,000 for InstaTickets with two linked payments of USD 1,000: outstanding payable USD 3,000; project cost view shows invoiced 5,000, paid 2,000; loan increased by 2,000 only

## 15. Out of scope for v1 (phase 2)

API integration with BusRep / TrackStar and InstaTickets; bank statement import and automatic reconciliation; asset register (laptop, printers flagged in import); budgets per project; mobile app; the public Earldeign website.

## 16. Open items (business, not development)

These do not block the build. They are resolved after go-live through normal capture or change requests:

1. Capture the Land Fortune invoice (USD 9,000) and receipt (USD 4,500) with actual dates; if that receipt paid for expenses already in the recon, change those rows to pay-from JV income
2. Record developer supplier invoices per project and link the historical developer fee payments to them
3. Fill end supplier for the 17 rows paid via T Tembani
4. Confirm whether the two Vertico USD 30 payments (19 Oct, 6 Nov) are separate
5. Confirm the Phils & Phats USD 1,500 deposit belongs to the Bullion JV
6. Tag each historical row with a project
7. Confirm hosting with Vertico's response; spec assumes Vercel Pro + Neon
