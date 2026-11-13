import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authUrl, googleConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

/** Starts the Google OAuth flow. Session only. */
export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login?from=/settings", req.url));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/settings?google=missing-keys", req.url));
  return NextResponse.redirect(authUrl(req.nextUrl.origin));
}
