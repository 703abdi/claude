import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "pos_session";
// Prefix-matched — only login and the browser login API.
const PUBLIC_PREFIXES = ["/login", "/api/auth/login"];
// Exact-matched — machine-to-machine endpoints that authenticate themselves
// with a bearer token (see src/lib/sync-auth.ts), not the session cookie.
// Sibling paths like /api/connectors/chatgpt/upload are NOT exempted here —
// those are browser-only and must go through the normal session check.
const PUBLIC_EXACT = ["/api/sync/obsidian", "/api/connectors/chatgpt", "/api/cron/daily-refresh"];

async function isValidSession(token: string | undefined) {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) || PUBLIC_EXACT.includes(pathname)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const valid = await isValidSession(token);

  if (!valid) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
