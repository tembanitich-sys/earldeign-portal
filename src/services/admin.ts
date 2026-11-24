import { and, asc, eq, sql } from "drizzle-orm";
import type { DB, Executor } from "@/db";
import { budgets, categories, jvBankAccounts, jvs, memberships, projects, sessions, users, type Role } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assert, DomainError } from "@/lib/errors";
import { CURRENCIES, parseAmount } from "@/lib/money";
import { hashPassword, temporaryPassword } from "@/lib/passwords";
import { normalisePhone } from "@/lib/sms";
import { roleEnum } from "@/db/schema";

export type AdminCtx = { userId: string; isSuperAdmin: boolean; ip?: string | null };

function requireSuper(a: AdminCtx) {
  if (!a.isSuperAdmin) throw new DomainError("Only the Super Admin can do this.");
}

export const DEFAULT_CATEGORIES = [
  "Development", "Development / consulting", "Hosting & infrastructure", "Travel & transport",
  "Equipment (asset)", "Office equipment & supplies", "Licences & compliance", "Other",
];

export type JvInput = {
  code: string; shortCode: string; name: string; companyName: string; companyAddress?: string; companyPhone?: string; companyEmail?: string;
  vatNo?: string; bpNo?: string; tin?: string; taxClearanceNo?: string; taxClearanceExpiry?: string | null; vatRatePercent?: string;
  fundingPartner: string; currencies: string[]; acquittalDays?: string; goLiveDate?: string | null;
};

function jvValues(i: JvInput) {
  const code = i.code.trim().toLowerCase();
  assert(/^[a-z][a-z0-9-]{1,30}$/.test(code), "Subdomain code: lowercase letters, numbers and hyphens, starting with a letter (e.g. bullion).");
  assert(!["www", "portal", "admin", "api", "app", "mail"].includes(code), "That subdomain code is reserved.");
  const shortCode = i.shortCode.trim().toUpperCase();
  assert(/^[A-Z]{2,5}$/.test(shortCode), "Numbering prefix: 2 to 5 capital letters (e.g. BT).");
  assert(i.name?.trim(), "JV name is required.");
  assert(i.companyName?.trim(), "Front-facing company name is required.");
  assert(i.fundingPartner?.trim(), "Funding partner is required.");
  const currencies = i.currencies.filter((c) => (CURRENCIES as readonly string[]).includes(c));
  assert(currencies.length > 0, "Enable at least one currency.");
  const vat = (i.vatRatePercent ?? "0").trim() || "0";
  assert(/^\d{1,2}(\.\d{1,2})?$/.test(vat), "VAT rate must be a percentage such as 15.5.");
  const days = Number(i.acquittalDays ?? 14);
  assert(Number.isInteger(days) && days > 0 && days <= 90, "Acquittal period must be between 1 and 90 days.");
  return {
    code, shortCode, name: i.name.trim(), companyName: i.companyName.trim(), companyAddress: i.companyAddress?.trim() || null,
    companyPhone: i.companyPhone?.trim() || null, companyEmail: i.companyEmail?.trim() || null, vatNo: i.vatNo?.trim() || null,
    bpNo: i.bpNo?.trim() || null, tin: i.tin?.trim() || null, taxClearanceNo: i.taxClearanceNo?.trim() || null,
    taxClearanceExpiry: i.taxClearanceExpiry || null, vatRateBp: Math.round(Number(vat) * 100), fundingPartner: i.fundingPartner.trim(),
    currencies, acquittalDays: days, goLiveDate: i.goLiveDate || null,
  };
}

/** Creates an independent JV space: its own settings, numbering, books and users. Nothing is shared with other JVs. */
export async function createJv(db: DB, a: AdminCtx, input: JvInput, opts: { projects?: string[]; copyCategoriesFrom?: string | null } = {}) {
  requireSuper(a);
  const v = jvValues(input);
  return db.transaction(async (tx) => {
    const [dupe] = await tx.select().from(jvs).where(sql`${jvs.code} = ${v.code} or ${jvs.shortCode} = ${v.shortCode}`);
    if (dupe) throw new DomainError(dupe.code === v.code ? `Subdomain "${v.code}" is already used by ${dupe.name}.` : `Prefix ${v.shortCode} is already used by ${dupe.name}.`);
    const [jv] = await tx.insert(jvs).values(v).returning();
    let cats = DEFAULT_CATEGORIES;
    if (opts.copyCategoriesFrom) {
      const src = await tx.select({ name: categories.name }).from(categories).where(eq(categories.jvId, opts.copyCategoriesFrom));
      if (src.length) cats = src.map((c) => c.name);
    }
    await tx.insert(categories).values(cats.map((name) => ({ jvId: jv.id, name })));
    const projs = (opts.projects ?? ["General"]).filter(Boolean);
    if (projs.length) await tx.insert(projects).values(projs.map((name) => ({ jvId: jv.id, name })));
    await audit(tx, { actorId: a.userId, jvId: jv.id, action: "jv.create", entityType: "jv", entityId: jv.id, after: jv, ip: a.ip });
    return jv;
  });
}

