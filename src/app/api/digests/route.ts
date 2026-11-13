import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { eveningDigest, morningDigest, weeklyScorecard } from "@/lib/digests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Send one now, from Settings: ?which=morning|evening|weekly */
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const which = req.nextUrl.searchParams.get("which");
  const result = which === "morning" ? await morningDigest() : which === "weekly" ? await weeklyScorecard() : await eveningDigest();
  return NextResponse.json(result);
}
