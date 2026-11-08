import { NextRequest, NextResponse } from "next/server";
import { eveningDigest, weeklyScorecard } from "@/lib/digests";

export const maxDuration = 60;

/** 9pm New York (01:00 UTC): the evening digest, plus the Sunday scorecard on Sundays. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const ok = req.headers.get("authorization") === `Bearer ${secret}` || !!req.headers.get("x-vercel-cron-signature");
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const evening = await eveningDigest();
  const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const weekly = ny.getDay() === 0 ? await weeklyScorecard() : null;
  return NextResponse.json({ evening, weekly });
}