export async function updateJv(db: DB, a: AdminCtx, id: string, input: JvInput) {
  requireSuper(a);
  const v = jvValues(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(jvs).where(eq(jvs.id, id));
    assert(before, "JV not found.");
    const [dupe] = await tx.select().from(jvs).where(sql`(${jvs.code} = ${v.code} or ${jvs.shortCode} = ${v.shortCode}) and ${jvs.id} <> ${id}`);
    assert(!dupe, "Another JV already uses that subdomain or prefix.");
    assert(v.shortCode === before.shortCode, "The numbering prefix cannot change once the JV exists, because document numbers already use it.");
    const [jv] = await tx.update(jvs).set(v).where(eq(jvs.id, id)).returning();
    await audit(tx, { actorId: a.userId, jvId: id, action: "jv.update", entityType: "jv", entityId: id, before, after: jv, ip: a.ip });
    return jv;
  });
}

export async function addListItem(db: DB, a: AdminCtx, jvId: string, kind: "project" | "category", name: string) {
  requireSuper(a);
  assert(name?.trim(), "Enter a name.");
  const table = kind === "project" ? projects : categories;
  await db.transaction(async (tx) => {
    const [d] = await tx.select().from(table).where(and(eq(table.jvId, jvId), sql`lower(${table.name}) = lower(${name.trim()})`));
    assert(!d, `"${name.trim()}" already exists.`);
    await tx.insert(table).values({ jvId, name: name.trim() });
    await audit(tx, { actorId: a.userId, jvId, action: `${kind}.create`, entityType: kind, after: { name: name.trim() }, ip: a.ip });
  });
}

export async function toggleListItem(db: DB, a: AdminCtx, kind: "project" | "category", id: string) {
  requireSuper(a);
  const table = kind === "project" ? projects : categories;
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(table).where(eq(table.id, id));
    assert(row, "Not found.");
    await tx.update(table).set({ active: !row.active }).where(eq(table.id, id));
    await audit(tx, { actorId: a.userId, jvId: row.jvId, action: `${kind}.${row.active ? "deactivate" : "activate"}`, entityType: kind, entityId: id, ip: a.ip });
  });
}

export async function addBankAccount(db: DB, a: AdminCtx, jvId: string, input: { accountName: string; bank: string; details: string; currency: string }) {
  requireSuper(a);
  assert(input.accountName?.trim() && input.bank?.trim() && input.details?.trim(), "Fill in account name, bank and account details.");
  assert((CURRENCIES as readonly string[]).includes(input.currency), "Choose a currency.");
  await db.transaction(async (tx) => {
    await tx.insert(jvBankAccounts).values({ jvId, accountName: input.accountName.trim(), bank: input.bank.trim(), details: input.details.trim(), currency: input.currency });
    await audit(tx, { actorId: a.userId, jvId, action: "bank_account.create", entityType: "bank_account", after: input, ip: a.ip });
  });
}

export async function removeBankAccount(db: DB, a: AdminCtx, id: string) {
  requireSuper(a);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(jvBankAccounts).where(eq(jvBankAccounts.id, id));
    assert(row, "Not found.");
    await tx.delete(jvBankAccounts).where(eq(jvBankAccounts.id, id));
    await audit(tx, { actorId: a.userId, jvId: row.jvId, action: "bank_account.remove", entityType: "bank_account", before: row, ip: a.ip });
  });
}

export async function setBudget(db: DB, a: AdminCtx, jvId: string, currency: string, amount: string) {
  requireSuper(a);
  await db.transaction(async (tx) => {
    if (!amount.trim()) {
      await tx.delete(budgets).where(and(eq(budgets.jvId, jvId), eq(budgets.currency, currency)));
    } else {
      const v = parseAmount(amount, "Monthly budget");
      assert(v >= 0, "Budget cannot be negative.");
      await tx.insert(budgets).values({ jvId, currency, monthlyAmount: v }).onConflictDoUpdate({ target: [budgets.jvId, budgets.currency], set: { monthlyAmount: v } });
    }
    await audit(tx, { actorId: a.userId, jvId, action: "budget.set", entityType: "budget", after: { currency, amount }, ip: a.ip });
  });
}

// ---------------------------------------------------------------- users

function phoneOf(input?: string | null): string | null {
  if (!input?.trim()) return null;
  const p = normalisePhone(input);
  assert(p, "Enter the mobile number as 0771 234 567 or +263 771 234 567.");
  return p;
}

