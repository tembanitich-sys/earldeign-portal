# Earldeign Portfolio Portal

Finance and operations portal for Earldeign Investments joint ventures. First JV: Bullion Technologies (`bullion.earldeign.co.zw`).
The build brief is `SPEC.md`; build decisions and deviations are in `DECISIONS.md`; deployment is in `DEPLOY.md`.

## What it does

- **Independent JV spaces.** The Super Admin creates JVs; each has its own settings, users, numbering, currencies and books.
- **Requisitions:** Project Coordinator > CTO > Finance Officer > Finance Clerk disbursement > acquittal. CTO requisitions skip the CTO step.
- **Loan book:** one immutable ledger per JV, separate balances for USD, ZAR and ZWG (ZiG). Loan, JV income held, and net position.
- **Pay-from rule:** every disbursement is a drawdown; if paid from JV income it is offset automatically, linked to the receipts that funded it.
- **Income:** clients, invoice requests (CTO / Project Coordinator), invoices issued by the Finance Officer with fiscal number, external BusRep / InstaTickets invoices by reference, receipts with allocation, credit notes, debtors ageing.
- **Supplier invoices per project** (developer invoices) with payments linked, and a project cost view.
- **Dual authorisation:** posted records change only when the CTO and Finance Officer agree (one proposes, the other authorises). Underneath, the ledger reverses and re-posts; nothing is ever edited or deleted.
- **Historical import** of the manual cash recon (also dual-authorised), opening balance report with the recon sign-off block.
- **Controls:** period close, append-only audit log, 2FA mandatory for Super Admin and finance roles, account lockout, private file storage.
- **Documents:** PDF requisition (with signature blocks), tax invoice, receipt, loan statement, client statement, opening balance report; CSV exports.

## Run locally

```bash
cp .env.example .env            # set DATABASE_URL, APP_SECRET, SEED_INITIAL_PASSWORD
npm install
npm run db:migrate
npm run db:seed                 # Super Admin, Bullion JV, CTO account
npm run dev                     # http://localhost:3000
```

Tests: `npm test` (20 ledger and workflow tests against a real Postgres, database `portal_test`).
Browser test: `tests/e2e/run.py` (Playwright, drives the full Bullion scenario end to end).

## Brand

Built to Earldeign Brand Manual v1.2: tokens in `src/app/styles/tokens.css`, Inter for all interface text, tabular figures,
parentheses for negatives, ISO currency codes, status as word plus icon. **The logo files in `public/brand/` are placeholders**:
replace them with the master artwork (see `public/brand/README.md`).
