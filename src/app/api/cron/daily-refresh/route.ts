import { NextRequest, NextResponse } from "next/server";
import { runDailyRefresh } from "@/lib/daily-refresh";

export const maxDuration = 60;

/**
 * Hit by Vercel Cron (see vercel.json) once a day around the configured
 * morning-brief time. Vercel signs cron requests with this header; we
 * also accept the same secret as a bearer token so it can be triggered
 * manually (e.g. via a local cron/launchd job) for non-Vercel deployments.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization");
  const vercelCronHeader = req.headers.get("x-vercel-cron-signature");
  const authorized = authHeader === `Bearer ${secret}` || !!vercelCronHeader;

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailyRefresh();
  return NextResponse.json(result);
}
