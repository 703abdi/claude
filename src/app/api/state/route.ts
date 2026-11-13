import { NextRequest, NextResponse } from "next/server";
import { verifyAgentOrSession } from "@/lib/sync-auth";
import { getAgentState } from "@/lib/hub-data";

export const dynamic = "force-dynamic";

/** Compact snapshot of today for agents (Jarvis reads this before a conversation).
 * Auth: Authorization: Bearer $AGENTS_TOKEN, or a signed-in session. */
export async function GET(req: NextRequest) {
  if (!(await verifyAgentOrSession(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const state = await getAgentState(req.nextUrl.searchParams.get("tz"));
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
