"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users, type Role } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendSms } from "@/lib/sms";
import { clientIp, requireSuperAdmin } from "@/lib/session";
import { all, fail, s } from "@/lib/actions";
import type { FormState } from "@/components/forms";
import * as A from "@/services/admin";

async function actor(): Promise<A.AdminCtx> {
  const u = await requireSuperAdmin();
  return { userId: u.id, isSuperAdmin: u.isSuperAdmin, ip: await clientIp() };
}

function jvInput(fd: FormData): A.JvInput {
  return {
    code: s(fd, "code"), shortCode: s(fd, "shortCode"), name: s(fd, "name"), companyName: s(fd, "companyName"), companyAddress: s(fd, "companyAddress"),
    companyPhone: s(fd, "companyPhone"), companyEmail: s(fd, "companyEmail"), vatNo: s(fd, "vatNo"), bpNo: s(fd, "bpNo"), tin: s(fd, "tin"),
    taxClearanceNo: s(fd, "taxClearanceNo"), taxClearanceExpiry: s(fd, "taxClearanceExpiry") || null, vatRatePercent: s(fd, "vatRatePercent"),
    fundingPartner: s(fd, "fundingPartner"), currencies: all(fd, "currencies"), acquittalDays: s(fd, "acquittalDays"), goLiveDate: s(fd, "goLiveDate") || null,
  };
}

export async function createJvAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  try {
    const projects = s(fd, "projects").split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    id = (await A.createJv(db, await actor(), jvInput(fd), { projects: projects.length ? projects : ["General"], copyCategoriesFrom: s(fd, "copyFrom") || null })).id;
  } catch (e) { return fail(e); }
  redirect(`/admin/jvs/${id}`);
}

export async function updateJvAction(_: FormState, fd: FormData): Promise<FormState> {
  try { await A.updateJv(db, await actor(), s(fd, "id"), jvInput(fd)); } catch (e) { return fail(e); }
  revalidatePath(`/admin/jvs/${s(fd, "id")}`);
  return { ok: "Settings saved." };
}

export async function listItemAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await actor();
    const kind = s(fd, "kind") as "project" | "category";
    if (s(fd, "toggle")) await A.toggleListItem(db, a, kind, s(fd, "toggle"));
    else await A.addListItem(db, a, s(fd, "id"), kind, s(fd, "name"));
  } catch (e) { return fail(e); }
  revalidatePath(`/admin/jvs/${s(fd, "id")}`);
  return { ok: "Saved." };
}

export async function bankAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await actor();
    if (s(fd, "remove")) await A.removeBankAccount(db, a, s(fd, "remove"));
    else await A.addBankAccount(db, a, s(fd, "id"), { accountName: s(fd, "accountName"), bank: s(fd, "bank"), details: s(fd, "details"), currency: s(fd, "currency") });
  } catch (e) { return fail(e); }
  revalidatePath(`/admin/jvs/${s(fd, "id")}`);
  return { ok: "Saved." };
}

export async function budgetAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await actor();
    for (const c of all(fd, "budget_ccy")) await A.setBudget(db, a, s(fd, "id"), c, s(fd, `budget_${c}`));
  } catch (e) { return fail(e); }
  revalidatePath(`/admin/jvs/${s(fd, "id")}`);
  return { ok: "Budgets saved." };
}

export async function createUserAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await actor();
    const superAdmin = s(fd, "superAdmin") === "1";
    const r = await A.createUser(db, a, { email: s(fd, "email"), name: s(fd, "name"), title: s(fd, "title"), phone: s(fd, "phone"), superAdmin });
    if (!superAdmin) for (const jvId of all(fd, "jvIds")) if (s(fd, `role_${jvId}`)) await A.setRole(db, a, r.user.id, jvId, s(fd, `role_${jvId}`) as Role);
    return { ok: `Account created for ${r.user.email}. Temporary password: ${r.temporaryPassword}\nGive it to the person directly (not by email). They must change it, and set up two-factor if their role requires it, at first sign-in. It is not shown again.` };
  } catch (e) { return fail(e); }
}

export async function userAdminAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = s(fd, "id");
  try {
    const a = await actor();
    const op = s(fd, "op");
    if (op === "grant") await A.grantRole(db, a, id, s(fd, "jvId"), s(fd, "role") as Role);
    else if (op === "revoke") await A.revokeRole(db, a, s(fd, "membershipId"));
    else if (op === "update") {
      for (const jvId of all(fd, "jvIds")) await A.setRole(db, a, id, jvId, (s(fd, `role_${jvId}`) || null) as Role | null);
      const r = await A.updateUser(db, a, id, { email: s(fd, "email"), name: s(fd, "name"), title: s(fd, "title"), phone: s(fd, "phone"), smsEnabled: s(fd, "smsEnabled") === "1" });
      revalidatePath(`/admin/users/${id}`);
      return { ok: r.oldEmail !== r.newEmail ? `Saved. Sign-in email changed to ${r.newEmail}; a notice was sent to ${r.oldEmail}.` : "Saved." };
    }
    else if (op === "testemail") {
      const [u] = await db.select().from(users).where(eq(users.id, id));
      const { testMail } = await import("@/lib/mailer");
      const r = await testMail(u.email);
      return r.ok ? { ok: `Test email sent to ${u.email}. ${r.detail}` } : { error: `The test email was not sent: ${r.detail}` };
    }
    else if (op === "testsms") {
      const [u] = await db.select().from(users).where(eq(users.id, id));
      if (!u?.phone) return { error: "Add a mobile number first." };
      if ((process.env.SMS_DRIVER ?? "off") === "off") return { error: "SMS is switched off (SMS_DRIVER is not set). Configure the gateway first." };
      const r = await sendSms(u.phone, "Test message from the Earldeign portal. No action needed.");
      return r.ok ? { ok: `Test SMS sent to ${u.phone}. Gateway reply: ${r.detail}` } : { error: `The gateway did not accept the SMS: ${r.detail}` };
    }
    else if (op === "deactivate") await A.setUserActive(db, a, id, false);
    else if (op === "activate") await A.setUserActive(db, a, id, true);
    else if (op === "reset" || op === "reset2fa") {
      const pw = await A.resetUserPassword(db, a, id, { resetTwoFactor: op === "reset2fa" });
      revalidatePath(`/admin/users/${id}`);
      return { ok: `New temporary password: ${pw}\nGive it to the person directly. They must change it at sign-in${op === "reset2fa" ? " and set up two-factor again" : ""}.` };
    }
  } catch (e) { return fail(e); }
  revalidatePath(`/admin/users/${id}`);
  return { ok: "Saved." };
}

export async function logoAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = s(fd, "id");
  try {
    const a = await actor();
    if (s(fd, "remove") === "1") await A.removeJvLogo(db, a, id);
    else {
      const f = fd.get("logo");
      if (!(f instanceof File)) return { error: "Choose the logo file." };
      await A.setJvLogo(db, a, id, f);
    }
  } catch (e) { return fail(e); }
  revalidatePath(`/admin/jvs/${id}`);
  return { ok: "Logo saved. It now appears in the JV's screens, sign-in page and documents." };
}
