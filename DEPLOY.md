# Deploying

## Option A (recommended now): Vercel Pro + Neon, domain at Vertico

1. **Database.** In Vercel, add Neon Postgres from the Marketplace (or create a Neon project directly). Turn on point-in-time recovery.
   Copy the pooled connection string into `DATABASE_URL`.
2. **File storage.** In Vercel, create a Blob store. Set `STORAGE_DRIVER=blob`; Vercel provides `BLOB_READ_WRITE_TOKEN`.
   Files are stored with **private** access and served only through the portal's authorised download route.
3. **Email.** Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (Vertico mailbox SMTP or Resend SMTP).
   Ask Vertico to add SPF, DKIM and DMARC records for `earldeign.co.zw`. Without SMTP, notifications still appear in the portal.
4. **Other variables.** `APP_URL=https://bullion.earldeign.co.zw`, `ROOT_DOMAIN=earldeign.co.zw`, `APP_SECRET` (random, 32+ bytes),
   `FUNCTIONAL_COLOURS=off` until the brand owner approves the functional colours.
5. **Project.** Push this repository to GitHub, import it in Vercel (framework: Next.js). Build command `npm run build`.
6. **Migrate and seed** (once, from any machine with the production `DATABASE_URL` in `.env`):
   `npm run db:migrate && SEED_INITIAL_PASSWORD='<strong temporary>' npm run db:seed`
   Then sign in as the Super Admin, change the password, enrol two-factor, complete the Bullion JV settings (VAT rate, VAT/BP/TIN,
   tax clearance and expiry, bank accounts), and create the finance users.
7. **Domains.** In Vercel add `bullion.earldeign.co.zw` (and `portal.earldeign.co.zw` if wanted). At Vertico's DNS, add the CNAME
   records Vercel shows. **Each new JV** needs its own subdomain added in Vercel and at the DNS provider; until then it works at
   `portal.earldeign.co.zw/j/<code>`.
8. **Never run** `scripts/demo-users.ts` against production.

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
