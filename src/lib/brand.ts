import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jvs } from "@/db/schema";

export type Brand = { kind: "earldeign" } | { kind: "jv"; code: string; name: string; companyName: string; logoUrl: string | null };

/** Which brand a page outside the JV area shows: the JV of the subdomain (or ?jv=), otherwise Earldeign. */
export async function brandFor(jvParam?: string | null): Promise<Brand> {
  let code = jvParam?.toLowerCase() ?? null;
  if (!code) {
    const root = process.env.ROOT_DOMAIN;
    const host = ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
    if (root && host.endsWith(`.${root}`)) {
      const sub = host.slice(0, -(root.length + 1));
      if (sub && !sub.includes(".") && !["www", "portal", "app"].includes(sub)) code = sub;
    }
  }
  if (!code || !/^[a-z][a-z0-9-]{1,30}$/.test(code)) return { kind: "earldeign" };
  const [jv] = await db.select().from(jvs).where(eq(jvs.code, code));
  if (!jv || !jv.active) return { kind: "earldeign" };
  return { kind: "jv", code: jv.code, name: jv.name, companyName: jv.companyName, logoUrl: jv.logoKey ? `/api/jv-logo/${jv.code}?v=${encodeURIComponent(jv.logoKey.slice(-12))}` : null };
}
