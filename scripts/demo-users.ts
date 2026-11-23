/** Local testing only: adds demo users for each Bullion JV role. Never run against production. */
import "./env";
import { sql, eq } from "drizzle-orm";
import { db } from "../src/db";
import { jvs, memberships, users, type Role } from "../src/db/schema";
import { hashPassword } from "../src/lib/passwords";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to create demo users in production.");
  const [jv] = await db.select().from(jvs).where(eq(jvs.code, "bullion"));
  const pw = await hashPassword("DemoPass2026x");
  const mk: [string, string, Role][] = [["fo@demo.local", "Farai Officer", "finance_officer"], ["fc@demo.local", "Chipo Clerk", "finance_clerk"], ["pc@demo.local", "Peter Coordinator", "project_coordinator"], ["dir@demo.local", "Dana Director", "director"]];
  for (const [email, name, role] of mk) {
    let [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (!u) [u] = await db.insert(users).values({ email, name, passwordHash: pw, mustChangePassword: false }).returning();
    await db.insert(memberships).values({ userId: u.id, jvId: jv.id, role }).onConflictDoNothing();
  }
  console.log("demo users ready (password DemoPass2026x)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
