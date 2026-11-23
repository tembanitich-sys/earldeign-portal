import { db } from "@/db";
import { loadCtx } from "@/lib/access";
import { getSession } from "@/lib/session";
import { readAttachment } from "@/services/attachments";

export async function GET(_: Request, { params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const s = await getSession();
  if (!s || (s.user.totpEnabled && !s.session.twoFactorPassed)) return new Response("Sign in first.", { status: 401 });
  const ctx = await loadCtx(db, s.user.id, jv);
  if (!ctx) return new Response("Not found", { status: 404 });
  try {
    const { a, data } = await readAttachment(db, ctx, id);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": a.mime,
        "Content-Disposition": `${a.mime === "application/pdf" || a.mime.startsWith("image/") ? "inline" : "attachment"}; filename="${a.filename.replace(/[^\w.\- ]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
