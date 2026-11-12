import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listNudges } from "@/lib/jarvis/nudges";

export const dynamic = "force-dynamic";

/** Nudges for the top of Home: not dismissed, last 36 hours, newest first. */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const nudges = await listNudges();
  return NextResponse.json({ nudges }, { headers: { "Cache-Control": "no-store" } });
}
