import { and, eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { jvs, memberships, users, type Role } from "@/db/schema";
import { DomainError } from "./errors";

export const ROLE_LABEL: Record<Role, string> = {
  cto: "CTO",
  project_coordinator: "Project Coordinator",
  finance_officer: "Finance Officer",
  finance_clerk: "Finance Clerk",
  partner_viewer: "Partner Viewer / Auditor",
  director: "Earldeign Director / Shareholder",
};

export type Perm =
  | "view_finance"
  | "create_requisition"
  | "cto_review"
  | "finance_review"
  | "disburse"
  | "submit_acquittal"
  | "approve_acquittal"
  | "create_invoice_request"
  | "issue_invoice"
  | "record_receipt"
  | "manage_clients"
  | "record_supplier_invoice"
  | "record_conversion"
  | "propose_change"
  | "authorise_change"
  | "import_history"
  | "close_period";

const MATRIX: Record<Role, Perm[]> = {
  cto: ["view_finance", "create_requisition", "cto_review", "create_invoice_request", "manage_clients",
    "record_supplier_invoice", "propose_change", "authorise_change", "import_history", "submit_acquittal"],
  project_coordinator: ["create_requisition", "create_invoice_request", "submit_acquittal"],
  finance_officer: ["view_finance", "finance_review", "approve_acquittal", "issue_invoice", "manage_clients",
    "record_supplier_invoice", "record_conversion", "propose_change", "authorise_change", "import_history", "close_period"],
  finance_clerk: ["view_finance", "disburse", "record_receipt", "submit_acquittal", "manage_clients"],
  partner_viewer: ["view_finance"],
  director: ["view_finance"],
};

/** The two parties that represent the JV for dual authorisation. */
export const AUTHORISING_ROLES: Role[] = ["cto", "finance_officer"];

export type JvRow = typeof jvs.$inferSelect;

export type Ctx = {
  userId: string;
  userName: string;
  isSuperAdmin: boolean;
  jv: JvRow;
  roles: Role[];
};

export function can(ctx: Ctx, perm: Perm): boolean {
  return ctx.roles.some((r) => MATRIX[r].includes(perm));
}

export function requirePerm(ctx: Ctx, perm: Perm): void {
  if (!can(ctx, perm)) throw new DomainError("You do not have permission for this action in this JV.");
}

/** The role a user acts in when exercising a permission (first matching role). */
export function actingRole(ctx: Ctx, perm: Perm): Role {
  const r = ctx.roles.find((role) => MATRIX[role].includes(perm));
  if (!r) throw new DomainError("You do not have permission for this action in this JV.");
  return r;
}

export function rolesWithPerm(perm: Perm): Role[] {
  return (Object.keys(MATRIX) as Role[]).filter((r) => MATRIX[r].includes(perm));
}

/**
 * Build the context for a user in a JV. Returns null when the user has no role in that JV:
 * callers must treat null as "not found" so nothing about the JV leaks.
 */
export async function loadCtx(db: Executor, userId: string, jvCode: string): Promise<Ctx | null> {
  const [jv] = await db.select().from(jvs).where(and(eq(jvs.code, jvCode), eq(jvs.active, true)));
  if (!jv) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.active) return null;
  const rows = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.jvId, jv.id)));
  if (rows.length === 0) return null;
  return { userId, userName: user.name, isSuperAdmin: user.isSuperAdmin, jv, roles: rows.map((r) => r.role) };
}
