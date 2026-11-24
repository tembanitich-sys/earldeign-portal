/**
 * Preview and local testing only: adds demo users for each Bullion JV role.
 * Does nothing unless PREVIEW_DEMO=on, so it is safe in the production build command.
 */
import "./env";
import { sql, eq } from "drizzle-orm";
import { db } from "../src/db";
import { jvs, memberships, users, type Role } from "../src/db/schema";
import { hashPassword } from "../src/lib/passwords";

async function main() {
  if (process.env.PREVIEW_DEMO !== "on") { console.log("PREVIEW_DEMO is not on: no demo users created."); process.exit(0); }
  const [jv] = await db.select().from(jvs).where(eq(jvs.code, "bullion"));
  const pw = await hashPassword(process.env.DEMO_PASSWORD || "DemoPass2026x");
  const mk: [string, string, Role][] = [["fo@demo.local", "Farai Officer", "finance_officer"], ["fc@demo.local", "Chipo Clerk", "finance_clerk"], ["pc@demo.local", "Peter Coordinator", "project_coordinator"], ["dir@demo.local", "Dana Director", "director"]];
  for (const [email, name, role] of mk) {
    let [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (!u) [u] = await db.insert(users).values({ email, name, passwordHash: pw, mustChangePassword: false }).returning();
    await db.insert(memberships).values({ userId: u.id, jvId: jv.id, role }).onConflictDoNothing();
  }
  console.log("demo users ready");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
