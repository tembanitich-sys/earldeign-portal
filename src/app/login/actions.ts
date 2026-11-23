"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { generateSecret, verify as verifyTotp } from "otplib";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/passwords";
import { clientIp, createSession, destroySession, getSession, markTwoFactorPassed } from "@/lib/session";
import { fail, s } from "@/lib/actions";
import type { FormState } from "@/components/forms";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = s(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const ip = await clientIp();
  const generic = "The email or password is not right. Check both and try again.";
  try {
    if (!email || !password) return { error: "Enter your email and password." };
    const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (!u || !u.active) {
      await audit(db, { action: "login.failed", entityType: "user", entityId: email, ip });
      return { error: generic };
    }
    if (u.lockedUntil && u.lockedUntil > new Date()) {
      return { error: `This account is locked after repeated failed sign-ins. Try again after ${u.lockedUntil.toLocaleTimeString("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit" })}, or ask the Super Admin to reset it.` };
    }
    if (!(await verifyPassword(u.passwordHash, password))) {
      const failed = u.failedLogins + 1;
      await db.update(users).set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null }).where(eq(users.id, u.id));
      await audit(db, { actorId: u.id, action: "login.failed", entityType: "user", entityId: u.id, ip });
      return { error: failed >= MAX_FAILED ? `Too many failed attempts. The account is locked for ${LOCK_MINUTES} minutes.` : generic };
    }
    await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
    await createSession(u.id, false);
    await audit(db, { actorId: u.id, action: "login.password_ok", entityType: "user", entityId: u.id, ip });
  } catch (e) {
    return fail(e);
  }
  redirect("/");
}

export async function verifyTotpAction(_: FormState, fd: FormData): Promise<FormState> {
  const s0 = await getSession();
  if (!s0) redirect("/login");
  const code = s(fd, "code").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const ok = s0.user.totpSecret ? (await verifyTotp({ secret: s0.user.totpSecret, token: code, epochTolerance: 30 })).valid : false;
  await audit(db, { actorId: s0.user.id, action: ok ? "login.2fa_ok" : "login.2fa_failed", entityType: "user", entityId: s0.user.id, ip: await clientIp() });
  if (!ok) return { error: "That code is not right or has expired. Enter the current code shown in your app." };
  await markTwoFactorPassed();
  redirect("/");
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const s0 = await getSession();
  if (!s0) redirect("/login");
  try {
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("next") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (!(await verifyPassword(s0.user.passwordHash, current))) throw new DomainError("Your current password is not right.");
    if (next !== confirm) throw new DomainError("The new passwords do not match.");
    if (next === current) throw new DomainError("Choose a password different from the current one.");
    checkPasswordPolicy(next);
    await db.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false }).where(eq(users.id, s0.user.id));
    await audit(db, { actorId: s0.user.id, action: "user.password_changed", entityType: "user", entityId: s0.user.id, ip: await clientIp() });
  } catch (e) {
    return fail(e);
  }
  redirect("/");
}

export async function startTotpEnrolment() {
  const s0 = await getSession();
  if (!s0) redirect("/login");
  if (s0.user.totpEnabled) return s0.user.totpSecret!;
  if (s0.user.totpSecret) return s0.user.totpSecret;
  const secret = generateSecret();
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, s0.user.id));
  return secret;
}

export async function confirmTotpAction(_: FormState, fd: FormData): Promise<FormState> {
  const s0 = await getSession();
  if (!s0) redirect("/login");
  const code = s(fd, "code").replace(/\s/g, "");
  if (!s0.user.totpSecret) return { error: "Reload this page to get a new setup code." };
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const ok = (await verifyTotp({ secret: s0.user.totpSecret, token: code, epochTolerance: 30 })).valid;
  if (!ok) return { error: "That code is not right. Check the time on your phone is set automatically and enter the current code." };
  await db.update(users).set({ totpEnabled: true }).where(eq(users.id, s0.user.id));
  await markTwoFactorPassed();
  await audit(db, { actorId: s0.user.id, action: "user.2fa_enabled", entityType: "user", entityId: s0.user.id, ip: await clientIp() });
  redirect("/");
}

export async function logoutAction() {
  const s0 = await getSession();
  if (s0) await audit(db, { actorId: s0.user.id, action: "logout", entityType: "user", entityId: s0.user.id });
  await destroySession();
  redirect("/login");
}
