/**
 * First-run seed. Safe to run more than once: existing records are left alone.
 * Creates the Super Admin, the Bullion Technologies JV and the CTO account with the CTO role.
 */
import "./env";
import { sql, eq } from "drizzle-orm";
import { db } from "../src/db";
import { jvs, memberships, users } from "../src/db/schema";
import { createJv } from "../src/services/admin";
import { hashPassword, temporaryPassword } from "../src/lib/passwords";

async function ensureUser(email: string, name: string, title: string, superAdmin: boolean) {
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (u) { console.log(`exists  ${email}`); return u; }
  const pw = process.env.SEED_INITIAL_PASSWORD || temporaryPassword();
  const [n] = await db.insert(users).values({ email: email.toLowerCase(), name, title, passwordHash: await hashPassword(pw), isSuperAdmin: superAdmin, mustChangePassword: true }).returning();
  console.log(`created ${email}  temporary password: ${pw}  (must be changed at first sign-in)`);
  return n;
}

async function main() {
  const sa = await ensureUser(process.env.SEED_SUPER_ADMIN_EMAIL ?? "tembanitich@outlook.com", "Tich Tembani (Super Admin)", "Super Admin", true);
  const cto = await ensureUser(process.env.SEED_CTO_EMAIL ?? "tich@bulliongroup.co.zw", "Tich Tembani", "CTO", false);
  let [jv] = await db.select().from(jvs).where(eq(jvs.code, "bullion"));
  if (!jv) {
    jv = await createJv(db, { userId: sa.id, isSuperAdmin: true }, {
      code: "bullion", shortCode: "BT", name: "Bullion Technologies JV",
      companyName: "Bullion Technologies Private Limited",
      companyAddress: "153 Sam Nujoma Street Extension, Belgravia, Harare, Zimbabwe",
      fundingPartner: "Bullion Technologies", currencies: ["USD", "ZAR", "ZWG"], vatRatePercent: "0",
      acquittalDays: "14",
    }, { projects: ["InstaTickets", "TrackStar / BusRep", "NMTAS", "NITS", "RoadPort", "General"] });
    console.log("created JV bullion (Bullion Technologies JV). Set the VAT rate, VAT/BP/TIN and tax clearance in the Super Admin console.");
  } else console.log("exists  JV bullion");
  await db.insert(memberships).values({ userId: cto.id, jvId: jv.id, role: "cto" }).onConflictDoNothing();
  console.log("CTO role on Bullion JV: ok");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
