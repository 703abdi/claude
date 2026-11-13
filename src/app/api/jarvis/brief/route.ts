import { after, NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBriefing } from "@/lib/jarvis/data";
import { runTick } from "@/lib/jarvis/nudges";

export const dynamic = "force-dynamic";

/** The Home briefing, rebuilt from the database on every call. */
export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tz = req.nextUrl.searchParams.get("tz");
  // With Home open, every poll is also a tick: sources are pulled and due nudges are made
  // after this response goes out, so Jarvis speaks up even when the Mac job is not running.
  after(() => runTick({ tz }).catch(() => null));
  const briefing = await getBriefing({ tz, sync: false });
  return NextResponse.json(briefing, { headers: { "Cache-Control": "no-store" } });
}
