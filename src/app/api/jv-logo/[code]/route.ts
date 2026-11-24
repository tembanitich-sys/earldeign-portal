import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jvs } from "@/db/schema";
import { storage } from "@/lib/storage";

/** Public: the JV logo is shown on the JV's sign-in page before anyone signs in. */
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [jv] = await db.select({ key: jvs.logoKey, mime: jvs.logoMime }).from(jvs).where(eq(jvs.code, code.toLowerCase()));
  if (!jv?.key || !jv.mime) return new Response("Not found", { status: 404 });
  const data = await storage().get(jv.key);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": jv.mime, "Cache-Control": "public, max-age=300", "Content-Security-Policy": "default-src 'none'" } });
}
