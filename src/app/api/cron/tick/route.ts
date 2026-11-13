import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/sync-auth";
import { runTick } from "@/lib/jarvis/nudges";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Runs the Jarvis tick: pulls sources, creates the nudges that are due and pushes them.
 * Called every few minutes by the Mac (scripts/mac/jarvis-tick.sh), Vercel Cron or
 * GitHub Actions. Auth: Bearer CRON_SECRET or Bearer AGENTS_TOKEN. */
export async function GET(req: NextRequest) {
  // Bearer only. A bare header check could be sent by anyone, and Vercel Cron already
  // sends "Authorization: Bearer CRON_SECRET" when that variable is set.
  const authorized = verifyBearerToken(req, "CRON_SECRET") || verifyBearerToken(req, "AGENTS_TOKEN");
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runTick({ tz: req.nextUrl.searchParams.get("tz") });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