export async function createUser(db: DB, a: AdminCtx, input: { email: string; name: string; title?: string; phone?: string; superAdmin?: boolean }) {
  requireSuper(a);
  const phone = phoneOf(input.phone);
  const email = input.email.trim().toLowerCase();
  assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), "Enter a valid email address.");
  assert(input.name?.trim(), "Enter the person's name.");
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [dupe] = await tx.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    assert(!dupe, "A user with that email already exists.");
    const [u] = await tx.insert(users).values({ email, name: input.name.trim(), title: input.title?.trim() || null, phone, passwordHash, isSuperAdmin: Boolean(input.superAdmin), mustChangePassword: true }).returning();
    await audit(tx, { actorId: a.userId, action: "user.create", entityType: "user", entityId: u.id, after: { email, name: u.name, phone, superAdmin: u.isSuperAdmin }, ip: a.ip });
    return { user: u, temporaryPassword: password };
  });
}

export async function resetUserPassword(db: DB, a: AdminCtx, userId: string, opts: { resetTwoFactor?: boolean } = {}) {
  requireSuper(a);
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const set: Partial<typeof users.$inferInsert> = { passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null };
    if (opts.resetTwoFactor) { set.totpEnabled = false; set.totpSecret = null; }
    await tx.update(users).set(set).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, { actorId: a.userId, action: opts.resetTwoFactor ? "user.reset_password_2fa" : "user.reset_password", entityType: "user", entityId: userId, ip: a.ip });
  });
  return password;
}

export async function setUserActive(db: DB, a: AdminCtx, userId: string, active: boolean) {
  requireSuper(a);
  assert(userId !== a.userId, "You cannot deactivate your own account.");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ active }).where(eq(users.id, userId));
    if (!active) await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, { actorId: a.userId, action: active ? "user.activate" : "user.deactivate", entityType: "user", entityId: userId, ip: a.ip });
  });
}

