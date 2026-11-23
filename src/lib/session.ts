import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, sessions, users } from "@/db/schema";
import { can, loadCtx, type Ctx, type Perm } from "./access";

const COOKIE = "ei_session";
const ABSOLUTE_HOURS = 12;
const IDLE_MINUTES = 30;

export type SessionUser = typeof users.$inferSelect;

const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export async function createSession(userId: string, twoFactorPassed: boolean) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ABSOLUTE_HOURS * 3600_000);
  await db.insert(sessions).values({ id: sha(token), userId, twoFactorPassed, expiresAt, ip: await clientIp() });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha(token)));
  jar.delete(COOKIE);
}

export async function getSession(): Promise<{ session: typeof sessions.$inferSelect; user: SessionUser } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.id, sha(token)));
  if (!row) return null;
  const now = Date.now();
  if (row.s.expiresAt.getTime() < now || now - row.s.lastSeenAt.getTime() > IDLE_MINUTES * 60_000 || !row.u.active) {
    await db.delete(sessions).where(eq(sessions.id, row.s.id));
    return null;
  }
  if (now - row.s.lastSeenAt.getTime() > 60_000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.s.id));
  }
  return { session: row.s, user: row.u };
}

export async function markTwoFactorPassed() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await db.update(sessions).set({ twoFactorPassed: true }).where(eq(sessions.id, sha(token)));
}

/** Two-factor is mandatory for the Super Admin and for finance roles. */
export async function twoFactorRequired(user: SessionUser): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const rows = await db.select({ role: memberships.role }).from(memberships).where(eq(memberships.userId, user.id));
  return rows.some((r) => r.role === "finance_officer" || r.role === "finance_clerk");
}

/** Gatekeeper for every signed-in page: password change, 2FA enrolment and 2FA check come first. */
export async function requireUser(opts: { allowPending?: boolean } = {}): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (opts.allowPending) return s.user;
  if (s.user.mustChangePassword) redirect("/account/password");
  if (s.user.totpEnabled && !s.session.twoFactorPassed) redirect("/login/verify");
  if (!s.user.totpEnabled && (await twoFactorRequired(s.user))) redirect("/account/two-factor");
  return s.user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (!u.isSuperAdmin) redirect("/");
  return u;
}

/** Context for a JV page. A user without a role in the JV gets a 404, so nothing about the JV leaks. */
export async function requireJv(code: string): Promise<Ctx> {
  const u = await requireUser();
  const ctx = await loadCtx(db, u.id, code);
  if (!ctx) notFound();
  return ctx!;
}

export async function userJvs(userId: string) {
  const { jvs } = await import("@/db/schema");
  return db.selectDistinct({ code: jvs.code, name: jvs.name }).from(memberships).innerJoin(jvs, eq(jvs.id, memberships.jvId))
    .where(and(eq(memberships.userId, userId), eq(jvs.active, true)));
}

/** Page-level permission check: shows the designed not-available page instead of an error. */
export function guard(ctx: Ctx, perm: Perm) {
  if (!can(ctx, perm)) notFound();
}
