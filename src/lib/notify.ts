import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db as defaultDb, type Executor } from "@/db";
import { jvs, memberships, notifications, users, type Role } from "@/db/schema";
import type { Ctx } from "./access";
import { sendMail } from "./mailer";
import { sendSms, smsText } from "./sms";

/** Public base URL for links in emails and SMS. Falls back to Vercel's production URL. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "";
}

/**
 * Queue notifications inside the caller's transaction. Each one shows in the portal, is emailed, and
 * (unless sms is false) is also sent by SMS to users with a phone number. Delivery happens in
 * flushNotifications() after the transaction commits, so a failed email or SMS never blocks the work.
 */
export async function notify(db: Executor, ctx: Ctx, opts: {
  roles?: Role[]; userIds?: string[]; title: string; body?: string | null; link?: string; includeSelf?: boolean; sms?: boolean;
}) {
  const ids = new Set(opts.userIds ?? []);
  if (opts.roles?.length) {
    const rows = await db.select({ userId: memberships.userId }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.jvId, ctx.jv.id), inArray(memberships.role, opts.roles), eq(users.active, true)));
    rows.forEach((r) => ids.add(r.userId));
  }
  if (!opts.includeSelf) ids.delete(ctx.userId);
  if (ids.size === 0) return;
  await db.insert(notifications).values([...ids].map((userId) => ({
    userId, jvId: ctx.jv.id, title: opts.title, body: opts.body ?? null, link: opts.link ?? null, smsWanted: opts.sms !== false,
  })));
}

/** Sends pending emails and SMS. Safe to call repeatedly; each message goes out once. */
export async function flushNotifications(db: Executor = defaultDb) {
  // Work through the backlog in batches, oldest first; bounded so one request never runs too long.
  for (let round = 0; round < 10; round++) {
    const sent = await flushBatch(db);
    if (sent < 50) break;
  }
}

async function flushBatch(db: Executor): Promise<number> {
  const pending = await db.select({
    id: notifications.id, title: notifications.title, body: notifications.body, link: notifications.link,
    emailed: notifications.emailed, smsWanted: notifications.smsWanted, smsSent: notifications.smsSent,
    email: users.email, name: users.name, phone: users.phone, smsEnabled: users.smsEnabled, active: users.active, jvName: jvs.name,
  })
    .from(notifications).innerJoin(users, eq(users.id, notifications.userId)).leftJoin(jvs, eq(jvs.id, notifications.jvId))
    .where(and(isNull(notifications.readAt), or(eq(notifications.emailed, false), and(eq(notifications.smsWanted, true), eq(notifications.smsSent, false)))))
    .orderBy(asc(notifications.createdAt))
    .limit(50);
  const base = appUrl();
  for (const n of pending) {
    const url = n.link && base ? `${base}${n.link}` : "";
    if (!n.active) {
      await db.update(notifications).set({ emailed: true, smsSent: true }).where(eq(notifications.id, n.id));
      continue;
    }
    if (!n.emailed) {
      const text = [
        `Hello ${n.name.split(" ")[0]},`, "", n.title, n.body ? `\n${n.body}` : "", "",
        url ? `Open it in the portal: ${url}` : "Open the portal to view it.", "",
        `${n.jvName ?? "Earldeign Portfolio Portal"}`, "Earldeign Investments (Pvt) Ltd. This is an automated message; replies are not monitored.",
      ].join("\n");
      await sendMail(n.email, `${n.title}${n.jvName ? ` | ${n.jvName}` : ""}`, text);
      await db.update(notifications).set({ emailed: true }).where(eq(notifications.id, n.id));
    }
    if (n.smsWanted && !n.smsSent) {
      // Only attempt SMS when the user has a number and has not turned SMS off; otherwise mark it done.
      if (n.phone && n.smsEnabled && (process.env.SMS_DRIVER ?? "off") !== "off") await sendSms(n.phone, smsText(n.title, url), n.id);
      await db.update(notifications).set({ smsSent: true }).where(eq(notifications.id, n.id));
    }
  }
  return pending.length;
}

/** Kept for existing callers. */
export const flushEmails = flushNotifications;