export async function updateUser(db: DB, a: AdminCtx, userId: string, input: { name: string; title?: string; phone?: string; smsEnabled?: boolean; email?: string }) {
  requireSuper(a);
  assert(input.name?.trim(), "Enter the person's name.");
  const phone = phoneOf(input.phone);
  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, userId));
    assert(before, "User not found.");
    let email = before.email;
    if (input.email !== undefined && input.email.trim().toLowerCase() !== before.email.toLowerCase()) {
      email = input.email.trim().toLowerCase();
      assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), "Enter a valid email address.");
      const [dupe] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email} and ${users.id} <> ${userId}`);
      assert(!dupe, "Another account already uses that email address.");
    }
    const after = { name: input.name.trim(), title: input.title?.trim() || null, phone, smsEnabled: input.smsEnabled ?? true, email };
    await tx.update(users).set(after).where(eq(users.id, userId));
    await audit(tx, {
      actorId: a.userId, action: email !== before.email ? "user.update_email" : "user.update", entityType: "user", entityId: userId,
      before: { name: before.name, title: before.title, phone: before.phone, smsEnabled: before.smsEnabled, email: before.email }, after, ip: a.ip,
    });
    return { oldEmail: before.email, newEmail: email, name: after.name };
  });
  if (result.oldEmail !== result.newEmail) {
    // Tell the old address, so a change the person did not expect is noticed. Best effort: never blocks the change.
    const { sendMail } = await import("@/lib/mailer");
    await sendMail(result.oldEmail, "Your Earldeign portal sign-in email was changed",
      `Hello ${result.name.split(" ")[0]},\n\nThe Super Admin changed the email address you use to sign in to the Earldeign portal from ${result.oldEmail} to ${result.newEmail}. Notifications now go to the new address.\n\nIf you did not expect this, contact the Super Admin straight away.\n\nEarldeign Investments (Pvt) Ltd`).catch(() => false);
  }
  return result;
}

/** A user editing their own profile. Email is deliberately excluded: it is the sign-in and the notification route. */
export async function updateOwnProfile(db: DB, userId: string, input: { name: string; title?: string; phone?: string; smsEnabled?: boolean }, ip?: string | null) {
  assert(input.name?.trim(), "Enter your name.");
  const phone = phoneOf(input.phone);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, userId));
    assert(before, "User not found.");
    const after = { name: input.name.trim(), title: input.title?.trim() || null, phone, smsEnabled: input.smsEnabled ?? true };
    await tx.update(users).set(after).where(eq(users.id, userId));
    await audit(tx, { actorId: userId, action: "user.update_own_profile", entityType: "user", entityId: userId,
      before: { name: before.name, title: before.title, phone: before.phone, smsEnabled: before.smsEnabled }, after, ip });
  });
}

/**
 * Hard rule: one person holds at most one role in a JV. Sets that role (or removes access when role is null).
 * Changes are audited; the database also enforces the rule with a unique index.
 */
export async function setRole(db: DB, a: AdminCtx, userId: string, jvId: string, role: Role | null) {
  requireSuper(a);
  assert(role === null || (roleEnum.enumValues as readonly string[]).includes(role), "Choose a role.");
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    assert(u, "User not found.");
    assert(!u.isSuperAdmin || role === null, "Super Admin accounts cannot hold JV roles. Create a separate account for this person's JV role.");
    const [jv] = await tx.select().from(jvs).where(eq(jvs.id, jvId));
    assert(jv, "JV not found.");
    const [current] = await tx.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.jvId, jvId)));
    if ((current?.role ?? null) === role) return;
    if (current) {
      await tx.delete(memberships).where(eq(memberships.id, current.id));
      await audit(tx, { actorId: a.userId, jvId, action: "role.revoke", entityType: "user", entityId: userId, before: { role: current.role, jv: jv.code }, ip: a.ip });
    }
    if (role) {
      await tx.insert(memberships).values({ userId, jvId, role });
      await audit(tx, { actorId: a.userId, jvId, action: "role.grant", entityType: "user", entityId: userId, after: { role, jv: jv.code }, ip: a.ip });
    }
  });
}

export async function grantRole(db: DB, a: AdminCtx, userId: string, jvId: string, role: Role) {
  requireSuper(a);
  assert((roleEnum.enumValues as readonly string[]).includes(role), "Choose a role.");
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    assert(u, "User not found.");
    // Segregation: a Super Admin account manages the platform and never transacts.
    assert(!u.isSuperAdmin, "Super Admin accounts cannot hold JV roles. Create a separate account for this person's JV role.");
    const [jv] = await tx.select().from(jvs).where(eq(jvs.id, jvId));
    assert(jv, "JV not found.");
    const [held] = await tx.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.jvId, jvId)));
    assert(!held || held.role === role, `This person already holds a role in ${jv.name}. One person, one role per JV: change the role instead.`);
    if (held) return;
    await tx.insert(memberships).values({ userId, jvId, role });
    await audit(tx, { actorId: a.userId, jvId, action: "role.grant", entityType: "user", entityId: userId, after: { role, jv: jv.code }, ip: a.ip });
  });
}

export async function revokeRole(db: DB, a: AdminCtx, membershipId: string) {
  requireSuper(a);
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
    assert(m, "Role not found.");
    await tx.delete(memberships).where(eq(memberships.id, membershipId));
    await audit(tx, { actorId: a.userId, jvId: m.jvId, action: "role.revoke", entityType: "user", entityId: m.userId, before: m, ip: a.ip });
  });
}

export async function listUsers(db: Executor) {
  const us = await db.select().from(users).orderBy(asc(users.name));
  const ms = await db.select({ m: memberships, jv: jvs.name, code: jvs.code }).from(memberships).innerJoin(jvs, eq(jvs.id, memberships.jvId));
  return us.map((u) => ({ user: u, roles: ms.filter((x) => x.m.userId === u.id) }));
}

// ---------------------------------------------------------------- JV logo

export const LOGO_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };
const LOGO_MAX = 1024 * 1024;

/** JV logo used in the JV's screens, its sign-in page and its PDFs. PNG or JPG only (SVG can carry scripts). */
export async function setJvLogo(db: DB, a: AdminCtx, jvId: string, file: File) {
  requireSuper(a);
  assert(file && file.size > 0, "Choose the logo file.");
  assert(file.size <= LOGO_MAX, "The logo can be at most 1 MB.");
  const ext = LOGO_MIME[file.type];
  assert(ext, "Upload the logo as PNG (preferably with a transparent background) or JPG.");
  const { storage, newKey } = await import("@/lib/storage");
  const key = await storage().put(newKey(jvId, ext).replace(/\/([^/]+)$/, "/logo-$1"), Buffer.from(await file.arrayBuffer()), file.type);
  await db.transaction(async (tx) => {
    await tx.update(jvs).set({ logoKey: key, logoMime: file.type }).where(eq(jvs.id, jvId));
    await audit(tx, { actorId: a.userId, jvId, action: "jv.logo_set", entityType: "jv", entityId: jvId, after: { filename: file.name, size: file.size }, ip: a.ip });
  });
}

export async function removeJvLogo(db: DB, a: AdminCtx, jvId: string) {
  requireSuper(a);
  await db.transaction(async (tx) => {
    await tx.update(jvs).set({ logoKey: null, logoMime: null }).where(eq(jvs.id, jvId));
    await audit(tx, { actorId: a.userId, jvId, action: "jv.logo_removed", entityType: "jv", entityId: jvId, ip: a.ip });
  });
}
