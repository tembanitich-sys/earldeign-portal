# Deploying

**Hosting decision (24 Nov 2026):** everything runs on Vercel (app, Neon database, Blob files).
- **Testing:** project `earldeign-portal-preview` on its free `*.vercel.app` address, with demo users (`PREVIEW_DEMO=on`). Leave `ROOT_DOMAIN` unset.
- **Go-live:** a separate production project and fresh database on one custom address, e.g. `portal.earldeign.com`.
  JVs live at `/j/<code>` (Bullion: `/j/bullion`, branded sign-in at `/login?jv=bullion`), so a new JV needs no DNS change.
  Per-JV subdomains remain possible later by setting `ROOT_DOMAIN` and adding a DNS record per JV.

## Option A (recommended now): Vercel Pro + Neon, domain at Vertico

1. **Database.** In Vercel, add Neon Postgres from the Marketplace (or create a Neon project directly). Turn on point-in-time recovery.
   Copy the pooled connection string into `DATABASE_URL`.
2. **File storage.** In Vercel, create a Blob store. Set `STORAGE_DRIVER=blob`; Vercel provides `BLOB_READ_WRITE_TOKEN`.
   Files are stored with **private** access and served only through the portal's authorised download route.
3. **Email.** Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (Vertico mailbox SMTP or Resend SMTP).
   Ask Vertico to add SPF, DKIM and DMARC records for `earldeign.co.zw`. Without SMTP, notifications still appear in the portal.
4. **Other variables.** `APP_URL=https://portal.earldeign.com` (no trailing slash), `ROOT_DOMAIN` unset unless you use per-JV subdomains, `APP_SECRET` (random, 32+ bytes),
   `FUNCTIONAL_COLOURS=off` until the brand owner approves the functional colours.
5. **Project.** Push this repository to GitHub, import it in Vercel (framework: Next.js). Build command `npm run build`.
6. **Migrate and seed** (once, from any machine with the production `DATABASE_URL` in `.env`):
   `npm run db:migrate && SEED_INITIAL_PASSWORD='<strong temporary>' npm run db:seed`
   Then sign in as the Super Admin, change the password, enrol two-factor, complete the Bullion JV settings (VAT rate, VAT/BP/TIN,
   tax clearance and expiry, bank accounts), and create the finance users.
7. **Domain (go-live only).** In Vercel add `portal.earldeign.com`, then add the CNAME record Vercel shows at the earldeign.com DNS
   provider. Printed QR codes point at this address, so keep it stable.
8. The Vercel build (`vercel-build`) runs migrations and the seed automatically. Demo users are created only when `PREVIEW_DEMO=on`: set it **only** on the Preview environment, never on Production.

Every later release: push to the main branch; Vercel builds and deploys. Run `npm run db:migrate` when a release adds a migration.

## Option B: Linux VPS (if Vertico offers Node.js hosting)

Requirements: Node 20+, PostgreSQL 15+, a reverse proxy with TLS (nginx or Caddy).

```bash
npm ci && npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
npm run db:migrate
STORAGE_DRIVER=local STORAGE_DIR=/var/lib/earldeign/files PORT=3000 node .next/standalone/server.js
```

Or with Docker: `docker build -t earldeign-portal . && docker run --env-file .env -p 3000:3000 -v /var/lib/earldeign/files:/data earldeign-portal`.
Run it under systemd or Docker restart policy, back up the database nightly (`pg_dump`) and the files folder, and store backups off the server.

## Backup and restore drill (do this before go-live)

1. Neon: create a branch from a point in time 10 minutes ago; point a preview deployment's `DATABASE_URL` at it; confirm the loan book matches.
2. VPS: restore last night's `pg_dump` into a scratch database and open the loan book against it.

## Notifications: email and SMS

Every request that needs someone's action, and every decision, appears in the portal, is emailed, and is sent by SMS
to users with a mobile number (Super Admin > Users > the person > Mobile number). Delivery runs after each action.

**Email.** Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (e.g. `Earldeign Portal <noreply@earldeign.com>`).
Add SPF/DKIM for the sending domain so messages are not marked as spam.

**SMS (Econet Zimbabwe SMS HTTP API).**
```
SMS_DRIVER=econet
SMS_API_KEY=<API key from the Econet messaging portal>
SMS_SENDER_ID=<approved sender ID, max 11 letters/digits, e.g. EarldeignJV>
# SMS_API_BASE=https://mobilemessaging.econet.co.zw   (default)
```
Redeploy after changing variables, then use **Send test SMS** on a user's page. The reply from Econet is shown
(code 000 means accepted). SMS text is plain ASCII and kept to one 160-character message including the link.
