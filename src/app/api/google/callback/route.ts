import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkState, connectGoogle, syncGoogle } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Google sends the browser back here. Verifies our signed state, stores the tokens, pulls once. */
export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login?from=/settings", req.url));
  const q = req.nextUrl.searchParams;
  const back = (msg: string) => NextResponse.redirect(new URL(`/settings?google=${encodeURIComponent(msg)}`, req.url));
  if (q.get("error")) return back(`denied:${q.get("error")}`);
  if (!checkState(q.get("state"))) return back("bad-state");
  const code = q.get("code");
  if (!code) return back("no-code");
  try {
    await connectGoogle(code, req.nextUrl.origin);
    await syncGoogle({ force: true }).catch(() => null);
    return back("connected");
  } catch (err) {
    return back(`error:${err instanceof Error ? err.message : "failed"}`);
  }
}
