import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db as defaultDb, type Executor } from "@/db";
import { memberships, notifications, users, type Role } from "@/db/schema";
import type { Ctx } from "./access";
import { sendMail } from "./mailer";

/** Queue in-app notifications (inside the caller's transaction). Emails go out in flushEmails() after commit. */
export async function notify(db: Executor, ctx: Ctx, opts: {
  roles?: Role[]; userIds?: string[]; title: string; body?: string; link?: string; includeSelf?: boolean;
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
    userId, jvId: ctx.jv.id, title: opts.title, body: opts.body ?? null, link: opts.link ?? null,
  })));
}

/** Sends any notifications that have not been emailed yet. Safe to call repeatedly. */
export async function flushEmails(db: Executor = defaultDb) {
  const pending = await db.select({ id: notifications.id, title: notifications.title, body: notifications.body, link: notifications.link, email: users.email })
    .from(notifications).innerJoin(users, eq(users.id, notifications.userId))
    .where(and(eq(notifications.emailed, false), isNull(notifications.readAt), ne(users.active, false)))
    .limit(50);
  for (const n of pending) {
    const url = n.link ? `${process.env.APP_URL ?? ""}${n.link}` : "";
    await sendMail(n.email, `${n.title} | Earldeign Investments`, `${n.title}\n\n${n.body ?? ""}\n\n${url}\n\nEarldeign Investments (Pvt) Ltd`);
    await db.update(notifications).set({ emailed: true }).where(eq(notifications.id, n.id));
  }
}
