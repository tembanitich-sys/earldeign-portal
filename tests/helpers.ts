import { db } from "@/db";
import { categories, memberships, projects, users, type Role } from "@/db/schema";
import { loadCtx, type Ctx } from "@/lib/access";
import { createJv } from "@/services/admin";
import { hashPassword } from "@/lib/passwords";
import { eq, and } from "drizzle-orm";

let n = 0;

export async function makeUser(name: string, opts: { superAdmin?: boolean } = {}) {
  n++;
  const [u] = await db.insert(users).values({
    email: `${name.toLowerCase().replace(/\W/g, "")}${n}-${Date.now()}@test.local`, name, passwordHash: await hashPassword("x-placeholder-123"),
    isSuperAdmin: Boolean(opts.superAdmin), mustChangePassword: false,
  }).returning();
  return u;
}

export type World = {
  jv: Awaited<ReturnType<typeof createJv>>;
  admin: { userId: string; isSuperAdmin: true };
  cto: Ctx; pc: Ctx; fo: Ctx; fc: Ctx; viewer: Ctx;
  projectId: (name: string) => Promise<string>;
  categoryId: (name: string) => Promise<string>;
};

export async function world(code?: string): Promise<World> {
  n++;
  const sa = await makeUser("Super Admin", { superAdmin: true });
  const admin = { userId: sa.id, isSuperAdmin: true as const };
  const c = code ?? `jv${n}${Math.floor(Math.random() * 1e6)}`;
  const short = ("T" + Math.random().toString(36).replace(/[^a-z]/g, "").toUpperCase()).slice(0, 4).padEnd(4, "X");
  const jv = await createJv(db, admin, {
    code: c, shortCode: short, name: `Test JV ${c}`, companyName: "Bullion Technologies Private Limited", fundingPartner: "Bullion Technologies",
    currencies: ["USD", "ZAR", "ZWG"], vatRatePercent: "15.5",
  }, { projects: ["InstaTickets", "TrackStar / BusRep", "General"] });
  const mk = async (name: string, role: Role) => {
    const u = await makeUser(name);
    await db.insert(memberships).values({ userId: u.id, jvId: jv.id, role });
    return (await loadCtx(db, u.id, jv.code))!;
  };
  return {
    jv, admin,
    cto: await mk("CTO", "cto"),
    pc: await mk("Coordinator", "project_coordinator"),
    fo: await mk("Finance Officer", "finance_officer"),
    fc: await mk("Finance Clerk", "finance_clerk"),
    viewer: await mk("Director", "director"),
    projectId: async (name) => (await db.select().from(projects).where(and(eq(projects.jvId, jv.id), eq(projects.name, name))))[0].id,
    categoryId: async (name) => (await db.select().from(categories).where(and(eq(categories.jvId, jv.id), eq(categories.name, name))))[0].id,
  };
}

export const line = (desc: string, amount: string) => ({ description: desc, quantity: "1", unitCost: amount });
