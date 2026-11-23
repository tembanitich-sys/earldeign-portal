import { NextResponse, type NextRequest } from "next/server";

/**
 * Subdomain routing: bullion.earldeign.co.zw/<path> is served from /j/bullion/<path>.
 * Every JV also works at <any host>/j/<code>/... so a new JV is usable before its DNS record exists.
 */
const PASSTHROUGH = ["/j/", "/login", "/account", "/admin", "/api", "/_next", "/brand", "/icon", "/favicon", "/verify", "/logout"];
const RESERVED = new Set(["www", "portal", "app", "localhost"]);

export function middleware(req: NextRequest) {
  const root = process.env.ROOT_DOMAIN;
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const path = req.nextUrl.pathname;
  if (root && host.endsWith(`.${root}`) && !PASSTHROUGH.some((p) => path.startsWith(p))) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub && !sub.includes(".") && !RESERVED.has(sub)) {
      const url = req.nextUrl.clone();
      url.pathname = `/j/${sub}${path === "/" ? "" : path}`;
      return NextResponse.rewrite(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
