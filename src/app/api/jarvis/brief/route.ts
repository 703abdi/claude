import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBriefing } from "@/lib/jarvis/data";

export const dynamic = "force-dynamic";

/** The Home briefing, rebuilt from the database on every call. */
export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const briefing = await getBriefing({ tz: req.nextUrl.searchParams.get("tz") });
  return NextResponse.json(briefing, { headers: { "Cache-Control": "no-store" } });
}
